import { reportError } from '../utils/safe'
import type { IngestResult, MetroEvent } from './types'

export interface DaemonServerOptions {
  /** Handles an ingested Metro event (never throws). */
  handleMetroEvent: (event: MetroEvent) => IngestResult
  /** Extra fields for GET /status. */
  getStatus: () => Record<string, unknown>
  log?: { info: (m: string) => void; warn: (m: string) => void; debug: (m: string) => void }
}

/**
 * The daemon's local HTTP endpoint. The generated Metro reporter POSTs build
 * events to `/ingest/metro`; `/health` and `/status` support `--status` and
 * browser dashboards. Same CORS + JSON-body pattern as the MCP HTTP transport.
 */
export class DaemonServer {
  private httpServer: import('http').Server | null = null
  private readonly options: DaemonServerOptions

  constructor(options: DaemonServerOptions) {
    this.options = options
  }

  async start(port: number): Promise<number> {
    const http = await import('http')
    const server = http.createServer((req, res) => {
      void this.handleRequest(req, res)
    })
    this.httpServer = server

    return new Promise<number>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, () => {
        const address = server.address()
        const bound = typeof address === 'object' && address ? address.port : port
        resolve(bound)
      })
    })
  }

  close(): void {
    if (this.httpServer) {
      this.httpServer.close()
      this.httpServer = null
    }
  }

  private async handleRequest(
    req: import('http').IncomingMessage,
    res: import('http').ServerResponse
  ): Promise<void> {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const path = url.pathname
      const method = req.method || 'GET'

      const sendJson = (status: number, body: unknown): void => {
        if (res.writableEnded) return
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        })
        res.end(JSON.stringify(body))
      }

      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        })
        res.end()
        return
      }

      if (method === 'GET' && path === '/health') {
        sendJson(200, { status: 'ok', pid: process.pid })
        return
      }

      if (method === 'GET' && path === '/status') {
        sendJson(200, { status: 'running', pid: process.pid, ...this.options.getStatus() })
        return
      }

      if (method === 'POST' && path === '/ingest/metro') {
        const body = await this.readJsonBody(req)
        if (!body || typeof body.type !== 'string') {
          sendJson(400, { error: 'Invalid JSON body — expected { type, ... }' })
          return
        }
        const event = this.options.handleMetroEvent(body as unknown as MetroEvent)
        sendJson(200, { ok: true, ...event })
        return
      }

      if (path === '/health' || path === '/status' || path === '/ingest/metro') {
        sendJson(405, { error: `Method ${method} not allowed on ${path}` })
        return
      }

      sendJson(404, { error: `Not found: ${path}` })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: message }))
      }
    }
  }

  /** Read + parse a JSON request body, capped to 8 MiB (bundle stats are big). */
  private async readJsonBody(req: import('http').IncomingMessage): Promise<Record<string, unknown> | null> {
    const MAX_BYTES = 8 * 1024 * 1024
    const chunks: Buffer[] = []
    let size = 0
    try {
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buf.length
        if (size > MAX_BYTES) return null
        chunks.push(buf)
      }
    } catch (err) {
      reportError(err, 'daemon: reading request body')
      return null
    }
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch (err) {
      reportError(err, 'daemon: parsing JSON request body')
      return null
    }
  }
}
