import type { VerifiedProviderIdentity } from "../trials/issuance"
import { createHash, randomBytes } from "node:crypto"
import { OPERATOR_ROLES } from "./access"
export type OperatorSessionRecord = Readonly<{ subject: string; tokenHash: string; csrfHash: string; createdAt: number; authenticatedAt: number; lastSeenAt: number; expiresAt: number }>
/** Caller verifies GitHub and browser challenge first, then locks the current database membership.
 * Raw credentials must not escape to the browser until record and immutable audit commit. */
export function createOperatorSession(identity: VerifiedProviderIdentity, membership: { subject: string; role: string; active: boolean } | null, input: { now: number; expectedOrigin: string; origin?: string; challengeBound: boolean }): { ok: true; token: string; csrf: string; record: OperatorSessionRecord } | { ok: false; code: "unauthorized" } {
  if (!membership?.active || identity.provider !== "github" || !/^[1-9][0-9]{0,19}$/.test(identity.providerSubjectId)
    || identity.providerSubjectId !== membership.subject || !Object.hasOwn(OPERATOR_ROLES, membership.role)
    || !input.challengeBound || input.origin !== input.expectedOrigin || !Number.isSafeInteger(input.now) || input.now < 0
    || !Number.isSafeInteger(input.now + 28_800_000)) return { ok: false, code: "unauthorized" }
  const token = randomBytes(32).toString("base64url")
  const csrf = randomBytes(32).toString("base64url")
  return { ok: true, token, csrf, record: { subject: membership.subject, tokenHash: createHash("sha256").update(token).digest("hex"), csrfHash: createHash("sha256").update(csrf).digest("hex"), createdAt: input.now, authenticatedAt: input.now, lastSeenAt: input.now, expiresAt: input.now + 28_800_000 } }
}
