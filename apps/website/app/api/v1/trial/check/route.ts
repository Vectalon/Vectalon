import { NextResponse } from 'next/server'
import { defaultAdminStore } from '../../../../../lib/admin-store'

export const runtime = 'nodejs'

/** Check whether a GitHub account already used its trial — GET /v1/trial/check?githubUserId=… */
export async function GET(request: Request) {
  const githubUserId = new URL(request.url).searchParams.get('githubUserId') ?? ''
  if (!githubUserId) {
    return NextResponse.json({ used: false, error: 'githubUserId query param required' }, { status: 400 })
  }
  const store = defaultAdminStore()
  const { used, trial } = await store.checkTrial(githubUserId)
  return NextResponse.json({
    used,
    trial: trial
      ? { githubUsername: trial.githubUsername, tier: trial.tier, startedAt: trial.startedAt, expiresAt: trial.expiresAt }
      : undefined,
  })
}
