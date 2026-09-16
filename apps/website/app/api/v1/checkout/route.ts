import { NextResponse } from 'next/server'
import { createCheckoutSession } from '../../../../lib/commercial-checkout'

export const runtime = 'nodejs'

export function GET(request: Request) {
  const url = new URL(request.url)
  const planId = url.searchParams.get('plan') ?? ''
  const seats = Number(url.searchParams.get('seats') ?? '1')
  try {
    const session = createCheckoutSession({ planId, seats })
    return NextResponse.redirect(session.url, 307)
  } catch (error) {
    const code = error instanceof Error ? error.message : 'checkout-unavailable'
    const status = code.includes('invalid') || code.includes('unavailable') && code !== 'checkout-provider-unavailable' ? 400 : 503
    return NextResponse.json({ ok: false, code }, { status })
  }
}

