import { NextResponse } from 'next/server'
import {
  verifyWebhookSignature,
  parseWebhookEvent,
  handleLemonSqueezyEvent,
} from '../../../../../lib/lemon-squeezy'
import { defaultAdminStore } from '../../../../../lib/admin-store'

export const runtime = 'nodejs'

/**
 * Lemon Squeezy webhook — POST /api/v1/webhooks/lemon-squeezy.
 *
 * Verifies the HMAC X-Signature over the raw body, then applies the license
 * lifecycle (order_created → mint + email, subscription_* → sync, order_refunded
 * → instant revoke). Idempotent per event id, so retries never double-mint.
 */
export async function POST(request: Request) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'LEMONSQUEEZY_WEBHOOK_SECRET not configured' },
      { status: 503 }
    )
  }

  const raw = await request.text()
  const signature = request.headers.get('x-signature')
  if (!verifyWebhookSignature(raw, signature, secret)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 })
  }

  let event
  try {
    event = parseWebhookEvent(raw)
  } catch {
    return NextResponse.json({ ok: false, error: 'malformed payload' }, { status: 400 })
  }

  const result = await handleLemonSqueezyEvent(event, defaultAdminStore())
  return NextResponse.json({ ok: true, ...result })
}
