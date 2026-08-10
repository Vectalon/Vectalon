import { NextResponse } from 'next/server'
import { defaultAdminStore } from '../../../../lib/admin-store'

export const runtime = 'nodejs'

/**
 * Online license validation — POST /v1/validate.
 *
 * Two paths, both live:
 *  1. { key: "vct_…" } — license issued through the admin dashboard; checked
 *     against the online registry (revocation + expiry). This is the endpoint
 *     the CLI pings for revocation checks.
 *  2. { token: "eyJ…" } — an offline-signed JWT (from @vectalon-dev/core's
 *     LicenseValidator) is additionally verified with the embedded public key
 *     before the registry check, so tampered tokens fail fast.
 */
export async function POST(request: Request) {
  let body: { key?: string; token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ valid: false, error: 'invalid JSON body' }, { status: 400 })
  }

  const store = defaultAdminStore()
  const candidate = body.token ?? body.key
  if (!candidate || typeof candidate !== 'string') {
    return NextResponse.json({ valid: false, error: 'missing key or token' }, { status: 400 })
  }

  // JWT path: cryptographically verify the token offline first.
  if (candidate.startsWith('eyJ')) {
    try {
      const core = await import('@vectalon-dev/core')
      const jwt = core.LicenseValidator.validate(candidate)
      if (!jwt.valid) {
        return NextResponse.json({ valid: false, error: jwt.error ?? 'invalid token signature' })
      }
    } catch (err) {
      return NextResponse.json(
        { valid: false, error: `core validator unavailable: ${(err as Error).message}` },
        { status: 503 }
      )
    }
  }

  // Registry path: revocation + expiry against the store.
  const result = await store.validateLicense(candidate)
  if (!result.valid) {
    return NextResponse.json({ valid: false, error: result.reason }, { status: 200 })
  }
  return NextResponse.json({
    valid: true,
    license: {
      key: result.license!.key,
      tier: result.license!.tier,
      product: result.license!.product,
      email: result.license!.email,
      expiresAt: result.license!.expiresAt,
    },
  })
}
