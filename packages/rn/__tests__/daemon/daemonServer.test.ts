import { DaemonServer } from '../../src/daemon/daemonServer'
import type { IngestResult, MetroEvent } from '../../src/daemon/types'

describe('DaemonServer', () => {
  let server: DaemonServer
  let port: number
  const handleMetroEvent = jest.fn((_event: MetroEvent): IngestResult => ({
    kind: 'bundle_done',
    insights: ['proactive tip'],
    artifacts: ['snapshot'],
  }))
  const getStatus = jest.fn(() => ({ events: 3 }))

  beforeEach(async () => {
    handleMetroEvent.mockClear()
    server = new DaemonServer({ handleMetroEvent, getStatus })
    port = await server.start(0)
  })

  afterEach(() => {
    server.close()
  })

  it('serves health and status', async () => {
    const health = (await fetch(`http://127.0.0.1:${port}/health`).then(r => r.json())) as { status?: string }
    expect(health.status).toBe('ok')

    const status = (await fetch(`http://127.0.0.1:${port}/status`).then(r => r.json())) as {
      status?: string
      events?: number
    }
    expect(status.status).toBe('running')
    expect(status.events).toBe(3)
  })

  it('ingests a Metro event', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/ingest/metro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'bundle_build_done', platform: 'ios', bundleStats: { modules: [] } }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok?: boolean; insights?: string[]; kind?: string }
    expect(body.ok).toBe(true)
    expect(body.kind).toBe('bundle_done')
    expect(body.insights).toEqual(['proactive tip'])
    expect(handleMetroEvent).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed bodies and unknown paths', async () => {
    const bad = await fetch(`http://127.0.0.1:${port}/ingest/metro`, {
      method: 'POST',
      body: 'not json',
    })
    expect(bad.status).toBe(400)

    const missingType = await fetch(`http://127.0.0.1:${port}/ingest/metro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foo: 1 }),
    })
    expect(missingType.status).toBe(400)

    const notFound = await fetch(`http://127.0.0.1:${port}/nope`)
    expect(notFound.status).toBe(404)

    const methodNotAllowed = await fetch(`http://127.0.0.1:${port}/health`, { method: 'POST' })
    expect(methodNotAllowed.status).toBe(405)
  })
})
