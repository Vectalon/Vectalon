import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'zlib'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createApp, type TelemetryResponse } from '../src/app'
import { MemoryStore, FileStore, UpstashStore } from '../src/store'
import { sendSupportEmail } from '../src/email'
import type { SupportBundle } from '../src/types'

function post(app: ReturnType<typeof createApp>, path: string, body: Buffer | object, headers: Record<string, string> = {}): Promise<TelemetryResponse> {
  return app.handle({
    method: 'POST',
    url: path,
    body: Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body), 'utf-8'),
  })
}

function get(app: ReturnType<typeof createApp>, path: string): Promise<TelemetryResponse> {
  return app.handle({ method: 'GET', url: path, body: Buffer.alloc(0) })
}

const EMAILED: { bundle?: SupportBundle } = {}
function fakeEmail(bundle: SupportBundle): Promise<{ sent: boolean; error?: string }> {
  EMAILED.bundle = bundle
  return Promise.resolve({ sent: true })
}

function sampleBundle(token: string): SupportBundle {
  return {
    schemaVersion: 1,
    token,
    timestamp: 1700000000000,
    version: '0.1.16',
    nodeVersion: 'v22.14.0',
    os: 'darwin 25.6.0 arm64',
    packageJson: { name: 'app', version: '1.0.0' },
    logs: ['line 1', 'line 2'],
    errorQueue: [{ message: 'queued boom', command: 'serve' }],
    vectalonState: [{ path: 'memory.json', size: 42 }],
    recipient: 'neofaceless22@gmail.com',
  }
}

describe('telemetry app', () => {
  const store = new MemoryStore()
  const app = createApp({ store, sendEmail: fakeEmail })

  test('POST /v1/errors stores events and GET lists them', async () => {
    const res = await post(app, '/v1/errors', {
      schemaVersion: 1,
      events: [
        { message: 'boom one', command: 'serve', version: '0.1.16' },
        { message: 'boom two', command: 'init' },
        { notAnEvent: true },
      ],
    })
    assert.equal(res.status, 200)
    const body = JSON.parse(res.body) as { received: number; rejected: number; dropped: number }
    assert.equal(body.received, 2)
    assert.equal(body.rejected, 1) // the non-event was dropped by validation
    assert.equal(body.dropped, 0)

    const listed = await get(app, '/v1/errors?limit=10')
    assert.equal(listed.status, 200)
    const list = JSON.parse(listed.body) as { errors: Array<{ message: string }> }
    assert.equal(list.errors.length, 2)
    assert.equal(list.errors[0].message, 'boom one')
  })

  test('POST /v1/heartbeat records and GET lists', async () => {
    const res = await post(app, '/v1/heartbeat', {
      kind: 'daemon',
      version: '0.1.16',
      pid: 4242,
      timestamp: Date.now(),
      activeModelProvider: 'local',
      os: 'darwin',
      projectType: 'rn-cli',
    })
    assert.equal(res.status, 200)
    assert.equal(JSON.parse(res.body).ok, true)

    const listed = await get(app, '/v1/heartbeat')
    const beats = JSON.parse(listed.body) as { heartbeats: Array<{ kind: string; pid: number }> }
    assert.equal(beats.heartbeats.some(b => b.kind === 'daemon' && b.pid === 4242), true)
  })

  test('POST /v1/support accepts gzipped bundles, emails them, and lists them', async () => {
    const gz = gzipSync(Buffer.from(JSON.stringify(sampleBundle('RN-TEST0001')), 'utf-8'))
    const res = await post(app, '/v1/support', gz)
    assert.equal(res.status, 200)
    const body = JSON.parse(res.body) as { ok: boolean; token: string; emailed: boolean }
    assert.equal(body.ok, true)
    assert.equal(body.token, 'RN-TEST0001')
    assert.equal(body.emailed, true)
    assert.equal(EMAILED.bundle?.token, 'RN-TEST0001')

    const listed = await get(app, '/v1/support')
    const support = JSON.parse(listed.body) as { support: Array<{ bundle: SupportBundle; emailed: boolean; receivedAt: string }> }
    assert.equal(support.support[0].bundle.token, 'RN-TEST0001')
    assert.equal(support.support[0].emailed, true)
    assert.ok(support.support[0].receivedAt)
  })

  test('POST /v1/support also accepts plain JSON (no gzip)', async () => {
    const res = await post(app, '/v1/support', sampleBundle('RN-TEST0002'))
    assert.equal(res.status, 200)
    assert.equal(JSON.parse(res.body).token, 'RN-TEST0002')
  })

  test('rejects malformed bodies and unknown routes', async () => {
    const badErr = await post(app, '/v1/errors', { events: 'nope' })
    assert.equal(badErr.status, 200) // empty event list is tolerated
    const badBeat = await post(app, '/v1/heartbeat', { kind: 'wat' })
    assert.equal(badBeat.status, 400)
    const badSupport = await post(app, '/v1/support', { nope: true })
    assert.equal(badSupport.status, 400)
    const missing = await get(app, '/v1/nope')
    assert.equal(missing.status, 404)
    const wrongMethod = await get(app, '/v1/errors')
    assert.equal(wrongMethod.status, 200) // GET list is valid; POST on /v1/health is not
    const healthPost = await post(app, '/v1/health', {})
    assert.equal(healthPost.status, 405)
  })

  test('GET /v1/health reports counts and active clients', async () => {
    const res = await get(app, '/v1/health')
    assert.equal(res.status, 200)
    const health = JSON.parse(res.body) as { status: string; counts: { errors: number; heartbeats: number; support: number }; activeClients: number }
    assert.equal(health.status, 'ok')
    assert.equal(health.counts.errors, 2)
    assert.equal(health.counts.support, 2)
    assert.ok(health.activeClients >= 1) // the daemon heartbeat above is fresh
  })

  test('GET / renders the dashboard HTML', async () => {
    const res = await get(app, '/')
    assert.equal(res.status, 200)
    assert.match(res.headers['Content-Type'] ?? '', /text\/html/)
    assert.match(res.body, /vectalon/)
    assert.match(res.body, /Latest errors/)
  })

  test('body caps reject oversized payloads', async () => {
    const huge = Buffer.alloc(2 * 1024 * 1024, 'x')
    const res = await post(app, '/v1/errors', huge)
    assert.equal(res.status, 413)
    const hugeSupport = Buffer.alloc(9 * 1024 * 1024, 'x')
    const supportRes = await post(app, '/v1/support', hugeSupport)
    assert.equal(supportRes.status, 413)
  })

  test('rejects a gzip bomb and corrupt gzip gracefully', async () => {
    // A tiny gzip whose output would exceed the 64 MiB decompress cap.
    const bomb = gzipSync(Buffer.alloc(70 * 1024 * 1024, 0))
    const res = await post(app, '/v1/support', bomb)
    assert.equal(res.status, 400)
    const corrupt = await post(app, '/v1/support', Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff]))
    assert.equal(corrupt.status, 400)
  })

  test('GET list endpoints clamp the ?limit= parameter', async () => {
    const res = await get(app, '/v1/errors?limit=99999')
    assert.equal(res.status, 200)
    const list = JSON.parse(res.body) as { errors: unknown[] }
    assert.ok(list.errors.length <= 100)
    const badLimit = await get(app, '/v1/errors?limit=abc')
    assert.equal(badLimit.status, 200)
  })

  test('CORS headers are present on JSON responses', async () => {
    const res = await get(app, '/v1/health')
    assert.equal(res.headers['Access-Control-Allow-Origin'], '*')
  })
})

describe('telemetry admin errors route', () => {
  const store = new MemoryStore()
  const app = createApp({ store, sendEmail: fakeEmail })

  function adminGet(path: string, headers: Record<string, string> = {}): Promise<TelemetryResponse> {
    return app.handle({ method: 'GET', url: path, body: Buffer.alloc(0), headers })
  }

  test('503 when TELEMETRY_ADMIN_TOKEN is not configured', async () => {
    delete process.env.TELEMETRY_ADMIN_TOKEN
    const res = await adminGet('/v1/admin/errors', { authorization: 'Bearer whatever' })
    assert.equal(res.status, 503)
  })

  test('401 without a valid token', async () => {
    process.env.TELEMETRY_ADMIN_TOKEN = 'secret-token'
    const noAuth = await adminGet('/v1/admin/errors')
    assert.equal(noAuth.status, 401)
    const badAuth = await adminGet('/v1/admin/errors', { authorization: 'Bearer nope' })
    assert.equal(badAuth.status, 401)
  })

  test('200 with a valid bearer token returns the error list', async () => {
    process.env.TELEMETRY_ADMIN_TOKEN = 'secret-token'
    await post(app, '/v1/errors', { events: [{ message: 'admin visible', command: 'serve', clientId: 'abc' }] })
    const res = await adminGet('/v1/admin/errors', { authorization: 'Bearer secret-token' })
    assert.equal(res.status, 200)
    const body = JSON.parse(res.body) as { errors: Array<{ message: string; clientId?: string }> }
    const found = body.errors.find(e => e.message === 'admin visible')
    assert.ok(found)
    assert.equal(found.clientId, 'abc')
  })
})

describe('store backends', () => {
  test('FileStore persists across instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vectalon-tel-'))
    try {
      const a = createApp({ store: new FileStore(dir) })
      await post(a, '/v1/errors', { events: [{ message: 'persisted' }] })
      const b = createApp({ store: new FileStore(dir) })
      const listed = await get(b, '/v1/errors')
      const list = JSON.parse(listed.body) as { errors: Array<{ message: string }> }
      assert.equal(list.errors[0].message, 'persisted')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('stores cap their lists', async () => {
    const store = new MemoryStore()
    const app = createApp({ store })
    for (let i = 0; i < 600; i++) {
      await post(app, '/v1/errors', { events: [{ message: `e${i}` }] })
    }
    const counts = await store.counts()
    assert.equal(counts.errors, 500)
  })

  test('UpstashStore parses the REST response shape (unit)', async () => {
    // Wire the REST layer to a stub server, then confirm round-trip calls.
    const { createServer } = await import('node:http')
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', c => (body += c))
      req.on('end', () => {
        if (req.method === 'GET') {
          // /get/vectalon:errors -> stored JSON array or null
          const stored = (server as unknown as { _stored?: string })._stored
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ result: stored ?? null }))
        } else {
          const commands = JSON.parse(body) as unknown[][]
          if (commands[0][0] === 'set') {
            ;(server as unknown as { _stored?: string })._stored = String(commands[0][2])
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ result: ['OK'] }))
        }
      })
    })
    await new Promise<void>(resolve => server.listen(0, resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const store = new UpstashStore(`http://127.0.0.1:${port}`, 'test-token')
    try {
      await store.addError({ message: 'kv boom' })
      const errors = await store.listErrors()
      assert.equal(errors.length, 1)
      assert.equal(errors[0].message, 'kv boom')
    } finally {
      server.close()
    }
  })
})

describe('email forwarding', () => {
  test('sendSupportEmail returns not-sent without an API key', async () => {
    const result = await sendSupportEmail(sampleBundle('RN-TEST0003'), { apiKey: '' })
    assert.equal(result.sent, false)
    assert.match(result.error ?? '', /RESEND_API_KEY/)
  })

  test('surfaces an invalid Resend key as not-sent (offline-safe)', async () => {
    // No network dependency: without a real key the sender must report a
    // failure with a message, whether the request 401s or fetch itself fails.
    const result = await sendSupportEmail(sampleBundle('RN-TEST0004'), {
      apiKey: 're_test_invalid',
    })
    assert.equal(result.sent, false)
    assert.ok(result.error && result.error.length > 0)
  })

  test('delivery address comes from config, never from the bundle', async () => {
    const prevFetch = globalThis.fetch
    const prevTo = process.env.SUPPORT_TO
    process.env.SUPPORT_TO = 'ops@example.com'
    let sentTo = ''
    globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
      sentTo = JSON.parse(String(init?.body)).to
      return new Response('{"id":"x"}', { status: 200 })
    }) as typeof fetch
    try {
      const bundle = sampleBundle('RN-TEST0005')
      bundle.recipient = 'attacker@evil.example' // untrusted field
      const result = await sendSupportEmail(bundle, { apiKey: 're_test_ok' })
      assert.equal(result.sent, true)
      assert.equal(sentTo, 'ops@example.com')
    } finally {
      globalThis.fetch = prevFetch
      if (prevTo === undefined) delete process.env.SUPPORT_TO
      else process.env.SUPPORT_TO = prevTo
    }
  })
})
