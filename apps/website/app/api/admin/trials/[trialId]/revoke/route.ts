import { NextResponse } from 'next/server'
import { isAdmin } from '../../../../../../lib/admin-auth'
import { revokeTrial } from '../../../../../../lib/trial-operations'

export const runtime = 'nodejs'

export async function POST(request: Request, props: { params: Promise<{ trialId: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const body = await request.json() as { reason?: unknown }
    if (typeof body.reason !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    const { trialId } = await props.params
    return await revokeTrial(trialId, body.reason)
      ? NextResponse.json({ status: 'revoked' })
      : NextResponse.json({ error: 'not_found' }, { status: 404 })
  } catch { return NextResponse.json({ error: 'operation_failed' }, { status: 400 }) }
}
