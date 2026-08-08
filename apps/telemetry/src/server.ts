/**
 * Local dev / smoke server — plain Node HTTP in front of the same core app
 * the Vercel functions use. `pnpm dev` then POST fixtures from curl:
 *
 *   curl -X POST localhost:8787/v1/errors -d '{"events":[{"message":"boom"}]}'
 *   curl localhost:8787/v1/health
 *   curl localhost:8787/            # dashboard
 */
import { createServer } from 'http'
import { createApp } from './app'

const PORT = Number(process.env.PORT || 8787)

const app = createApp()

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  try {
    const response = await app.handle({
      method: req.method || 'GET',
      url: req.url || '/',
      body: Buffer.concat(chunks),
    })
    res.writeHead(response.status, response.headers)
    res.end(response.body)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
  }
})

server.listen(PORT, () => {
  console.log(`vectalon telemetry listening on http://localhost:${PORT}`)
  console.log(`  dashboard : http://localhost:${PORT}/`)
  console.log(`  health    : http://localhost:${PORT}/v1/health`)
})
