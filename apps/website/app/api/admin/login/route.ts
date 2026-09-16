import { randomBytes } from 'node:crypto'
import { startOperatorGitHub } from '../../../../lib/admin-lifecycle/generated/operator/control-plane/github-device'
import { sealOperatorChallenge } from '../../../../lib/admin-lifecycle/generated/operator/control-plane/browser-challenge'
import { operatorOrigin, operatorChallengeSecret, operatorJson, operatorLoginBudget, OPERATOR_CHALLENGE_COOKIE } from '../../../../lib/operator-host'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const origin = operatorOrigin()
    if (request.headers.get('origin') !== origin) return operatorJson({ ok: false, error: 'csrf-invalid' }, 403)
    const secret = operatorChallengeSecret()
    const budget=await operatorLoginBudget(request,'start')
    if (!budget.allowed) { const response=operatorJson({ ok:false,error:'rate-limited' },429);response.headers.set('retry-after',String(budget.retryAfterSeconds));return response }
    const challenge = await startOperatorGitHub(process.env.GITHUB_OAUTH_CLIENT_ID ?? '')
    const now = Date.now()
    const sealed = sealOperatorChallenge({ deviceCode: challenge.deviceCode, nonce: randomBytes(32).toString('base64url'), origin, createdAt: now, expiresAt: now + challenge.expiresIn * 1000, interval: challenge.interval }, secret)
    const response = operatorJson({ ok: true, userCode: challenge.userCode, verificationUri: challenge.verificationUri, expiresIn: challenge.expiresIn, interval: challenge.interval })
    response.cookies.set(OPERATOR_CHALLENGE_COOKIE, sealed, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/admin', maxAge: challenge.expiresIn })
    return response
  } catch { return operatorJson({ ok: false, error: 'operator-login-unavailable' }, 503) }
}
