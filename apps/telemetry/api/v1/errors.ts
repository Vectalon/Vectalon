import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createApp, readVercelBody } from '../../src/app'

export const config = { runtime: 'nodejs20.x' }

const app = createApp()

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const response = await app.handle({ method: req.method || 'GET', url: req.url || '/v1/errors', body: await readVercelBody(req), headers: req.headers })
  res.status(response.status)
  for (const [key, value] of Object.entries(response.headers)) res.setHeader(key, value)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (response.status === 204) res.end()
  else res.json(JSON.parse(response.body))
}
