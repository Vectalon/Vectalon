import { NextResponse } from 'next/server'
import { isAdmin } from '../../../../../lib/admin-auth'
import { exportTrialIdentity } from '../../../../../lib/trial-operations'

export const runtime = 'nodejs'

export async function GET(_request: Request, props: { params: Promise<{ trialId: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const record = await exportTrialIdentity((await props.params).trialId)
    return record ? NextResponse.json(record, { headers: { 'cache-control': 'private, no-store' } })
      : NextResponse.json({ error: 'not_found' }, { status: 404 })
  } catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }) }
}
