import { NextResponse } from 'next/server'
import { defaultAdminStore } from '../../../lib/admin-store'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** SDK waitlist signup — POST /api/waitlist { email, product }. */
export async function POST(request: Request) {
  let body: { email?: string; product?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
  }

  // Honeypot: bots fill hidden fields — reject silently so they can't spam
  // the store (every write rewrites the whole document).
  const hp = (body as { hp?: unknown }).hp
  if (hp) return NextResponse.json({ ok: true, added: false })

  const email = body.email?.trim().toLowerCase()
  const product =
    typeof body.product === 'string' && body.product.trim() ? body.product.trim() : 'rn'
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'a valid email is required' }, { status: 400 })
  }
  if (product.length > 40) {
    return NextResponse.json({ ok: false, error: 'invalid product' }, { status: 400 })
  }

  const added = await defaultAdminStore().addWaitlist(email, product)
  return NextResponse.json({ ok: true, added })
}
