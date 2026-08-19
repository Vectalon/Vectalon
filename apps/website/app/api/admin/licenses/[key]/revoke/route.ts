import { NextResponse } from 'next/server'
import { isAdmin } from '../../../../../../lib/admin-auth'
import { defaultAdminStore } from '../../../../../../lib/admin-store'

export const runtime = 'nodejs'

/** Revoke a license instantly — POST /api/admin/licenses/[key]/revoke. */
export async function POST(_request: Request, props: { params: Promise<{ key: string }> }) {
  const params = await props.params
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const revoked = await defaultAdminStore().revokeLicense(params.key)
  if (!revoked) {
    return NextResponse.json({ ok: false, error: 'license not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
