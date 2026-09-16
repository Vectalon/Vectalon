import { NextResponse } from 'next/server'
import { checkoutStatus } from '../../../../../lib/checkout-status'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    return NextResponse.json({ ok: true, ...(await checkoutStatus(new URL(request.url).searchParams.get('correlation') ?? '')) })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'checkout-status-unavailable'
    return NextResponse.json({ ok: false, code }, { status: code === 'checkout-correlation-invalid' ? 400 : 503 })
  }
}

