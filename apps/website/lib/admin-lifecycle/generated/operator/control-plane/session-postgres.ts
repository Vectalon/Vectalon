import type { Pool, PoolClient } from "pg"
import type { VerifiedProviderIdentity } from "../trials/issuance"
import { randomUUID } from "node:crypto"
import { createOperatorSession } from "./session-issuance"
import { OPERATOR_POLICY_VERSION } from "./access"
import { authorizeSession, type OperatorSession, type OperatorDecision } from "./session-policy"
export async function authorizeStoredOperator(pool: Pick<Pool, "connect">, hash: string, input: Omit<Parameters<typeof authorizeSession>[1], "now">): Promise<OperatorDecision | { ok: false; code: "service-unavailable" }> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return { ok: false, code: "unauthorized" }
  for (let attempt = 0; attempt < 2; attempt++) {
  let client: PoolClient | undefined
  let committing = false
  try {
    client = await pool.connect()
    await client.query("begin isolation level serializable")
    const found = await client.query(`select s.*,m.role,m.active,
      floor(extract(epoch from clock_timestamp()) * 1000)::double precision as database_now
      from vectalon_private.operator_sessions s join vectalon_private.operator_memberships m on m.subject=s.subject
      where s.token_hash=$1 for update of s,m`, [hash])
    const row = found.rows[0]
    const session: OperatorSession | null = row ? { subject: row.subject, role: row.role, active: row.active === true, revoked: row.revoked_at !== null, csrfHash: row.csrf_hash,
      createdAt: new Date(row.created_at).getTime(), authenticatedAt: new Date(row.authenticated_at).getTime(), lastSeenAt: new Date(row.last_seen_at).getTime(), expiresAt: new Date(row.expires_at).getTime() } : null
    const result = authorizeSession(session, { ...input, now: row?.database_now })
    if (!result.ok) { await client.query("rollback"); return result }
    if (input.mutation) await client.query(`insert into vectalon_private.operator_security_audit
      (actor_subject,action,target_subject,reason,correlation_id,result,policy_version)
      values ($1,$2,$1,$3,$4,'allowed',$5)`, [result.actor.id,`authorization:${input.permission}`,input.reason!.trim(),randomUUID(),OPERATOR_POLICY_VERSION])
    await client.query("update vectalon_private.operator_sessions set last_seen_at=clock_timestamp() where token_hash=$1", [hash])
    committing = true
    await client.query("commit")
    return result
  } catch (error) {
    if (client) await client.query("rollback").catch(() => undefined)
    if (!committing && attempt === 0 && (error as { code?: string })?.code === "40001") continue
    return { ok: false, code: "service-unavailable" }
  } finally { client?.release() }
  }
  return { ok: false, code: "service-unavailable" }
}
export async function createStoredOperatorSession(pool: Pick<Pool, "connect">, identity: VerifiedProviderIdentity, input: { expectedOrigin: string; origin?: string; challengeBound: boolean; challengeHash: string }): Promise<{ ok: true; token: string; csrf: string; expiresAt: number } | { ok: false; code: "unauthorized" | "service-unavailable" }> {
  if (!/^[a-f0-9]{64}$/.test(input.challengeHash)) return { ok: false, code: "unauthorized" }
  let client: PoolClient | undefined
  try {
    client = await pool.connect()
    await client.query("begin isolation level serializable")
    const found = await client.query(`select subject, role, active,
      floor(extract(epoch from clock_timestamp()) * 1000)::double precision as database_now
      from vectalon_private.operator_memberships where subject = $1 for update`, [identity.providerSubjectId])
    const row = found.rows[0]
    const result = createOperatorSession(identity, row ?? null, { ...input, now: row?.database_now })
    if (!result.ok) { await client.query("rollback"); return result }
    const record = result.record
    await client.query(`insert into vectalon_private.operator_sessions
      (token_hash, csrf_hash, subject, created_at, authenticated_at, last_seen_at, expires_at, challenge_hash)
      values ($1, $2, $3, $4, $4, $4, $5, $6)`, [record.tokenHash, record.csrfHash, record.subject, new Date(record.createdAt), new Date(record.expiresAt), input.challengeHash])
    await client.query(`insert into vectalon_private.operator_security_audit
      (actor_subject, action, target_subject, reason, correlation_id, result, policy_version)
      values ($1, 'session:create', $1, 'Verified GitHub sign-in', $2, 'allowed', $3)`, [`github:${record.subject}`, randomUUID(), OPERATOR_POLICY_VERSION])
    await client.query("commit")
    return { ok: true, token: result.token, csrf: result.csrf, expiresAt: record.expiresAt }
  } catch {
    if (client) await client.query("rollback").catch(() => undefined)
    return { ok: false, code: "service-unavailable" }
  } finally { client?.release() }
}
