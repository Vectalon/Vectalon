import { NextResponse } from 'next/server'
import { isAdmin } from '../../../../lib/admin-auth'
import { defaultAdminStore } from '../../../../lib/admin-store'

export const runtime = 'nodejs'

/** Full dashboard dataset (licenses, trials, customers, usage, revenue, stats). */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const store = defaultAdminStore()
  const [data, stats] = await Promise.all([store.getData(), store.stats()])
  return NextResponse.json({ ok: true, data, stats })
}
