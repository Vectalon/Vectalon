import { NextResponse } from 'next/server'
import { operatorAuthorization } from '../../../../../../lib/operator-host'
import { revokeTrial } from '../../../../../../lib/trial-operations'

export const runtime = 'nodejs'

export async function POST(request: Request, props: { params: Promise<{ trialId: string }> }) {
  try {
    const body = await request.json() as { reason?: unknown }
    if (typeof body.reason !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    const authorization = await operatorAuthorization('license:revoke', request, body.reason)
    if (!authorization.ok) return NextResponse.json({ error: authorization.code }, { status: authorization.code === 'unauthorized' ? 401 : authorization.code === 'service-unavailable' ? 503 : 403 })
    const { trialId } = await props.params
    return await revokeTrial(trialId, body.reason)
      ? NextResponse.json({ status: 'revoked' })
      : NextResponse.json({ error: 'not_found' }, { status: 404 })
  } catch { return NextResponse.json({ error: 'operation_failed' }, { status: 400 }) }
}
