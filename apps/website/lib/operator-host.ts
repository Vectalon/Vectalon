import 'server-only'
import { createHash,createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { operatorDatabase } from './admin-lifecycle/generated/operator/control-plane/database'
import { authorizeStoredOperator } from './admin-lifecycle/generated/operator/control-plane/session-postgres'
import { consumeOperatorLoginBudget } from './admin-lifecycle/generated/operator/control-plane/login-budget'
export const OPERATOR_COOKIE = 'vectalon_operator'
export const OPERATOR_CSRF_COOKIE = 'vectalon_operator_csrf'
export const OPERATOR_CHALLENGE_COOKIE = 'vectalon_operator_challenge'
export function operatorOrigin(): string {
  const configured = process.env.VECTALON_OPERATOR_ORIGIN
  const value = new URL(configured ?? '')
  if (value.protocol !== 'https:' || value.origin !== configured || value.username || value.password || ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname)) throw new Error('operator-configuration-invalid')
  if (process.env.VERCEL_ENV === 'preview' && value.hostname === 'vectalon.in') throw new Error('operator-preview-not-configured')
  return value.origin
}
export function operatorChallengeSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET ?? ''
  if (secret.length < 32) throw new Error('operator-configuration-invalid')
  return secret
}
export function operatorHash(value: string): string { return createHash('sha256').update(value).digest('hex') }
export async function operatorLoginBudget(request:Request,mode:'start'|'poll') {
  // Vercel overwrites this header; no raw IP is retained in storage or logs.
  const forwarded=request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for') ?? ''
  const address=isIP(forwarded) ? forwarded : 'unknown'
  const hash=createHmac('sha256',operatorChallengeSecret()).update('operator-login-ip/v1:').update(address).digest('hex')
  return consumeOperatorLoginBudget(operatorDatabase(),hash,mode)
}
export function operatorJson(body: object, status = 200): NextResponse { return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } }) }
export async function operatorTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(OPERATOR_COOKIE)?.value
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? operatorHash(token) : null
}
export async function operatorAuthorization(permission = 'license:read', request?: Request, reason?: string) {
  try {
    const hash = await operatorTokenHash()
    if (!hash) return { ok: false as const, code: 'unauthorized' }
    return await authorizeStoredOperator(operatorDatabase(), hash, { permission, expectedOrigin: operatorOrigin(), origin: request?.headers.get('origin') ?? undefined, csrf: request?.headers.get('x-vectalon-csrf') ?? undefined, reason: reason ?? request?.headers.get('x-vectalon-reason') ?? undefined, mutation: !!request })
  } catch { return { ok: false as const, code: 'service-unavailable' } }
}
