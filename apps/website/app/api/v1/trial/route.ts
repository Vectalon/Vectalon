import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** Register a GitHub-based 14-day trial — POST /v1/trial. */
export async function POST() {
  return NextResponse.json({ started: false, reason: 'verified-device-flow-required' }, { status: 410 })
}
