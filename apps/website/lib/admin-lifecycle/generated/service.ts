import { createHash } from "node:crypto"
import { canIssueCredential, effectiveLicenseState, transitionState, validateLicense } from "./lifecycle"
import { newAuditId, type LicenseMutation, type LicenseRepository } from "./repository"
import type { AuditEvent, LicenseClaimsV2, LicenseRecord, LifecycleCommand, LifecycleResult } from "./types"
import type { LicenseSigner } from "./signer"

const WRITE_ACTIONS = new Set<LifecycleCommand["action"]>(["issue", "activate", "refresh", "amend", "renew", "suspend", "resume", "grace", "expire", "cancel", "refund", "revoke", "replace"])
const PRIVILEGED_ACTIONS = new Set<LifecycleCommand["action"]>(["refund", "revoke"])
const SIGNING_ACTIONS = new Set<LifecycleCommand["action"]>(["activate", "refresh", "amend", "renew", "resume", "replace"])

export class LicenseLifecycleService {
  constructor(private readonly repository: LicenseRepository, private readonly signer: LicenseSigner, private readonly issuer: string) {}

  async execute(command: LifecycleCommand, issue?: Omit<LicenseRecord, "state" | "revision" | "keyId" | "supersedesId" | "effectiveAt">): Promise<LifecycleResult> {
    const invalid = validateCommand(command, issue)
    if (invalid) return invalid
    if (!authorizes(command)) return failure("unauthorized", "actor is not allowed to perform this lifecycle action")
    const fingerprint = commandFingerprint(command, issue)
    return this.repository.atomic({ idempotencyKey: command.idempotencyKey, fingerprint }, async transaction => {
      const prior = await transaction.get(command.licenseId)
      if (command.action !== "issue" && !prior) return { result: failure("not_found", "license does not exist") }
      if (command.action === "issue" && prior) return { result: failure("invalid_transition", "license already exists") }
      if (prior && command.expectedRevision !== prior.revision) return { result: failure("revision_conflict", "license revision does not match", prior.revision) }
      const currentState = prior ? effectiveLicenseState(prior, command.now) : null
      if (command.action === "expire" && prior && (prior.state !== "active" && prior.state !== "grace")) return { result: failure("invalid_transition", "cannot expire from a terminal state") }
      if (command.action === "expire" && prior && command.now < prior.expiresAt) return { result: failure("invalid_transition", "cannot expire before lease boundary") }
      const nextState = command.action === "expire" && prior ? "expired" : transitionState(command.action, currentState)
      if (!nextState) return { result: failure("invalid_transition", `cannot ${command.action} from ${currentState ?? "missing"}`) }
      const needsSigningKey = command.action === "issue" || command.action === "replace" || canIssueCredential(command.action, nextState)
      const activeKey = needsSigningKey ? await transaction.signingKey() : null
      if (needsSigningKey && ((this.repository.requiresSigningKeySnapshot && !activeKey) || (activeKey && (activeKey.status !== "active" || activeKey.id !== this.signer.keyId)))) return { result: failure("signing_unavailable", "active signing key is unavailable") }
      const candidate = nextRecord(command, prior, issue, nextState, activeKey?.id ?? prior?.keyId ?? this.signer.keyId)
      const validation = validateLicense(candidate)
      if (validation) return { result: failure("invalid_command", validation) }
      const audits: AuditEvent[] = [auditFor(candidate, command, prior)]
      const licenses: LicenseRecord[] = [candidate]
      let replacement: LicenseRecord | undefined
      let replacementAudit: AuditEvent | undefined
      let credential: string | undefined
      if (command.action === "replace") {
        if (!command.replacementId || command.replacementId === command.licenseId) return { result: failure("invalid_command", "replace requires a distinct replacement id") }
        if (await transaction.get(command.replacementId)) return { result: failure("invalid_transition", "replacement license already exists") }
        replacement = Object.freeze({ ...candidate, id: command.replacementId, state: "active", revision: 1, supersedesId: candidate.id, issuedAt: command.now, notBefore: command.now, effectiveAt: command.now, expiresAt: command.expiresAt ?? command.now + 35 * 24 * 60 * 60 * 1000 })
        const replacementValidation = validateLicense(replacement)
        if (replacementValidation) return { result: failure("invalid_command", replacementValidation) }
        replacementAudit = Object.freeze({ ...auditFor(replacement, { ...command, action: "issue", licenseId: replacement.id }, null), action: "issue", metadata: Object.freeze({ effectiveAt: replacement.effectiveAt, replacesLicenseId: candidate.id, tier: replacement.tier, seats: replacement.seats }) })
        licenses.push(replacement); audits.push(replacementAudit)
        try { credential = await this.signer.signClaims(toClaims(replacement, this.issuer)) } catch { return { result: failure("signing_unavailable", "license signer is unavailable") } }
      } else if (canIssueCredential(command.action, candidate.state)) {
        try { credential = await this.signer.signClaims(toClaims(candidate, this.issuer)) } catch { return { result: failure("signing_unavailable", "license signer is unavailable") } }
      }
      const result: LifecycleResult = Object.freeze({ ok: true, replayed: false, license: candidate, ...(replacement ? { replacement } : {}), ...(credential ? { credential } : {}), audit: audits[0], ...(replacementAudit ? { replacementAudit } : {}) })
      const priorRevisions = new Map<string, number | null>([[candidate.id, prior?.revision ?? null], ...(replacement ? [[replacement.id, null] as [string, null]] : [])])
      const mutation: LicenseMutation = Object.freeze({ licenses, audits, priorRevisions })
      return { result, mutation }
    })
  }
}

function nextRecord(command: LifecycleCommand, prior: LicenseRecord | null, issue: Omit<LicenseRecord, "state" | "revision" | "keyId" | "supersedesId" | "effectiveAt"> | undefined, state: LicenseRecord["state"], keyId: string): LicenseRecord {
  // Issuance timestamps are an acceptance-time fact, not client-supplied record authority.
  const source = prior ?? { ...issue!, issuedAt: command.now, notBefore: command.now, expiresAt: command.expiresAt ?? issue!.expiresAt }
  const signs = canIssueCredential(command.action, state)
  const expiresAt = signs ? (command.expiresAt ?? command.now + 35 * 24 * 60 * 60 * 1000) : source.expiresAt
  return Object.freeze({ ...source, id: command.licenseId, state, revision: (prior?.revision ?? 0) + 1, keyId,
    tier: command.action === "amend" ? (command.tier ?? source.tier) : source.tier, seats: command.action === "amend" ? (command.seats ?? source.seats) : source.seats, issuedAt: signs ? command.now : source.issuedAt,
    notBefore: signs ? command.now : source.notBefore, expiresAt, supersedesId: prior?.supersedesId ?? null,
    // Command state is authoritative now; existing credentials remain bounded by their original exp.
    effectiveAt: command.now })
}

function authorizes(command: LifecycleCommand): boolean {
  if (!WRITE_ACTIONS.has(command.action)) return false
  if (!command.actor.permissions.includes("license:write")) return false
  if (SIGNING_ACTIONS.has(command.action) && !command.actor.permissions.includes("license:sign")) return false
  return !PRIVILEGED_ACTIONS.has(command.action) || command.actor.permissions.includes(`license:${command.action}` as "license:refund" | "license:revoke")
}

function auditFor(candidate: LicenseRecord, command: LifecycleCommand, prior: LicenseRecord | null): AuditEvent {
  return Object.freeze({ id: newAuditId(), licenseId: candidate.id, action: command.action, actorId: command.actor.id, idempotencyKey: command.idempotencyKey,
    fromState: prior?.state ?? null, toState: candidate.state, priorRevision: prior?.revision ?? null, revision: candidate.revision, occurredAt: command.now, reason: command.reason ?? null, metadata: Object.freeze({ effectiveAt: candidate.effectiveAt, tier: candidate.tier, seats: candidate.seats }) })
}

function toClaims(record: LicenseRecord, issuer: string): LicenseClaimsV2 {
  return { license_version: 2, jti: record.id, iss: issuer, aud: record.audience, sub: record.subjectId, product: record.product,
    tier: record.tier, seats: record.seats, state: record.state, iat: Math.floor(record.issuedAt / 1000), nbf: Math.floor(record.notBefore / 1000), exp: Math.floor(record.expiresAt / 1000) }
}

function validateCommand(command: LifecycleCommand, issue?: Omit<LicenseRecord, "state" | "revision" | "keyId" | "supersedesId" | "effectiveAt">): LifecycleResult | null {
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(command.idempotencyKey) || !/^[A-Za-z0-9._:-]{3,200}$/.test(command.actor.id) || !Number.isSafeInteger(command.now)) return failure("invalid_command", "invalid command identity")
  if (command.action === "issue" && !issue) return failure("invalid_command", "issue requires license details")
  if (command.action !== "amend" && (command.tier !== undefined || command.seats !== undefined)) return failure("invalid_command", "only amend accepts tier or seats")
  if (command.action === "amend" && command.tier === undefined && command.seats === undefined) return failure("invalid_command", "amend requires seats or tier")
  return null
}

function commandFingerprint(command: LifecycleCommand, issue: unknown): string {
  const { actor: _actor, now: _now, ...stable } = command
  return createHash("sha256").update(JSON.stringify({ stable, issue })).digest("hex")
}
function failure(code: Extract<LifecycleResult, { ok: false }> ["code"], message: string, currentRevision?: number): LifecycleResult { return { ok: false, code, message, ...(currentRevision === undefined ? {} : { currentRevision }) } }
