/**
 * Minimal admin auth for the dashboard.
 *
 * Demo default: the password is "vectalon" unless ADMIN_PASSWORD is set.
 * Production: swap the token check for GitHub OAuth (per the monetization
 * plan) — the cookie contract stays the same.
 */
import { cookies } from 'next/headers'
import { createHash } from 'crypto'

export const ADMIN_COOKIE = 'vectalon_admin'
export const DEFAULT_ADMIN_PASSWORD = 'vectalon'

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD
}

/**
 * The cookie never holds the raw password — only a one-way digest of it,
 * so a leaked session cookie can't be replayed as a credential.
 */
export function adminSessionToken(): string {
  return createHash('sha256').update(`${adminPassword()}::vectalon-admin-session`).digest('hex')
}

export function isAdminToken(token: string | undefined): boolean {
  if (!token) return false
  return token === adminSessionToken()
}

/** Server-component guard helper: true when the request carries a valid admin cookie. */
export async function isAdmin(): Promise<boolean> {
  const jar = await cookies()
  return isAdminToken(jar.get(ADMIN_COOKIE)?.value)
}
