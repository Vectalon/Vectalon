import { mkdirSync } from 'fs'
import { join } from 'path'
import {
  classifyJsThread,
  discoverHermesTargets,
  measureJsThreadLatency,
  runProbeCycle,
} from '../../src/daemon/hermesProbe'
import type { WsCtor, WsInstance } from '../../src/daemon/hermesProbe'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('classifyJsThread', () => {
  it('classifies latency into healthy / slow / blocked', () => {
    expect(classifyJsThread(50)).toBe('healthy')
    expect(classifyJsThread(250)).toBe('slow')
    expect(classifyJsThread(900)).toBe('blocked')
  })
})

describe('discoverHermesTargets', () => {
  it('filters Hermes pages from the Metro inspector device list', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: 'dev-1',
          description: 'Hermes',
          pageList: [
            { id: 'page-1', title: 'React Native Experimental (Improved Chrome Reloads)' },
            { id: 'page-2', title: 'Main' },
          ],
        },
        { id: 'dev-2', description: 'Safari', pageList: [{ id: 'p3', title: 'Something' }] },
      ],
    })) as unknown as typeof fetch

    const targets = await discoverHermesTargets(8081, fetchFn)

    expect(targets).toEqual([
      { deviceId: 'dev-1', pageId: 'page-1', title: 'React Native Experimental (Improved Chrome Reloads)' },
    ])
  })

  it('returns [] when Metro is unreachable', async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch

    expect(await discoverHermesTargets(8081, fetchFn)).toEqual([])
  })
})

/** A fake ws class whose message flow the test drives. */
function makeFakeWs(): {
  Ctor: WsCtor
  handlers: Map<string, (...args: unknown[]) => void>
  sent: string[]
} {
  const handlers = new Map<string, (...args: unknown[]) => void>()
  const sent: string[] = []
  const instance: WsInstance = {
    on: (event, cb) => {
      handlers.set(event, cb)
    },
    send: data => {
      sent.push(data)
    },
    close: jest.fn(),
  }
  const Ctor = (jest.fn(() => instance) as unknown) as WsCtor
  return { Ctor, handlers, sent }
}

describe('measureJsThreadLatency', () => {
  it('measures the CDP evaluate round-trip', async () => {
    const { Ctor, handlers, sent } = makeFakeWs()
    const target = { deviceId: 'dev-1', pageId: 'page-1', title: 'Hermes' }

    const promise = measureJsThreadLatency(target, { metroPort: 8081, wsFactory: async () => Ctor, timeoutMs: 1000 })
    // Let the async wsFactory resolve so the socket handlers are registered.
    await new Promise(resolve => setImmediate(resolve))

    handlers.get('open')?.()
    expect(sent[0]).toContain('Runtime.enable')
    handlers.get('message')?.('{"id":1,"result":{}}')
    expect(sent[1]).toContain('Runtime.evaluate')
    handlers.get('message')?.('{"id":2,"result":{"result":{"value":2}}}')

    const latency = await promise
    expect(typeof latency).toBe('number')
    expect(latency as number).toBeGreaterThanOrEqual(0)
  })

  it('returns null when the socket errors', async () => {
    const { Ctor, handlers } = makeFakeWs()
    const target = { deviceId: 'dev-1', pageId: 'page-1', title: 'Hermes' }

    const promise = measureJsThreadLatency(target, { metroPort: 8081, wsFactory: async () => Ctor, timeoutMs: 1000 })
    handlers.get('error')?.()

    expect(await promise).toBeNull()
  })
})

describe('runProbeCycle', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
  })

  afterEach(() => {
    cleanup(dir)
  })

  function hermesFetch(): typeof fetch {
    return (jest.fn(async () => ({
      ok: true,
      json: async () => [
        { id: 'd', description: 'iPhone 15 Pro', pageList: [{ id: 'p', title: 'React Native Experimental (Improved Chrome Reloads)' }] },
      ],
    })) as unknown) as typeof fetch
  }

  it('reports idle when no Hermes target is connected', async () => {
    const store = new ArtifactStore(dir)
    const fetchFn = (jest.fn(async () => ({ ok: true, json: async () => [] })) as unknown) as typeof fetch

    const result = await runProbeCycle({ root: dir, metroPort: 8081, store, fetchFn })

    expect(result.detected).toBe(false)
    expect(result.health).toBe('idle')
    expect(store.list()).toHaveLength(0)
  })

  it('records a blocking artifact when the classification changes', async () => {
    const store = new ArtifactStore(dir)
    const { Ctor, handlers } = makeFakeWs()
    const nowSpy = jest.spyOn(Date, 'now')

    const promise = runProbeCycle({
      root: dir,
      metroPort: 8081,
      store,
      wsFactory: async () => Ctor,
      fetchFn: hermesFetch(),
      previousHealth: null,
    })
    // Let the fetch + wsFactory promises settle so the socket handlers exist.
    await new Promise(resolve => setImmediate(resolve))

    handlers.get('open')?.()
    nowSpy.mockReturnValueOnce(1000) // t0
    handlers.get('message')?.('{"id":1}')
    nowSpy.mockReturnValueOnce(1600) // 600 ms round-trip → blocked
    handlers.get('message')?.('{"id":2}')

    const result = await promise
    nowSpy.mockRestore()

    expect(result.detected).toBe(true)
    expect(result.health).toBe('blocked')
    expect(result.latencyMs).toBe(600)
    expect(result.recordedArtifact).toBeDefined()
    expect(store.list().some(a => a.type === 'operations' && a.title.includes('blocked'))).toBe(true)
  })

  it('does not re-record when the health is unchanged', async () => {
    const store = new ArtifactStore(dir)
    const { Ctor, handlers } = makeFakeWs()
    const nowSpy = jest.spyOn(Date, 'now')

    const promise = runProbeCycle({
      root: dir,
      metroPort: 8081,
      store,
      wsFactory: async () => Ctor,
      fetchFn: hermesFetch(),
      previousHealth: 'blocked',
    })
    await new Promise(resolve => setImmediate(resolve))

    handlers.get('open')?.()
    nowSpy.mockReturnValueOnce(1000)
    handlers.get('message')?.('{"id":1}')
    nowSpy.mockReturnValueOnce(1600)
    handlers.get('message')?.('{"id":2}')

    const result = await promise
    nowSpy.mockRestore()

    expect(result.health).toBe('blocked')
    expect(result.recordedArtifact).toBeUndefined()
    expect(store.list()).toHaveLength(0)
  })
})
