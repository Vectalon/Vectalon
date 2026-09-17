import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import { resetConfig, setConfig } from '../../src/config'
import { captureError, flushErrorQueue, queuePathFor } from '../../src/diagnostics/errorReporter'
import { sendHeartbeat, startHeartbeat } from '../../src/diagnostics/heartbeat'

describe('explicit diagnostics consent', () => {
  let root: string
  let configDir: string | undefined
  let nodeEnv: string | undefined
  beforeEach(() => {
    root = createTempProject({})
    configDir = process.env.RN_VECTALON_CONFIG_DIR
    nodeEnv = process.env.NODE_ENV
    process.env.RN_VECTALON_CONFIG_DIR = join(root, 'config')
    resetConfig()
    process.env.NODE_ENV = 'production'
  })
  afterEach(() => {
    resetConfig()
    if (configDir === undefined) delete process.env.RN_VECTALON_CONFIG_DIR
    else process.env.RN_VECTALON_CONFIG_DIR = configDir
    process.env.NODE_ENV = nodeEnv
    cleanup(root)
    jest.useRealTimers()
  })

  it('does not capture or send on an unconfigured clean install', async () => {
    const fetchFn = jest.fn() as unknown as typeof fetch
    const queuePath = queuePathFor(root)
    expect(captureError(new Error('private'), 'serve', undefined, { queuePath })).toBeNull()
    expect(existsSync(queuePath)).toBe(false)
    expect(existsSync(join(root, 'config', 'client.json'))).toBe(false)
    expect(await flushErrorQueue({ queuePath, fetchFn })).toBe(0)
    expect(await sendHeartbeat({ kind: 'serve', root, fetchFn })).toBe(false)
    jest.useFakeTimers()
    const handle = startHeartbeat({ kind: 'serve', root, fetchFn, intervalMs: 10 })
    jest.advanceTimersByTime(30)
    handle.stop()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it.each([undefined, true])('global opt-out blocks stored queues and injection %s', async enabled => {
    const queuePath = queuePathFor(root)
    captureError(new Error('stored'), 'serve', undefined, { queuePath, enabled: true })
    const before = readFileSync(queuePath, 'utf-8')
    setConfig('telemetry.errors', true)
    setConfig('telemetry.heartbeat', true)
    setConfig('telemetry.enabled', false)
    const fetchFn = jest.fn() as unknown as typeof fetch
    expect(captureError(new Error('private'), 'serve', undefined, { queuePath, enabled })).toBeNull()
    expect(await flushErrorQueue({ queuePath, fetchFn, enabled })).toBe(0)
    expect(await sendHeartbeat({ kind: 'daemon', root, fetchFn, enabled })).toBe(false)
    expect(readFileSync(queuePath, 'utf-8')).toBe(before)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('errors-only consent captures and flushes but never enables heartbeats', async () => {
    setConfig('telemetry.errors', true)
    const queuePath = queuePathFor(root)
    expect(captureError(new Error('consented'), 'serve', undefined, { queuePath })).not.toBeNull()
    const fetchFn = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch
    expect(await flushErrorQueue({ queuePath, fetchFn })).toBe(1)
    expect(existsSync(queuePath)).toBe(false)
    ;(fetchFn as jest.Mock).mockClear()
    expect(await sendHeartbeat({ kind: 'serve', root, fetchFn })).toBe(false)
    jest.useFakeTimers()
    const handle = startHeartbeat({ kind: 'serve', root, fetchFn, intervalMs: 10 })
    jest.advanceTimersByTime(30)
    handle.stop()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('heartbeat-only consent sends without enabling error capture', async () => {
    setConfig('telemetry.heartbeat', true)
    const fetchFn = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch
    expect(await sendHeartbeat({ kind: 'serve', root, fetchFn })).toBe(true)
    expect(captureError(new Error('private'), 'serve', undefined, { queuePath: queuePathFor(root) })).toBeNull()
  })

  it('a global enabled flag alone is not feature consent and preserves old queues', async () => {
    const queuePath = queuePathFor(root)
    captureError(new Error('old queue'), 'serve', undefined, { queuePath, enabled: true })
    const original = readFileSync(queuePath, 'utf-8')
    setConfig('telemetry.enabled', true)
    const fetchFn = jest.fn() as unknown as typeof fetch
    expect(await flushErrorQueue({ queuePath, fetchFn })).toBe(0)
    expect(await sendHeartbeat({ kind: 'serve', root, fetchFn })).toBe(false)
    expect(captureError(new Error('private'), 'serve', undefined, { queuePath })).toBeNull()
    expect(readFileSync(queuePath, 'utf-8')).toBe(original)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
