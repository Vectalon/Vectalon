import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** Public health check — mirrors the plan's GET /v1/health. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'vectalon.in',
    version: '0.1.26',
    time: Date.now(),
  })
}
