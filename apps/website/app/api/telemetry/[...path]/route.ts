import { createApp } from '../../../../../telemetry/src/app'
import { telemetryStore } from '../../../../lib/telemetry-store'

export const runtime = 'nodejs'

const app = createApp({ store: telemetryStore() })

async function handle(request: Request): Promise<Response> {
  const incoming = new URL(request.url)
  const url = `${incoming.pathname.replace(/^\/api\/telemetry/, '') || '/'}${incoming.search}`
  const headers = Object.fromEntries(request.headers.entries())
  const body = request.method === 'GET' || request.method === 'OPTIONS'
    ? Buffer.alloc(0)
    : Buffer.from(await request.arrayBuffer())
  const response = await app.handle({ method: request.method, url, body, headers })
  return new Response(response.body || null, { status: response.status, headers: response.headers })
}

export const GET = handle
export const POST = handle
export const OPTIONS = handle
