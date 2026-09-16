/** Admin's private projection of the reviewed Core V2 signed payload. */
export const LICENSE_STATES = ["pending", "active", "grace", "suspended", "expired", "canceled", "refunded", "revoked", "superseded"] as const
export type LicenseState = (typeof LICENSE_STATES)[number]
export type LicenseAction = "issue" | "activate" | "refresh" | "amend" | "renew" | "suspend" | "resume" | "grace" | "expire" | "cancel" | "refund" | "revoke" | "replace"
export type LicenseTier = "pro" | "team" | "enterprise"
export type LicenseRole = "license:read" | "license:write" | "license:refund" | "license:revoke" | "key:manage" | "license:sign"

export type LicenseRecord = Readonly<{
  id: string; subjectId: string; audience: string; product: readonly string[]; tier: LicenseTier; seats: number
  state: LicenseState; revision: number; issuedAt: number; notBefore: number; expiresAt: number
  keyId: string; supersedesId: string | null; effectiveAt: number
}>

export type LicenseClaimsV2 = Readonly<{
  license_version: 2; jti: string; iss: string; aud: string; sub: string; product: readonly string[]
  tier: LicenseTier; seats: number; state: LicenseState; iat: number; nbf: number; exp: number
}>

/** Identity and roles are authenticated server claims, never request-body attributes. */
export type LicenseActor = Readonly<{ id: string; permissions: readonly LicenseRole[] }>
export type LifecycleCommand = Readonly<{
  action: LicenseAction; licenseId: string; idempotencyKey: string; expectedRevision?: number; actor: LicenseActor
  now: number; reason?: string; tier?: LicenseTier; seats?: number; expiresAt?: number; replacementId?: string
}>

export type AuditEvent = Readonly<{
  id: string; licenseId: string; action: LicenseAction; actorId: string; idempotencyKey: string
  fromState: LicenseState | null; toState: LicenseState; priorRevision: number | null; revision: number
  occurredAt: number; reason: string | null; metadata: Readonly<Record<string, string | number | boolean | null>>
}>

export type LifecycleErrorCode = "unauthorized" | "invalid_command" | "not_found" | "invalid_transition" | "revision_conflict" | "idempotency_conflict" | "signing_unavailable" | "service_unavailable"
export type LifecycleResult =
  | Readonly<{ ok: true; replayed: boolean; license: LicenseRecord; replacement?: LicenseRecord; credential?: string; audit: AuditEvent; replacementAudit?: AuditEvent }>
  | Readonly<{ ok: false; code: LifecycleErrorCode; message: string; currentRevision?: number }>
