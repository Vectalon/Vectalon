import { NextResponse } from 'next/server'
import { operatorAuthorization } from '../../../../../../lib/operator-host'
import { defaultAdminStore } from '../../../../../../lib/admin-store'

export const runtime = 'nodejs'

/** Revoke a license instantly — POST /api/admin/licenses/[key]/revoke. */
export async function POST(request: Request, props: { params: Promise<{ key: string }> }) {
  const params = await props.params
  const authorization = await operatorAuthorization('license:revoke', request)
  if (!authorization.ok) return NextResponse.json({ ok: false, error: authorization.code }, { status: authorization.code === 'unauthorized' ? 401 : authorization.code === 'service-unavailable' ? 503 : 403 })
  const revoked = await defaultAdminStore().revokeLicense(params.key)
  if (!revoked) {
    return NextResponse.json({ ok: false, error: 'license not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
