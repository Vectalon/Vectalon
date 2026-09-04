import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** Check whether a GitHub account already used its trial — GET /v1/trial/check?githubUserId=… */
export async function GET() {
  return NextResponse.json({ used: false, error: 'public-identity-lookup-retired' }, { status: 410 })
}
