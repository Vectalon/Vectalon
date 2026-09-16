import type { LicenseActor } from "../licenses/types"
import { createHash, timingSafeEqual } from "node:crypto"
import { githubOperator, OPERATOR_ROLES } from "./access"

export type OperatorSession = Readonly<{ subject: string; role: keyof typeof OPERATOR_ROLES; createdAt: number; authenticatedAt: number; lastSeenAt: number; expiresAt: number; revoked: boolean; active: boolean; csrfHash: string }>
export type OperatorDecision = { ok: true; actor: LicenseActor } | { ok: false; code: "unauthorized" | "forbidden" | "csrf-invalid" | "reauth-required" | "reason-required" }
export function authorizeSession(session: OperatorSession | null, input: Readonly<{ now: number; permission: string; origin?: string; expectedOrigin: string; csrf?: string; reason?: string; mutation?: boolean }>): OperatorDecision {
  const times = session ? [input.now, session.createdAt, session.authenticatedAt, session.lastSeenAt, session.expiresAt] : []
  if (!session || session.revoked || !session.active || times.some(value => !Number.isSafeInteger(value))
    || session.createdAt > input.now || session.authenticatedAt > input.now || session.authenticatedAt < session.createdAt
    || session.lastSeenAt > input.now || session.lastSeenAt < session.createdAt || session.expiresAt <= input.now
    || session.expiresAt > session.createdAt + 8 * 60 * 60_000 || session.lastSeenAt <= input.now - 15 * 60_000) return { ok: false, code: "unauthorized" }
  const actor = githubOperator(session.subject, { [session.subject]: session.role })
  if (!actor) return { ok: false, code: "unauthorized" }
  const permitted = input.permission === "operator:manage" ? session.role === "platform" : actor.permissions.some(permission => permission === input.permission)
  if (!permitted) return { ok: false, code: "forbidden" }
  if (input.mutation) {
    if (input.origin !== input.expectedOrigin || !input.csrf || input.csrf.length > 256 || !/^[a-f0-9]{64}$/.test(session.csrfHash)
      || !timingSafeEqual(createHash("sha256").update(input.csrf).digest(), Buffer.from(session.csrfHash, "hex"))) return { ok: false, code: "csrf-invalid" }
    if (session.authenticatedAt <= input.now - 5 * 60_000) return { ok: false, code: "reauth-required" }
    if (!input.reason || input.reason.trim().length < 3 || input.reason.length > 500) return { ok: false, code: "reason-required" }
  }
  return { ok: true, actor }
}
