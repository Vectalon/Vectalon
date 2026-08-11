/**
 * Core application — transport-agnostic request dispatch.
 *
 * Handlers take a tiny request shape ({ method, url, body: Buffer }) and
 * return { status, headers, body }. The same handlers back the local dev
 * server (src/server.ts) and the Vercel functions (api/*).
 *
 * Routes:
 *   POST /v1/errors     { schemaVersion, events: ErrorReport[] }
 *   POST /v1/heartbeat  HeartbeatPayload
 *   POST /v1/support    gzipped (or plain) SupportBundle JSON
 *   GET  /v1/health     { status, counts, activeClients }
 *   GET  /v1/errors|/v1/heartbeat|/v1/support   recent lists
 *   GET  /              dashboard HTML
 */
import { gunzipSync } from 'zlib'
import { sendSupportEmail, DEFAULT_SUPPORT_TO } from './email'
import { renderDashboard } from './dashboard'
import { defaultStore } from './store'
import {
  activeHeartbeats,
  isErrorEvent,
  isHeartbeat,
  isSupportBundle,
  type HeartbeatPayload,
  type Store,
  type SupportRecord,
  type SupportBundle,
} from './types'

export interface TelemetryRequest {
  method: string
  url: string
  body: Buffer
  /** Node-style headers (lowercased keys) — optional, used by admin routes. */
  headers?: Record<string, string | string[] | undefined>
}

export interface TelemetryResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface AppOptions {
  store?: Store
  /** Injectable email sender (tests). Defaults to Resend. */
  sendEmail?: (bundle: SupportBundle) => Promise<{ sent: boolean; error?: string }>
  now?: () => number
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Content-Encoding',
}

const BODY_CAPS = {
  errors: 1024 * 1024, // 1 MiB
  heartbeat: 128 * 1024, // 128 KiB
  support: 8 * 1024 * 1024, // 8 MiB (gzipped bundle)
  maxEvents: 200,
} as const

/** Cap the decompressed support bundle so a gzip bomb cannot OOM the function. */
const MAX_DECOMPRESSED_SUPPORT = 64 * 1024 * 1024 // 64 MiB

function json(status: number, body: unknown): TelemetryResponse {
  return { status, headers: JSON_HEADERS, body: JSON.stringify(body) }
}

function text(status: number, body: string, headers: Record<string, string> = {}): TelemetryResponse {
  return { status, headers, body }
}

function pathOf(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname
  } catch {
    return url.split('?')[0]
  }
}

export function createApp(options: AppOptions = {}) {
  const store = options.store || defaultStore()
  const now = options.now || Date.now
  // The delivery address comes ONLY from config — bundle.recipient is
  // untrusted client data and must never drive where the backend emails.
  const sendEmail =
    options.sendEmail ||
    ((bundle: SupportBundle) =>
      sendSupportEmail(bundle, {
        to: process.env.SUPPORT_TO || DEFAULT_SUPPORT_TO,
      }))

  async function handleErrors(method: string, url: string, body: Buffer): Promise<TelemetryResponse> {
    if (method === 'GET') {
      const limit = clampLimit(url, 100)
      return json(200, { errors: await store.listErrors(limit) })
    }
    if (method !== 'POST') return json(405, { error: `method ${method} not allowed` })
    if (body.length > BODY_CAPS.errors) return json(413, { error: 'payload too large' })
    const parsed = parseJson(body)
    const rawEvents = parsed && Array.isArray((parsed as { events?: unknown }).events)
      ? (parsed as { events: unknown[] }).events
      : []
    const valid = rawEvents.filter(isErrorEvent)
    const rejected = rawEvents.length - valid.length
    const accepted = valid.slice(-BODY_CAPS.maxEvents)
    for (const event of accepted) {
      try {
        await store.addError(event)
      } catch (err) {
        return json(500, { error: err instanceof Error ? err.message : String(err) })
      }
    }
    return json(200, { ok: true, received: accepted.length, rejected, dropped: valid.length - accepted.length })
  }

  async function handleHeartbeat(method: string, url: string, body: Buffer): Promise<TelemetryResponse> {
    if (method === 'GET') {
      const limit = clampLimit(url, 100)
      return json(200, { heartbeats: await store.listHeartbeats(limit) })
    }
    if (method !== 'POST') return json(405, { error: `method ${method} not allowed` })
    if (body.length > BODY_CAPS.heartbeat) return json(413, { error: 'payload too large' })
    const beat = parseJson(body)
    if (!isHeartbeat(beat)) return json(400, { error: 'expected a heartbeat payload with kind serve|daemon' })
    await store.recordHeartbeat(beat)
    return json(200, { ok: true })
  }

  async function handleSupport(method: string, url: string, body: Buffer): Promise<TelemetryResponse> {
    if (method === 'GET') {
      const limit = clampLimit(url, 100)
      return json(200, { support: await store.listSupport(limit) })
    }
    if (method !== 'POST') return json(405, { error: `method ${method} not allowed` })
    if (body.length > BODY_CAPS.support) return json(413, { error: 'payload too large' })
    const decoded = isGzip(body) ? safeGunzip(body) : body
    if (decoded === null) return json(400, { error: 'invalid gzip body' })
    const bundle = parseJson(decoded)
    if (!isSupportBundle(bundle)) return json(400, { error: 'expected a support bundle with a token' })

    const email = await sendEmail(bundle)
    const record: SupportRecord = {
      bundle,
      receivedAt: new Date(now()).toISOString(),
      emailed: email.sent,
      ...(email.error ? { emailError: email.error } : {}),
    }
    try {
      await store.saveSupport(record)
    } catch (err) {
      return json(500, { error: err instanceof Error ? err.message : String(err) })
    }
    return json(200, {
      ok: true,
      token: bundle.token,
      recipient: process.env.SUPPORT_TO || DEFAULT_SUPPORT_TO,
      emailed: email.sent,
    })
  }

  async function handleHealth(): Promise<TelemetryResponse> {
    const [counts, beats] = await Promise.all([store.counts(), store.listHeartbeats(200)])
    return json(200, {
      status: 'ok',
      now: now(),
      counts,
      activeClients: activeHeartbeats(beats, now()).length,
    })
  }

  async function handleDashboard(): Promise<TelemetryResponse> {
    const html = await renderDashboard(store)
    return text(200, html, { 'Content-Type': 'text/html; charset=utf-8' })
  }

  /**
   * Admin-only error listing — GET /v1/admin/errors?limit=500.
   * Authenticated with `Authorization: Bearer <TELEMETRY_ADMIN_TOKEN>` (or
   * `?token=…` for tooling that can't set headers). Powers the admin error
   * dashboard in the website app.
   */
  async function handleAdminErrors(
    method: string,
    url: string,
    headers?: TelemetryRequest['headers']
  ): Promise<TelemetryResponse> {
    if (method !== 'GET') return json(405, { error: `method ${method} not allowed` })
    const token = process.env.TELEMETRY_ADMIN_TOKEN
    if (!token) return json(503, { error: 'TELEMETRY_ADMIN_TOKEN not configured' })
    let provided = ''
    const auth = headers?.authorization
    if (typeof auth === 'string') provided = auth.replace(/^Bearer\s+/i, '').trim()
    if (!provided) {
      try {
        provided = new URL(url, 'http://localhost').searchParams.get('token') ?? ''
      } catch {
        // fall through
      }
    }
    if (!provided || provided !== token) return json(401, { error: 'unauthorized' })
    const errors = await store.listErrors(500)
    return json(200, { errors })
  }

  async function handle(request: TelemetryRequest): Promise<TelemetryResponse> {
    const path = pathOf(request.url)
    try {
      switch (path) {
        case '/':
          return await handleDashboard()
        case '/v1/errors':
          return await handleErrors(request.method, request.url, request.body)
        case '/v1/admin/errors':
          return await handleAdminErrors(request.method, request.url, request.headers)
        case '/v1/heartbeat':
          return await handleHeartbeat(request.method, request.url, request.body)
        case '/v1/support':
          return await handleSupport(request.method, request.url, request.body)
        case '/v1/health':
          if (request.method !== 'GET') return json(405, { error: `method ${request.method} not allowed` })
          return await handleHealth()
        default:
          return json(404, { error: `not found: ${path}` })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[telemetry] ${path} ${request.method} → ${message}`)
      return json(500, { error: message })
    }
  }

  return { handle, store }
}

function parseJson(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString('utf-8'))
  } catch {
    return null
  }
}

function isGzip(body: Buffer): boolean {
  return body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b
}

function safeGunzip(body: Buffer): Buffer | null {
  try {
    // maxOutputLength turns a gzip bomb into an ERR_BUFFER_TOO_LARGE instead
    // of unbounded decompression (which would OOM the serverless function).
    return gunzipSync(body, { maxOutputLength: MAX_DECOMPRESSED_SUPPORT })
  } catch {
    return null
  }
}

function clampLimit(url: string, max: number): number {
  try {
    const n = Number(new URL(url, 'http://localhost').searchParams.get('limit') ?? '')
    if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), max)
  } catch {
    // fall through
  }
  return 20
}

/**
 * Read a Vercel request body into a Buffer. Vercel auto-parses JSON into
 * req.body; binary (gzipped) payloads arrive as a Buffer or a raw stream.
 */
export async function readVercelBody(req: { body?: unknown } & AsyncIterable<unknown>): Promise<Buffer> {
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf-8')
  if (Buffer.isBuffer(req.body)) return req.body
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body), 'utf-8')
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string | Uint8Array))
  }
  return Buffer.concat(chunks)
}
