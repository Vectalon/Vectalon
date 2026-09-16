import type { NextRequest } from 'next/server'
import { operatorJson, operatorOrigin, operatorChallengeSecret, operatorHash, operatorLoginBudget, OPERATOR_CHALLENGE_COOKIE, OPERATOR_COOKIE, OPERATOR_CSRF_COOKIE } from '../../../../../lib/operator-host'
import { openOperatorChallenge } from '../../../../../lib/admin-lifecycle/generated/operator/control-plane/browser-challenge'
import { pollOperatorGitHub } from '../../../../../lib/admin-lifecycle/generated/operator/control-plane/github-device'
import { createStoredOperatorSession } from '../../../../../lib/admin-lifecycle/generated/operator/control-plane/session-postgres'
import { operatorDatabase } from '../../../../../lib/admin-lifecycle/generated/operator/control-plane/database'
export const runtime = 'nodejs'
export async function POST(request: NextRequest) {
  try {
    const origin = operatorOrigin()
    if (request.headers.get('origin') !== origin) return operatorJson({ ok: false, error: 'csrf-invalid' }, 403)
    const challenge = openOperatorChallenge(request.cookies.get(OPERATOR_CHALLENGE_COOKIE)?.value ?? '', operatorChallengeSecret(), origin, Date.now())
    if (!challenge) return operatorJson({ ok: false, error: 'challenge-expired' }, 410)
    const budget=await operatorLoginBudget(request,'poll')
    if (!budget.allowed) { const response=operatorJson({ ok:false,error:'rate-limited' },429);response.headers.set('retry-after',String(budget.retryAfterSeconds));return response }
    const result = await pollOperatorGitHub(challenge.deviceCode, process.env.GITHUB_OAUTH_CLIENT_ID ?? '')
    if (result.status !== 'complete') return operatorJson(result, result.status === 'pending' ? 202 : result.status === 'slow_down' ? 429 : result.status === 'expired' ? 410 : result.status === 'denied' ? 403 : 503)
    const stored = await createStoredOperatorSession(operatorDatabase(), result.identity, { expectedOrigin: origin, origin, challengeBound: true, challengeHash: operatorHash(challenge.nonce) })
    if (!stored.ok) return operatorJson({ ok: false, error: stored.code }, stored.code === 'unauthorized' ? 403 : 503)
    const response = operatorJson({ ok: true, status: 'complete' })
    const options = { secure: true, sameSite: 'strict' as const, path: '/', expires: new Date(stored.expiresAt) }
    response.cookies.set(OPERATOR_COOKIE, stored.token, { ...options, httpOnly: true })
    response.cookies.set(OPERATOR_CSRF_COOKIE, stored.csrf, { ...options, httpOnly: false })
    response.cookies.set(OPERATOR_CHALLENGE_COOKIE, '', { secure: true, httpOnly: true, sameSite: 'strict', path: '/api/admin', maxAge: 0 })
    return response
  } catch { return operatorJson({ ok: false, error: 'operator-login-unavailable' }, 503) }
}
