import { LICENSE_STATES, type LicenseAction, type LicenseRecord, type LicenseState } from "./types"

export const ONLINE_LEASE_MS = 35 * 24 * 60 * 60 * 1000

const transitions: Readonly<Record<LicenseAction, readonly LicenseState[]>> = {
  issue: [], activate: ["pending"], refresh: ["active", "grace"], amend: ["pending", "active", "grace", "suspended"],
  renew: ["active", "grace", "expired"], suspend: ["pending", "active", "grace"], resume: ["suspended"], grace: ["active"], expire: ["active", "grace"], cancel: ["pending", "active", "grace", "suspended"],
  refund: ["pending", "active", "grace", "suspended", "canceled"], revoke: ["pending", "active", "grace", "suspended", "canceled"],
  replace: ["pending", "active", "grace", "suspended", "canceled", "expired"],
}

export function isLicenseState(value: unknown): value is LicenseState {
  return typeof value === "string" && (LICENSE_STATES as readonly string[]).includes(value)
}

export function transitionState(action: LicenseAction, current: LicenseState | null): LicenseState | null {
  if (action === "issue") return current === null ? "pending" : null
  if (!current || !transitions[action].includes(current)) return null
  if (action === "activate" || action === "renew" || action === "refresh" || action === "resume") return "active"
  if (action === "amend") return current
  if (action === "grace") return "grace"
  if (action === "expire") return "expired"
  if (action === "suspend") return "suspended"
  if (action === "cancel") return "canceled"
  if (action === "refund") return "refunded"
  if (action === "revoke") return "revoked"
  return "superseded"
}

/** Time-derived expiry is authoritative even if a scheduler has not materialized an `expire` audit yet. */
export function effectiveLicenseState(record: LicenseRecord, now: number): LicenseState {
  return (record.state === "active" || record.state === "grace") && now >= record.expiresAt ? "expired" : record.state
}

export function canIssueCredential(action: LicenseAction, state: LicenseState): boolean {
  return (action === "activate" || action === "refresh" || action === "amend" || action === "renew" || action === "resume") && state === "active"
}

export function validateLicense(record: Omit<LicenseRecord, "revision" | "keyId" | "supersedesId"> | unknown): string | null {
  if (!record || typeof record !== "object") return "license identity is required"
  const candidate = record as Record<string, unknown>
  const id = candidate.id; const subjectId = candidate.subjectId; const audience = candidate.audience; const product = candidate.product
  const seats = candidate.seats; const issuedAt = candidate.issuedAt; const notBefore = candidate.notBefore; const expiresAt = candidate.expiresAt
  if (typeof id !== "string" || typeof subjectId !== "string" || typeof audience !== "string" || !id.trim() || !subjectId.trim() || !audience.trim() || !Array.isArray(product) || !product.length || !product.every(item => typeof item === "string" && Boolean(item))) return "license identity is required"
  if (typeof seats !== "number" || typeof issuedAt !== "number" || typeof notBefore !== "number" || typeof expiresAt !== "number" || !Number.isSafeInteger(seats) || seats < 1 || !Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(notBefore) || !Number.isSafeInteger(expiresAt)) return "invalid license numeric fields"
  if (!isLicenseState(candidate.state) || issuedAt > notBefore || notBefore >= expiresAt) return "invalid license effective time"
  if (expiresAt - issuedAt > ONLINE_LEASE_MS) return "lease exceeds 35-day maximum"
  return null
}
