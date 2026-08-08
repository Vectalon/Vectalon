import { createServer } from 'http'
import { createTempProject, cleanup } from '../helpers/tmp'
import { buildHeartbeatPayload, sendHeartbeat, detectProjectType } from '../../src/diagnostics/heartbeat'

describe('liveness heartbeat (P0-3)', () => {
  let root: string

  beforeEach(() => {
    root = createTempProject({
      'package.json': JSON.stringify({ dependencies: { 'react-native': '0.72.0' } }),
    })
  })

  afterEach(() => {
    cleanup(root)
  })

  it('builds a valid payload with kind, version, provider, and OS', () => {
    const payload = buildHeartbeatPayload({ kind: 'serve', root, modelProvider: 'openai (gpt-4o)' })
    expect(payload.kind).toBe('serve')
    expect(payload.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(payload.pid).toBeGreaterThan(0)
    expect(payload.os).toBeTruthy()
    expect(payload.activeModelProvider).toBe('openai (gpt-4o)')
    expect(payload.schemaVersion).toBe(1)
    expect(payload.startedAt).toBeGreaterThan(0)
    expect(payload.timestamp).toBeGreaterThanOrEqual(payload.startedAt)
  })

  it('detects the project flavor from package.json', () => {
    expect(detectProjectType(root)).toBe('rn-cli')
    const expo = createTempProject({
      'package.json': JSON.stringify({ dependencies: { expo: '50.0.0' } }),
    })
    const bare = createTempProject({ 'package.json': '{}' })
    try {
      expect(detectProjectType(expo)).toBe('expo')
      expect(detectProjectType(bare)).toBe('unknown')
    } finally {
      cleanup(expo)
      cleanup(bare)
    }
  })

  it('POSTs the heartbeat and returns true on acceptance', async () => {
    let received: unknown = null
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', c => (body += c))
      req.on('end', () => {
        received = JSON.parse(body)
        res.writeHead(200)
        res.end('{}')
      })
    })
    await new Promise<void>(resolve => server.listen(0, resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const sent = await sendHeartbeat({
      kind: 'daemon',
      root,
      modelProvider: 'local',
      fetchFn: globalThis.fetch,
      endpoint: `http://127.0.0.1:${port}/v1/heartbeat`,
      enabled: true,
    })
    server.close()

    expect(sent).toBe(true)
    expect((received as { kind: string }).kind).toBe('daemon')
    expect((received as { projectType: string }).projectType).toBe('rn-cli')
  })

  it('returns false when the endpoint is unreachable (never throws)', async () => {
    const sent = await sendHeartbeat({
      kind: 'serve',
      root,
      fetchFn: globalThis.fetch,
      endpoint: 'http://127.0.0.1:1/v1/heartbeat',
      enabled: true,
    })
    expect(sent).toBe(false)
  })

  it('respects the opt-out gate by default (no enabled override)', async () => {
    const sent = await sendHeartbeat({
      kind: 'serve',
      root,
      fetchFn: globalThis.fetch,
      endpoint: 'http://127.0.0.1:1/v1/heartbeat',
    })
    expect(sent).toBe(false)
  })
})
