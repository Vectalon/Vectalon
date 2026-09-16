import { authorizeSession, type OperatorSession } from "./session-policy"
import type { LicenseSigner } from "../licenses/signer"

/** Pure issuance policy; the transaction adapter supplies a locked current session. */
export async function issuePlatformSdkLease(session: OperatorSession | null, input: Readonly<{ now: number; origin?: string; expectedOrigin: string; csrf?: string; reason?: string; issuer: string; leaseId: string }>, signer: LicenseSigner): Promise<Readonly<{ ok: true; credential: string; expiresAt: number }> | Readonly<{ ok: false; code: string }>> {
  const decision = authorizeSession(session, { ...input, permission: "operator:manage", mutation: true })
  if (!decision.ok) return decision
  try {
    const issuer = new URL(input.issuer)
    if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash
      || !/^operator-[A-Za-z0-9._:-]{1,191}$/.test(input.leaseId)) return { ok: false, code: "invalid-request" }
  } catch { return { ok: false, code: "invalid-request" } }
  const expiresAt = Math.floor(Math.min(session!.expiresAt, input.now + 5 * 60_000) / 1000) * 1000
  if (expiresAt <= input.now) return { ok: false, code: "unauthorized" }
  try {
    const credential = await signer.signClaims({ license_version: 2, jti: input.leaseId, iss: input.issuer, aud: "vectalon-cli", sub: decision.actor.id, product: ["rn"], tier: "enterprise", seats: 1, state: "active", iat: Math.floor(input.now / 1000), nbf: Math.floor(input.now / 1000), exp: expiresAt / 1000 })
    return { ok: true, credential, expiresAt }
  } catch { return { ok: false, code: "signing-unavailable" } }
}
