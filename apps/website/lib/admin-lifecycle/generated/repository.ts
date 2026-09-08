import { randomUUID } from "node:crypto"
import type { AuditEvent, LicenseRecord, LifecycleResult } from "./types"
import type { KeyMetadata } from "./keys"

export type LicenseMutation = Readonly<{ licenses: readonly LicenseRecord[]; audits: readonly AuditEvent[]; priorRevisions: ReadonlyMap<string, number | null> }>
export type AtomicWork = (transaction: Readonly<{ get(licenseId: string): Promise<LicenseRecord | null>; signingKey(): Promise<KeyMetadata | null> }>) => Promise<Readonly<{ result: LifecycleResult; mutation?: LicenseMutation }>>

export interface LicenseRepository {
  /** Production repositories must fail closed when no uniquely active key is available. */
  readonly requiresSigningKeySnapshot?: boolean
  get(licenseId: string): Promise<LicenseRecord | null>
  listAudit(licenseId: string): Promise<readonly AuditEvent[]>
  /** One database transaction owns reservation, locked reads, mutation, audit, and durable response. */
  atomic(input: Readonly<{ idempotencyKey: string; fingerprint: string }>, work: AtomicWork): Promise<LifecycleResult>
}

type IdempotencyEntry = { fingerprint: string; result?: LifecycleResult }

/** Test/local implementation. Production uses the migration's transaction and unique idempotency key. */
export class InMemoryLicenseRepository implements LicenseRepository {
  private readonly licenses = new Map<string, LicenseRecord>()
  private readonly idempotency = new Map<string, IdempotencyEntry>()
  private readonly audit: AuditEvent[] = []
  private readonly keys = new Map<string, KeyMetadata>()
  private queue: Promise<void> = Promise.resolve()

  constructor(seed: readonly LicenseRecord[] = [], keys: readonly KeyMetadata[] = []) { seed.forEach(record => this.licenses.set(record.id, record)); keys.forEach(key => this.keys.set(key.id, key)) }
  async get(licenseId: string): Promise<LicenseRecord | null> { return this.licenses.get(licenseId) ?? null }
  async listAudit(licenseId: string): Promise<readonly AuditEvent[]> { return this.audit.filter(event => event.licenseId === licenseId) }
  async atomic(input: Readonly<{ idempotencyKey: string; fingerprint: string }>, work: AtomicWork): Promise<LifecycleResult> {
    let release!: () => void
    const previous = this.queue; this.queue = new Promise<void>(resolve => { release = resolve })
    await previous
    try {
      const saved = this.idempotency.get(input.idempotencyKey)
      if (saved) {
        if (saved.fingerprint !== input.fingerprint) return { ok: false, code: "idempotency_conflict", message: "idempotency key was used for another command" }
        if (saved.result) return saved.result.ok ? { ...saved.result, replayed: true } : saved.result
        // A prior process may have died after an old-format reservation; safely take it over while locked.
      } else this.idempotency.set(input.idempotencyKey, { fingerprint: input.fingerprint })
      const outcome = await work({ get: async id => this.licenses.get(id) ?? null, signingKey: async () => [...this.keys.values()].find(key => key.status === "active") ?? null })
      if (outcome.mutation) {
        for (const record of outcome.mutation.licenses) {
          const current = this.licenses.get(record.id)
          if ((current?.revision ?? null) !== (outcome.mutation.priorRevisions.get(record.id) ?? null)) return { ok: false, code: "revision_conflict", message: "license changed before command could commit" }
        }
        outcome.mutation.licenses.forEach(record => this.licenses.set(record.id, record)); this.audit.push(...outcome.mutation.audits)
      }
      this.idempotency.set(input.idempotencyKey, { fingerprint: input.fingerprint, result: outcome.result })
      return outcome.result
    } finally { release() }
  }
}

export function newAuditId(): string { return randomUUID() }
