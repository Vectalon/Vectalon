import { createServer } from 'http'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import {
  buildSupportBundle,
  uploadSupportBundle,
  sanitize,
  tokenForRoot,
  readSanitizedPackageJson,
} from '../../src/diagnostics/support'
import { captureError, queuePathFor, SUPPORT_RECIPIENT } from '../../src/diagnostics/errorReporter'

describe('support bundle upload (P0-5)', () => {
  let root: string

  beforeEach(() => {
    root = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0' },
        apiKey: 'sk-test-1234567890abcdef',
        nested: { clientSecret: 'super-secret', fine: 'keep-me' },
        scripts: { start: 'expo start' },
      }),
      '.vectalon/rn-vectalon.json': JSON.stringify({ version: '0.1.0', projectName: 'app', rnVersion: '0.72.0', initializedAt: Date.now(), modelProvider: 'local' }),
    })
  })

  afterEach(() => {
    cleanup(root)
  })

  it('redacts secrets recursively and keeps innocuous data', () => {
    const pkg = readSanitizedPackageJson(root)
    expect(pkg!.name).toBe('app')
    expect(pkg!.apiKey).toBe('[REDACTED]')
    expect((pkg!.nested as Record<string, unknown>).clientSecret).toBe('[REDACTED]')
    expect((pkg!.nested as Record<string, unknown>).fine).toBe('keep-me')
  })

  it('scrubs known secret prefixes inline', () => {
    expect(sanitize('use ghp_abcdefghijklmnop here')).toBe('use ghp_[REDACTED] here')
    // A value that is itself a secret-shaped string is redacted too.
    expect(sanitize('sk-test-1234567890abcdef')).toBe('sk-[REDACTED]')
    // Credentials embedded in URLs are redacted.
    expect(sanitize('https://user:hunter2@example.com/repo.git')).toBe('https://user:[REDACTED]@example.com/repo.git')
  })

  it('generates tokens that round-trip with tokenForRoot', () => {
    const a = tokenForRoot(root)
    const b = tokenForRoot(root)
    expect(a).toBe(b)
    expect(a).toMatch(/^RN-[0-9A-F]{8}$/)
  })

  it('builds a bundle with token, recipient, logs, and the merged error queue', () => {
    // Isolate the user config dir so the merged-queue capture stays in tmp.
    process.env.RN_VECTALON_CONFIG_DIR = join(root, 'user-config')
    const queuePath = queuePathFor(root)
    captureError(new Error('support boom'), 'selftest', undefined, { queuePath, enabled: true })
    // The config-dir queue (where reportError captures land) is merged in too.
    const configQueue = queuePathFor()
    captureError(new Error('config dir boom'), 'selftest', undefined, { queuePath: configQueue, enabled: true })
    const token = tokenForRoot(root)
    const bundle = buildSupportBundle({ root, token })
    expect(bundle.token).toBe(token)
    expect(bundle.token).toMatch(/^RN-[0-9A-F]{8}$/)
    expect(bundle.recipient).toBe(SUPPORT_RECIPIENT)
    expect(bundle.version).toMatch(/^\d+\.\d+\.\d+/)
    const messages = bundle.errorQueue.map(e => e.message)
    expect(messages).toContain('support boom')
    expect(messages).toContain('config dir boom')
    expect(Array.isArray(bundle.logs)).toBe(true)
  })

  it('uploads a gzipped bundle and returns the token', async () => {
    let receivedPath = ''
    let encoding = ''
    const chunks: Buffer[] = []
    const server = createServer((req, res) => {
      receivedPath = req.url || ''
      encoding = String(req.headers['content-encoding'] || '')
      req.on('data', c => chunks.push(c as Buffer))
      req.on('end', () => {
        res.writeHead(200)
        res.end('{"ok":true}')
      })
    })
    await new Promise<void>(resolve => server.listen(0, resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const bundle = buildSupportBundle({ root })
    const uploaded = await uploadSupportBundle(bundle, { endpoint: `http://127.0.0.1:${port}/v1/support` })
    server.close()

    expect(uploaded).toBe(bundle.token)
    expect(receivedPath).toBe('/v1/support')
    expect(encoding).toBe('gzip')
    const raw = Buffer.concat(chunks)
    expect(raw[0]).toBe(0x1f) // gzip magic
    expect(raw[1]).toBe(0x8b)
  })

  it('returns null when the upload is rejected (bundle preserved for manual sharing)', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(503)
      res.end('down')
    })
    await new Promise<void>(resolve => server.listen(0, resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const bundle = buildSupportBundle({ root })
    const uploaded = await uploadSupportBundle(bundle, { endpoint: `http://127.0.0.1:${port}/v1/support` })
    server.close()
    expect(uploaded).toBeNull()
  })
})
