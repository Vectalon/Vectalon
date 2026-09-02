/**
 * Minimal admin auth for the dashboard.
 *
 * Local development default: "vectalon" unless ADMIN_PASSWORD is set.
 * Production fails closed unless ADMIN_PASSWORD is explicitly configured.
 */
import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'

export const ADMIN_COOKIE = 'vectalon_admin'
export const DEFAULT_ADMIN_PASSWORD = 'vectalon'

export function adminPassword(): string | null {
  const configured = process.env.ADMIN_PASSWORD?.trim()
  if (configured) return configured
  const production = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
  return production ? null : DEFAULT_ADMIN_PASSWORD
}

/**
 * The cookie never holds the raw password — only a one-way digest of it,
 * so a leaked session cookie can't be replayed as a credential.
 */
export function adminSessionToken(): string | null {
  const password = adminPassword()
  const production = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() || (production ? null : 'vectalon-local-session')
  return password && secret
    ? createHmac('sha256', secret).update('vectalon-admin-session').digest('hex')
    : null
}

export function isAdminToken(token: string | undefined): boolean {
  if (!token) return false
  const expected = adminSessionToken()
  if (!expected) return false
  const provided = Buffer.from(token)
  const trusted = Buffer.from(expected)
  return provided.length === trusted.length && timingSafeEqual(provided, trusted)
}

/** Server-component guard helper: true when the request carries a valid admin cookie. */
export async function isAdmin(): Promise<boolean> {
  const jar = await cookies()
  return isAdminToken(jar.get(ADMIN_COOKIE)?.value)
}
