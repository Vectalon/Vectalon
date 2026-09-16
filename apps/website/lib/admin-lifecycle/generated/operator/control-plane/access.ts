import { createHash, timingSafeEqual } from "node:crypto"
import type { LicenseActor, LicenseRole } from "../licenses/types"

export const OPERATOR_ROLES = {
  viewer: ["license:read"],
  support: ["license:read"],
  billing: ["license:read", "license:write", "license:refund"],
  license: ["license:read", "license:write", "license:sign"],
  security: ["license:read", "license:write", "license:revoke", "key:manage"],
  platform: ["license:read", "license:write", "license:sign", "license:refund", "license:revoke", "key:manage"],
} as const satisfies Record<string, readonly LicenseRole[]>

export const OPERATOR_POLICY_VERSION = "operator-access/1.0.0"
const permissions = new Set<LicenseRole>(Object.values(OPERATOR_ROLES).flat())
type Environment = Readonly<Record<string, string | undefined>>

/** Service identity is deployment-owned, never accepted from request JSON or role headers. */
export function serviceOperator(request: Request, environment: Environment = process.env): LicenseActor | null {
  const expected = environment.VECTALON_LICENSE_OPERATOR_SECRET
  const id = environment.VECTALON_LICENSE_OPERATOR_ID
  const configured = environment.VECTALON_LICENSE_OPERATOR_ROLES?.split(",").map(value => value.trim())
  if (!expected || expected.length < 32 || !id || !/^[A-Za-z0-9._:-]{3,200}$/.test(id)
    || !configured?.length || configured.some(value => !permissions.has(value as LicenseRole))) return null
  const authorization = request.headers.get("authorization")
  const match = authorization?.match(/^Bearer ([^\s]{1,4096})$/)
  if (!match || !timingSafeEqual(digest(expected), digest(match[1]))) return null
  return Object.freeze({ id, permissions: Object.freeze([...new Set(configured)] as LicenseRole[]) })
}

/** Only stable numeric provider subjects can be allowlisted; mutable login names are not identity. */
export function githubOperator(subject: string, allowlist: Readonly<Record<string, keyof typeof OPERATOR_ROLES>>): LicenseActor | null {
  if (!/^[1-9][0-9]{0,19}$/.test(subject) || !Object.hasOwn(allowlist, subject)) return null
  const role = allowlist[subject]
  if (!Object.hasOwn(OPERATOR_ROLES, role)) return null
  return Object.freeze({ id: `github:${subject}`, permissions: Object.freeze([...OPERATOR_ROLES[role]]) })
}

function digest(value: string): Buffer { return createHash("sha256").update(value).digest() }
