import { NextResponse } from 'next/server'
import { isAdmin } from '../../../../lib/admin-auth'
import { defaultAdminStore, type Tier } from '../../../../lib/admin-store'

export const runtime = 'nodejs'

const VALID_TIERS: Tier[] = ['free', 'pro', 'all-access', 'team', 'enterprise']

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const { licenses } = await defaultAdminStore().getData()
  return NextResponse.json({ ok: true, licenses })
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  let body: { tier?: string; email?: string; githubUsername?: string; seats?: number; days?: number; product?: string; capabilityIds?: string[]; experimentalOptIn?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
  }

  if (!body.email?.trim() || !body.tier || !VALID_TIERS.includes(body.tier as Tier)) {
    return NextResponse.json({ ok: false, error: 'email and a valid tier are required' }, { status: 400 })
  }

  try {
    const license = await defaultAdminStore().issueLicense({
      tier: body.tier as Tier,
      email: body.email.trim(),
      githubUsername: body.githubUsername?.trim() || undefined,
      seats: body.seats ? Math.max(1, Math.floor(body.seats)) : 1,
      days: body.days ? Math.max(1, Math.floor(body.days)) : 365,
      product: body.product,
      capabilityIds: body.capabilityIds,
      experimentalOptIn: body.experimentalOptIn,
    })
    return NextResponse.json({ ok: true, license })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'license grant rejected'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
