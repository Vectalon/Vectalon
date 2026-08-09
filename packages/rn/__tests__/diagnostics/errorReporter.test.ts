import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createServer } from 'http'
import { createTempProject, cleanup } from '../helpers/tmp'
import {
  captureError,
  flushErrorQueue,
  readErrorQueue,
  queuePathFor,
  MAX_QUEUED_ERRORS,
} from '../../src/diagnostics/errorReporter'

describe('error telemetry pipeline (P0-1)', () => {
  let root: string
  let queuePath: string

  beforeEach(() => {
    root = createTempProject({ 'package.json': '{}' })
    queuePath = queuePathFor(root)
  })

  afterEach(() => {
    cleanup(root)
  })

  it('captures a structured report into the queue file', () => {
    const report = captureError(new Error('boom'), 'serve', 'model provider init', {
      queuePath,
      enabled: true,
      includeStack: true,
      _now: 1700000000000,
    })
    expect(report).not.toBeNull()
    expect(report!.message).toBe('boom')
    expect(report!.command).toBe('serve')
    expect(report!.context).toBe('model provider init')
    expect(report!.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(report!.os).toBeTruthy()
    expect(report!.timestamp).toBe(1700000000000)
    expect(report!.stack).toContain('at ')
    expect(existsSync(queuePath)).toBe(true)
    expect(readErrorQueue(queuePath)).toHaveLength(1)
  })

  it('normalizes non-Error throws and dedupes by message', () => {
    captureError('plain string failure', 'init', undefined, { queuePath, enabled: true })
    captureError(new Error('plain string failure'), 'init', undefined, { queuePath, enabled: true, _now: 99 })
    const queue = readErrorQueue(queuePath)
    expect(queue).toHaveLength(1)
    // Re-capture re-stamps the timestamp.
    expect(queue[0].timestamp).toBe(99)
  })

  it('caps the queue at MAX_QUEUED_ERRORS, keeping the newest', () => {
    for (let i = 0; i < MAX_QUEUED_ERRORS + 10; i++) {
      captureError(new Error(`err-${i}`), 'bench', undefined, { queuePath, enabled: true, _now: i })
    }
    const queue = readErrorQueue(queuePath)
    expect(queue).toHaveLength(MAX_QUEUED_ERRORS)
    expect(queue[0].message).toBe('err-10')
  })

  it('flushes the queue to the endpoint and clears it on success', async () => {
    captureError(new Error('flush me'), 'selftest', undefined, { queuePath, enabled: true })

    const chunks: Buffer[] = []
    let receivedPath = ''
    const server = createServer((req, res) => {
      receivedPath = req.url || ''
      req.on('data', c => chunks.push(c as Buffer))
      req.on('end', () => {
        res.writeHead(200)
        res.end('{}')
      })
    })
    await new Promise<void>(resolve => server.listen(0, resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const flushed = await flushErrorQueue({
      queuePath,
      enabled: true,
      endpoint: `http://127.0.0.1:${port}/v1/errors`,
    })
    server.close()

    expect(flushed).toBe(1)
    expect(receivedPath).toBe('/v1/errors')
    const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
    expect(body.events).toHaveLength(1)
    expect(body.events[0].message).toBe('flush me')
    expect(existsSync(queuePath)).toBe(false)
  })

  it('keeps the queue when the endpoint rejects or is unreachable', async () => {
    captureError(new Error('kept'), 'serve', undefined, { queuePath, enabled: true })

    const server = createServer((_req, res) => {
      res.writeHead(500)
      res.end('nope')
    })
    await new Promise<void>(resolve => server.listen(0, resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const flushed = await flushErrorQueue({
      queuePath,
      enabled: true,
      endpoint: `http://127.0.0.1:${port}/v1/errors`,
    })
    server.close()

    expect(flushed).toBe(0)
    expect(existsSync(queuePath)).toBe(true)
    expect(readErrorQueue(queuePath)).toHaveLength(1)
  })

  it('respects the enabled=false gate', () => {
    const report = captureError(new Error('nope'), 'init', undefined, { queuePath, enabled: false })
    expect(report).toBeNull()
    expect(existsSync(queuePath)).toBe(false)
  })

  it('flushes nothing when the queue is empty or disabled', async () => {
    expect(await flushErrorQueue({ queuePath, enabled: true })).toBe(0)
    captureError(new Error('kept'), 'serve', undefined, { queuePath, enabled: true })
    expect(await flushErrorQueue({ queuePath, enabled: false })).toBe(0)
    expect(existsSync(queuePath)).toBe(true)
  })

  it('keeps the queue when the transport throws (never drops events)', async () => {
    captureError(new Error('kept2'), 'serve', undefined, { queuePath, enabled: true })
    const flushed = await flushErrorQueue({
      queuePath,
      enabled: true,
      fetchFn: (() => Promise.reject(new Error('network down'))) as typeof fetch,
    })
    expect(flushed).toBe(0)
    expect(readErrorQueue(queuePath)).toHaveLength(1)
  })

  it('returns an empty list for a missing, corrupt, or non-array queue file', () => {
    expect(readErrorQueue(queuePath)).toHaveLength(0)
    mkdirSync(join(queuePath, '..'), { recursive: true })
    writeFileSync(queuePath, '{ nope', 'utf-8')
    expect(readErrorQueue(queuePath)).toHaveLength(0)
    writeFileSync(queuePath, JSON.stringify({ not: 'an array' }), 'utf-8')
    expect(readErrorQueue(queuePath)).toHaveLength(0)
    writeFileSync(queuePath, JSON.stringify([{ message: 'ok' }, { nope: true }]), 'utf-8')
    expect(readErrorQueue(queuePath)).toHaveLength(1)
  })

  it('uses the user config dir queue when no root is given', () => {
    // RN_VECTALON_CONFIG_DIR is honored by configDirPath.
    process.env.RN_VECTALON_CONFIG_DIR = join(root, 'config')
    const fallback = queuePathFor()
    expect(fallback.endsWith(join('config', 'telemetry-queue.json'))).toBe(true)
    delete process.env.RN_VECTALON_CONFIG_DIR
  })
})
