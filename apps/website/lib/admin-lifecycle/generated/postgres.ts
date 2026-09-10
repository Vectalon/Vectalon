import type { Pool } from "pg"
import type { AuditEvent, LicenseRecord, LifecycleResult } from "./types"
import { validatePublicKey, type KeyMetadata } from "./keys"
import type { AtomicWork, LicenseMutation, LicenseRepository } from "./repository"

/** Durable repository for the private schema. The conditional update is the concurrency authority. */
export class PostgresLicenseRepository implements LicenseRepository {
  readonly requiresSigningKeySnapshot = true
  constructor(private readonly pool: Pool) {}
  async get(licenseId: string): Promise<LicenseRecord | null> {
    const result = await this.pool.query("select * from vectalon_private.read_runtime_license($1)", [licenseId])
    return result.rowCount ? decodeLicense(result.rows[0]) : null
  }
  async listAudit(licenseId: string): Promise<readonly AuditEvent[]> {
    const result = await this.pool.query("select * from vectalon_private.read_license_audit($1)", [licenseId])
    return result.rows.map(row => ({ id: row.event_id, licenseId: row.license_id, action: row.action, actorId: row.actor_id, idempotencyKey: row.idempotency_key, fromState: row.from_state, toState: row.to_state, priorRevision: row.prior_revision, revision: row.revision, occurredAt: new Date(row.occurred_at).getTime(), reason: row.reason, metadata: row.metadata })) as AuditEvent[]
  }
  /**
   * A single transaction owns the reservation, locked rows, audit and replay body.
   * `FOR UPDATE` means a same-key retry waits for the original commit, never observes a poison null response.
   */
  async atomic(input: Readonly<{ idempotencyKey: string; fingerprint: string }>, work: AtomicWork): Promise<LifecycleResult> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await this.atomicOnce(input, work) } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : ""
        if ((code !== "40001" && code !== "40P01") || attempt === 2) throw error
      }
    }
    throw new Error("unreachable")
  }
  private async atomicOnce(input: Readonly<{ idempotencyKey: string; fingerprint: string }>, work: AtomicWork): Promise<LifecycleResult> {
    const client = await this.pool.connect()
    try {
      await client.query("begin isolation level serializable")
      const reservation = await client.query<{ command_hash: string; response: LifecycleResult | null }>("select command_hash, response from vectalon_private.reserve_license_command($1, $2)", [input.idempotencyKey, input.fingerprint])
      const row = reservation.rows[0]
      if (!row || row.command_hash !== input.fingerprint) { await client.query("rollback"); return { ok: false, code: "idempotency_conflict", message: "idempotency key was used for another command" } }
      if (row.response) { await client.query("commit"); return row.response.ok ? { ...row.response, replayed: true } : row.response }
      // A response-less row can only be a legacy interrupted reservation. Its row lock makes recovery exclusive.
      const outcome = await work({
        get: async licenseId => {
          const found = await client.query("select * from vectalon_private.lock_runtime_license($1)", [licenseId])
          return found.rowCount ? decodeLicense(found.rows[0]) : null
        },
        signingKey: async () => {
          const found = await client.query("select * from vectalon_private.read_active_runtime_signing_key()")
          if (found.rowCount !== 1) return null
          const key = found.rows[0]
          return { id: String(key.key_id), publicKeyPem: validatePublicKey(String(key.public_key_pem)), status: key.status, createdAt: new Date(String(key.created_at)).getTime(), activatedAt: key.activated_at ? new Date(String(key.activated_at)).getTime() : null, retiredAt: key.retired_at ? new Date(String(key.retired_at)).getTime() : null, compromisedAt: key.compromised_at ? new Date(String(key.compromised_at)).getTime() : null } as KeyMetadata
        },
      })
      let result = outcome.result
      if (outcome.mutation && result.ok) {
        if (await this.persist(client, input.idempotencyKey, outcome.mutation)) {
          const completed = await client.query<{ response: LifecycleResult }>("select response from vectalon_private.complete_license_lifecycle_success($1, $2)", [input.idempotencyKey, result.credential ?? null])
          result = completed.rows[0]?.response ?? { ok: false, code: "service_unavailable", message: "lifecycle command response was unavailable" }
        } else result = { ok: false, code: "revision_conflict", message: "license changed before command could commit" }
      }
      if (!outcome.mutation || !result.ok) {
        const currentRevision = !result.ok ? result.currentRevision ?? null : null
        await client.query("select vectalon_private.complete_license_lifecycle_failure($1, $2, $3, $4)", [input.idempotencyKey, result.ok ? "service_unavailable" : result.code, result.ok ? "lifecycle command did not persist" : result.message, currentRevision])
      }
      await client.query("commit")
      return result
    } catch (error) {
      await client.query("rollback").catch(() => undefined)
      throw error
    } finally { client.release() }
  }
  private async persist(client: { query: Pool["query"] }, idempotencyKey: string, mutation: LicenseMutation): Promise<boolean> {
    const persisted = await client.query<{ applied: boolean }>("select vectalon_private.apply_license_lifecycle_command($1, $2::jsonb) as applied", [idempotencyKey, JSON.stringify(encodeCommand(mutation))])
    return persisted.rows[0]?.applied === true
  }
}

function encodeCommand(mutation: LicenseMutation): Readonly<Record<string, unknown>> {
  const audit = mutation.audits.find(item => item.action !== "issue") ?? mutation.audits[0]
  const record = mutation.licenses.find(item => item.id === audit?.licenseId)
  if (!audit || !record) throw new Error("lifecycle mutation has no primary command")
  const action = audit.action
  const signingAction = action === "activate" || action === "refresh" || action === "amend" || action === "renew" || action === "resume" || action === "replace"
  return {
    action, licenseId: record.id, expectedRevision: audit.priorRevision ?? undefined,
    ...(action === "amend" ? { tier: record.tier, seats: record.seats } : {}),
    ...(signingAction ? { expiresAt: record.expiresAt } : {}),
    ...(action === "replace" ? { replacementId: mutation.licenses.find(item => item.id !== record.id)?.id } : {}),
    ...(action === "issue" ? { issue: { subjectId: record.subjectId, audience: record.audience, product: record.product, tier: record.tier, seats: record.seats, expiresAt: record.expiresAt } } : {}),
    ...(audit.reason === null ? {} : { reason: audit.reason }),
  }
}
function decodeLicense(row: Record<string, unknown>): LicenseRecord { return { id: String(row.license_id), subjectId: String(row.subject_id), audience: String(row.audience), product: row.product_scope as string[], tier: row.tier as LicenseRecord["tier"], seats: Number(row.seats), state: row.state as LicenseRecord["state"], revision: Number(row.revision), issuedAt: new Date(String(row.issued_at)).getTime(), notBefore: new Date(String(row.not_before)).getTime(), expiresAt: new Date(String(row.expires_at)).getTime(), keyId: String(row.key_id), supersedesId: row.supersedes_license_id === null ? null : String(row.supersedes_license_id), effectiveAt: new Date(String(row.effective_at)).getTime() } }
