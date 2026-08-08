import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createApp, readVercelBody } from '../../src/app'

export const config = { runtime: 'nodejs20.x' }

const app = createApp()

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const response = await app.handle({ method: req.method || 'GET', url: req.url || '/v1/health', body: await readVercelBody(req) })
  res.status(response.status)
  for (const [key, value] of Object.entries(response.headers)) res.setHeader(key, value)
  res.send(response.body)
}
