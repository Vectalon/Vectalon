/**
 * Vercel function — GET / (dashboard), rewritten from "/" via vercel.json.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createApp, readVercelBody } from '../src/app'

export const config = { runtime: 'nodejs20.x' }

const app = createApp()

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const response = await app.handle({ method: req.method || 'GET', url: req.url || '/', body: await readVercelBody(req), headers: req.headers })
  res.status(response.status)
  for (const [key, value] of Object.entries(response.headers)) res.setHeader(key, value)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (response.status === 204) {
    res.end()
  } else if (response.headers['Content-Type'] === 'text/html; charset=utf-8') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(response.body)
  } else {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.json(JSON.parse(response.body))
  }
}
