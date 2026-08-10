import { NextResponse } from 'next/server'
import { defaultAdminStore } from '../../../../lib/admin-store'

export const runtime = 'nodejs'

/** Register a GitHub-based 14-day trial — POST /v1/trial. */
export async function POST(request: Request) {
  let body: { githubUserId?: string; githubUsername?: string; tier?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ started: false, reason: 'invalid JSON body' }, { status: 400 })
  }

  const userId = (body.githubUserId ?? '').trim()
  const username = (body.githubUsername ?? '').trim()
  if (!userId || !username) {
    return NextResponse.json({ started: false, reason: 'githubUserId and githubUsername are required' }, { status: 400 })
  }

  const store = defaultAdminStore()
  const result = await store.registerTrial({
    githubUserId: userId,
    githubUsername: username,
    tier: body.tier === 'team' ? 'team' : 'pro',
  })

  if (!result.started) {
    return NextResponse.json({ started: false, reason: result.reason })
  }
  return NextResponse.json({
    started: true,
    trial: {
      tier: result.trial!.tier,
      githubUsername: result.trial!.githubUsername,
      startedAt: result.trial!.startedAt,
      expiresAt: result.trial!.expiresAt,
    },
  })
}
