import { NextResponse } from 'next/server'
import { isAdmin } from '../../../../../../lib/admin-auth'
import { eraseTrialIdentity } from '../../../../../../lib/trial-operations'

export const runtime = 'nodejs'

export async function DELETE(request: Request, props: { params: Promise<{ trialId: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const body = await request.json() as { reason?: unknown }
    if (typeof body.reason !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    const { trialId } = await props.params
    return await eraseTrialIdentity(trialId, body.reason)
      ? NextResponse.json({ status: 'erased' })
      : NextResponse.json({ error: 'not_found' }, { status: 404 })
  } catch { return NextResponse.json({ error: 'operation_failed' }, { status: 400 }) }
}
