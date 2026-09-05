import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { issueGitHubTrial } from '../../../../lib/trial-issuance'

export const runtime = 'nodejs'

/** Internal target for verified GitHub device-flow trial issuance. */
export async function POST(request: Request) {
  const expected = process.env.VECTALON_CONTROL_PLANE_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!expected || !supplied || !timingSafeEqual(createHash('sha256').update(expected).digest(), createHash('sha256').update(supplied).digest())) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 })
  }
  if (Number(request.headers.get('content-length') ?? 0) > 20_000) return NextResponse.json({ status: 'invalid_request' }, { status: 413 })
  try {
    const body = await request.json() as { accessToken?: unknown; requestId?: unknown; product?: unknown; tier?: unknown }
    if (typeof body.accessToken !== 'string' || typeof body.requestId !== 'string' || body.product !== 'rn' || body.tier !== 'pro') {
      return NextResponse.json({ status: 'invalid_request' }, { status: 400 })
    }
    const result = await issueGitHubTrial(body.accessToken, body.requestId)
    if (result.status === 'issued') return NextResponse.json(result)
    return NextResponse.json(result, { status: result.status === 'replay' ? 409 : 403 })
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503 })
  }
}
