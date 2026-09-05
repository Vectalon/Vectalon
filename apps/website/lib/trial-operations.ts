import { Pool } from 'pg'

let pool: Pool | undefined
function database(): Pool {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('trial-database-unavailable')
  return pool ??= new Pool({ connectionString: url, max: 2, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } })
}

export interface TrialPrivacyExport {
  trialId: string
  provider: 'github'
  providerSubjectId: string
  displayName: string | null
  status: 'active' | 'revoked' | 'expired'
  tier: 'pro' | 'team'
  productScope: string[]
  issuedAt: string
  expiresAt: string
}

export async function exportTrialIdentity(trialId: string): Promise<TrialPrivacyExport | null> {
  if (!/^trial_[a-f0-9]{32}$/.test(trialId)) throw new Error('trial-operation-invalid')
  const result = await database().query<{
    trial_id: string; provider: 'github'; provider_subject_id: string; display_name: string | null
    status: 'active' | 'revoked' | 'expired'; tier: 'pro' | 'team'; product_scope: string[]; issued_at: Date; expires_at: Date
  }>(`SELECT t.trial_id, i.provider, i.provider_subject_id, i.display_name, t.status, t.tier,
            t.product_scope, t.issued_at, t.expires_at
       FROM vectalon_private.trials t JOIN vectalon_private.provider_identities i ON i.id = t.identity_id
      WHERE t.trial_id = $1`, [trialId])
  const row = result.rows[0]
  return row ? { trialId: row.trial_id, provider: row.provider, providerSubjectId: row.provider_subject_id,
    displayName: row.display_name, status: row.status, tier: row.tier, productScope: row.product_scope,
    issuedAt: row.issued_at.toISOString(), expiresAt: row.expires_at.toISOString() } : null
}

export async function revokeTrial(trialId: string, reason: string): Promise<boolean> {
  return mutate(trialId, reason, 'revoke')
}

export async function eraseTrialIdentity(trialId: string, reason: string): Promise<boolean> {
  return mutate(trialId, reason, 'erase')
}

async function mutate(trialId: string, reason: string, operation: 'revoke' | 'erase'): Promise<boolean> {
  if (!/^trial_[a-f0-9]{32}$/.test(trialId) || reason.trim().length < 8 || reason.length > 500) throw new Error('trial-operation-invalid')
  const client = await database().connect()
  try {
    await client.query('BEGIN')
    const found = await client.query<{ identity_id: string }>('SELECT identity_id FROM vectalon_private.trials WHERE trial_id = $1 FOR UPDATE', [trialId])
    if (!found.rowCount) { await client.query('ROLLBACK'); return false }
    await client.query("UPDATE vectalon_private.trials SET status = 'revoked' WHERE trial_id = $1", [trialId])
    if (operation === 'erase') await client.query('UPDATE vectalon_private.provider_identities SET display_name = NULL, erased_at = now() WHERE id = $1', [found.rows[0].identity_id])
    await client.query('INSERT INTO vectalon_private.trial_audit_events (trial_id, action, actor_id, reason) VALUES ($1, $2, $3, $4)',
      [trialId, operation === 'erase' ? 'identity.erased' : 'trial.revoked', 'admin-session', reason.trim()])
    await client.query('COMMIT')
    return true
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
}
