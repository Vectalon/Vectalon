import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto'
import { Pool } from 'pg'

const TRIAL_MS = 14 * 24 * 60 * 60 * 1000
const POLICY_VERSION = '2026-09-04.1'
let pool: Pool | undefined

function database(): Pool {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('trial-database-unavailable')
  return pool ??= new Pool({ connectionString: url, max: 2, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } })
}

export async function issueGitHubTrial(accessToken: string, requestId: string): Promise<
  | { status: 'issued'; credential: string; expiresAt: number }
  | { status: 'already_used' | 'replay' }
> {
  if (!accessToken || accessToken.length > 4096 || !/^[a-f0-9]{64}$/.test(requestId)) throw new Error('trial-request-invalid')
  const response = await fetch('https://api.github.com/user', {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${accessToken}`, 'x-github-api-version': '2022-11-28' },
    signal: AbortSignal.timeout(10_000),
  })
  const identity: unknown = await response.json()
  if (!response.ok || !identity || typeof identity !== 'object' || !Number.isSafeInteger((identity as { id?: unknown }).id)
    || typeof (identity as { login?: unknown }).login !== 'string' || !(identity as { login: string }).login.trim()) throw new Error('provider-identity-invalid')

  const now = Date.now()
  const trialId = `trial_${randomBytes(16).toString('hex')}`
  const subject = `github:${(identity as { id: number }).id}`
  const expiresAt = now + TRIAL_MS
  const privateKey = process.env.VECTALON_LICENSE_PRIVATE_KEY
  if (!privateKey) throw new Error('trial-signing-unavailable')
  const credential = signTrialCredential({ trialId, subject, now, expiresAt }, privateKey, process.env.VECTALON_KEY_ID || 'vectalon-legacy')
  const client = await database().connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    const request = await client.query('INSERT INTO vectalon_private.trial_requests (request_hash) VALUES ($1) ON CONFLICT DO NOTHING RETURNING request_hash', [createHash('sha256').update(requestId).digest('hex')])
    if (!request.rowCount) { await client.query('ROLLBACK'); return { status: 'replay' } }
    const provider = await client.query<{ id: string }>(`INSERT INTO vectalon_private.provider_identities (provider, provider_subject_id, display_name)
      VALUES ('github', $1, $2) ON CONFLICT (provider, provider_subject_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now() RETURNING id`,
      [String((identity as { id: number }).id), (identity as { login: string }).login])
    const trial = await client.query(`INSERT INTO vectalon_private.trials
      (trial_id, identity_id, tier, product_scope, issued_at, not_before, expires_at, policy_version)
      VALUES ($1, $2, 'pro', ARRAY['rn'], to_timestamp($3 / 1000.0), to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), $5)
      ON CONFLICT (identity_id) DO NOTHING RETURNING trial_id`, [trialId, provider.rows[0].id, now, now + TRIAL_MS, POLICY_VERSION])
    await client.query('INSERT INTO vectalon_private.trial_audit_events (trial_id, action, provider, provider_subject_id) VALUES ($1, $2, $3, $4)',
      [trialId, trial.rowCount ? 'trial.issued' : 'trial.duplicate', 'github', String((identity as { id: number }).id)])
    await client.query('COMMIT')
    if (!trial.rowCount) return { status: 'already_used' }
    return { status: 'issued', credential, expiresAt }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}

function signTrialCredential(claims: { trialId: string; subject: string; now: number; expiresAt: number }, privateKeyPem: string, keyId: string): string {
  const key = createPrivateKey(privateKeyPem.replace(/\\n/g, '\n'))
  if (!keyId.trim() || key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error('trial-signing-key-invalid')
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ alg: 'RS256', kid: keyId.trim(), typ: 'vectalon-trial+jwt' })
  const payload = encode({ sub: claims.subject, jti: claims.trialId, aud: 'vectalon-sdk', product: ['rn'], tier: 'pro',
    iat: Math.floor(claims.now / 1000), nbf: Math.floor(claims.now / 1000), exp: Math.floor(claims.expiresAt / 1000), policy_version: POLICY_VERSION })
  const input = `${header}.${payload}`
  return `${input}.${sign('RSA-SHA256', Buffer.from(input, 'ascii'), key).toString('base64url')}`
}
