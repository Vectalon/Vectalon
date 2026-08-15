/**
 * LocalServer — zero-dependency static server for build sharing (Phase 3).
 *
 * Built on node's `http` module (the package deliberately has no express
 * dependency): serves the generated install page at `/`, the artifact under
 * `/downloads/<buildId>.<ext>`, and the raw store files. Optional
 * `--expires` auto-shutdown; access log to `.vectalon/share/access.log`.
 */

import { createServer } from 'http'
import { mkdirSync, createReadStream, appendFileSync, statSync } from 'fs'
import { join, extname, resolve } from 'path'
import type { BuildManifest } from '../archive/types'
import { renderInstallPage } from './PortalPage'

export interface ShareServerOptions {
  build: BuildManifest
  port: number
  host?: string
  storeRoot: string
  expiresMs?: number
}

export interface ShareServerHandle {
  url: string
  port: number
  close: () => Promise<void>
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.ipa': 'application/octet-stream',
  '.apk': 'application/vnd.android.package-archive',
  '.aab': 'application/octet-stream',
  '.sha256': 'text/plain',
  '.png': 'image/png',
}

/** Resolve an available port by binding 0 and reading the assigned port. */
export function resolvePort(preferred: number): Promise<number> {
  return new Promise((resolvePortCb, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(preferred, () => {
      const addr = probe.address()
      const port = typeof addr === 'object' && addr ? addr.port : preferred
      probe.close(() => resolvePortCb(port))
    })
  })
}

export async function startShareServer(options: ShareServerOptions): Promise<ShareServerHandle> {
  const port = await resolvePort(options.port)
  const host = options.host || '127.0.0.1'
  const build = options.build
  const baseUrl = `http://${host}:${port}`

  const indexHtml = renderInstallPage({
    build,
    baseUrl,
  })

  // Access log.
  const logFile = join(options.storeRoot, '.vectalon', 'share', 'access.log')
  mkdirSync(join(options.storeRoot, '.vectalon', 'share'), { recursive: true })

  const artifactPath = resolve(options.storeRoot, build.artifactPath)
  const downloadUrl = `/downloads/${build.buildId}.${build.artifactType}`

  const server = createServer((req, res) => {
    const url = (req.url || '/').split('?')[0]
    const t = new Date().toISOString()
    appendFileSync(logFile, `${t} ${req.method} ${url}\n`)

    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Access-Control-Allow-Origin': '*' })
      res.end(indexHtml)
      return
    }
    if (url === downloadUrl && existsSafe(artifactPath)) {
      serveFile(res, artifactPath, MIME[extname(artifactPath)] || 'application/octet-stream')
      return
    }
    // Serve the checksum sidecar too.
    const shaUrl = `/downloads/${build.buildId}.sha256`
    const shaPath = `${artifactPath}.sha256`
    if (url === shaUrl && existsSafe(shaPath)) {
      serveFile(res, shaPath, MIME['.sha256'])
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  })

  if (options.expiresMs) {
    const timer = setTimeout(() => {
      server.close()
    }, options.expiresMs)
    timer.unref?.()
  }

  await new Promise<void>(resolveReady => server.listen(port, host, () => resolveReady()))

  return {
    url: baseUrl,
    port,
    close: () =>
      new Promise<void>(resolveClosed => {
        server.close(() => resolveClosed())
      }),
  }
}

function existsSafe(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

function serveFile(res: import('http').ServerResponse, filePath: string, mime: string): void {
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': statSync(filePath).size,
    'Access-Control-Allow-Origin': '*',
  })
  createReadStream(filePath).pipe(res)
}
