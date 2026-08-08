/**
 * `vectalon support --upload` (P0-5)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Zips (gzip) a sanitized support bundle for paying customers: the last log
 * lines, the pending error queue, the last crash report, a sanitized
 * package.json, and a listing of `.vectalon/` — stamped with a support token
 * and uploaded to the Vectalon support endpoint, which routes it to the
 * support address. The user gets a token to paste into a ticket, so a bug
 * report arrives structured without a 10-message back-and-forth.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { gzipSync } from 'zlib'
import { createHash, randomBytes } from 'crypto'
import { platform, release, arch } from 'os'
import pkg from '../../package.json'
import { getLogLines } from '../cli/logger'
import { readErrorQueue, SUPPORT_ENDPOINT, SUPPORT_RECIPIENT, queuePathFor } from './errorReporter'
import { listVectalonState } from './bundle'
import { reportError } from '../utils/safe'
import type { SupportBundle } from './types'

const SENSITIVE_KEY = /api[\s_-]?key|secret|token|password|passwd|private[\s_-]?key|_auth|authorization/i

/** Recursively sanitize a value: redact sensitive keys and secret-looking strings. */
export function sanitize(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map(v => sanitize(v))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : sanitize(v, k)
    }
    return out
  }
  if (typeof value === 'string' && SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (typeof value === 'string' && /(sk-|ghp_|AKIA|xox[baprs]-)[A-Za-z0-9_-]{12,}/.test(value)) {
    return value.replace(/(sk-|ghp_|AKIA|xox[baprs]-)[A-Za-z0-9_-]{12,}/g, '$1[REDACTED]')
  }
  // Credentials embedded in URLs (https://user:pass@host) are redacted too.
  if (typeof value === 'string' && /:\/\/[^/\s:@]+:[^/\s@]+@/.test(value)) {
    return value.replace(/(:\/\/[^/\s:@]+):[^/\s@]+@/g, '$1:[REDACTED]@')
  }
  return value
}

/** Read the project's package.json (null when missing/corrupt). */
export function readSanitizedPackageJson(root: string): Record<string, unknown> | null {
  try {
    const path = join(root, 'package.json')
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return sanitize(parsed) as Record<string, unknown>
  } catch (err) {
    reportError(err, 'support: reading package.json')
    return null
  }
}

/** A short human-usable support token, e.g. RN-A1B2C3D4. */
export function generateSupportToken(): string {
  return `RN-${randomBytes(4).toString('hex').toUpperCase()}`
}

export interface SupportBundleOptions {
  root: string
  token?: string
  /** Project queue is merged with the user-config queue. */
  includeProjectQueue?: boolean
  _now?: number
}

/** Build the full support bundle (pure; no network). */
export function buildSupportBundle(options: SupportBundleOptions): SupportBundle {
  // Merge BOTH queues: the project queue (.vectalon/telemetry-queue.json, the
  // documented path) and the user-config queue where reportError's captures
  // land when no project root is known. Dedupe by message, newest last.
  const queues = [readErrorQueue(queuePathFor()), readErrorQueue(queuePathFor(options.root))]
  const seen = new Set<string>()
  const errorQueue = queues
    .flat()
    .filter(e => (seen.has(e.message) ? false : (seen.add(e.message), true)))
  const bundle: SupportBundle = {
    schemaVersion: 1,
    token: options.token || generateSupportToken(),
    timestamp: options._now ?? Date.now(),
    version: pkg.version,
    nodeVersion: process.version,
    os: `${platform()} ${release()} ${arch()}`,
    packageJson: readSanitizedPackageJson(options.root),
    logs: getLogLines(2000),
    errorQueue,
    vectalonState: listVectalonState(options.root, 200),
    recipient: SUPPORT_RECIPIENT,
  }
  return bundle
}

export interface UploadSupportBundleOptions {
  fetchFn?: typeof fetch
  endpoint?: string
}

/**
 * gzip the bundle and POST it. Returns the support token on success (null on
 * failure — the bundle is still written to disk for manual sharing).
 */
export async function uploadSupportBundle(bundle: SupportBundle, options: UploadSupportBundleOptions = {}): Promise<string | null> {
  const fetchFn = options.fetchFn || globalThis.fetch
  const endpoint = options.endpoint || SUPPORT_ENDPOINT
  try {
    const body = gzipSync(Buffer.from(JSON.stringify(bundle), 'utf-8'))
    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body,
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    // The backend may echo the token/email back; tolerate any shape.
    return bundle.token
  } catch (err) {
    reportError(err, 'support: uploading bundle')
    return null
  }
}

/** Derive a stable token from the project path so re-uploads share a thread. */
export function tokenForRoot(root: string): string {
  const digest = createHash('sha1').update(root).digest('hex').slice(0, 8).toUpperCase()
  return `RN-${digest}`
}

/** Persist the bundle to .vectalon/support-bundle.json (for manual sharing). */
export function writeSupportBundle(root: string, bundle: SupportBundle): string {
  const path = join(root, '.vectalon', 'support-bundle.json')
  try {
    mkdirSync(join(root, '.vectalon'), { recursive: true })
    writeFileSync(path, JSON.stringify(bundle, null, 2))
  } catch (err) {
    reportError(err, 'support: writing bundle')
  }
  return path
}
