import type { Pool, PoolClient } from "pg"
import { randomUUID } from "node:crypto"
import type { LicenseSigner } from "../licenses/signer"
import { issuePlatformSdkLease } from "./sdk-access"
import { OPERATOR_POLICY_VERSION } from "./access"
import type { OperatorSession } from "./session-policy"

/** Locked membership, locked session and immutable audit commit before any credential escapes. */
export async function issueStoredPlatformSdkLease(pool: Pick<Pool, "connect">, tokenHash: string, input: Parameters<typeof issuePlatformSdkLease>[1], signer: LicenseSigner): ReturnType<typeof issuePlatformSdkLease> {
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) return { ok: false, code: "unauthorized" }
  let client: PoolClient | undefined
  try {
    client = await pool.connect()
    await client.query("begin isolation level serializable")
    const found = await client.query(`select s.*, m.role, m.active,
      floor(extract(epoch from clock_timestamp()) * 1000)::double precision as database_now
      from vectalon_private.operator_sessions s
      join vectalon_private.operator_memberships m on m.subject = s.subject
      where s.token_hash = $1 for update of s, m`, [tokenHash])
    const row = found.rows[0]
    if (!row) { await client.query("rollback"); return { ok: false, code: "unauthorized" } }
    const session: OperatorSession = { subject: row.subject, role: row.role, active: row.active === true, revoked: row.revoked_at !== null, csrfHash: row.csrf_hash,
      createdAt: new Date(row.created_at).getTime(), authenticatedAt: new Date(row.authenticated_at).getTime(), lastSeenAt: new Date(row.last_seen_at).getTime(), expiresAt: new Date(row.expires_at).getTime() }
    const result = await issuePlatformSdkLease(session, { ...input, now: row.database_now }, signer)
    if (!result.ok) { await client.query("rollback"); return result }
    await client.query(`insert into vectalon_private.operator_security_audit
      (actor_subject, action, target_subject, reason, correlation_id, result, policy_version)
      values ($1, 'sdk:lease', $2, $3, $4, 'allowed', $5)`, [`github:${session.subject}`, input.leaseId, input.reason!.trim(), randomUUID(), OPERATOR_POLICY_VERSION])
    await client.query("update vectalon_private.operator_sessions set last_seen_at = clock_timestamp() where token_hash = $1", [tokenHash])
    await client.query("commit")
    return result
  } catch {
    if (client) await client.query("rollback").catch(() => undefined)
    return { ok: false, code: "service-unavailable" }
  } finally { client?.release() }
}
