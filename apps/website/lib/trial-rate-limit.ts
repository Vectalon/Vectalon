import { createHash } from 'node:crypto'
import { Pool } from 'pg'

const WINDOW_MS = 15 * 60 * 1000
const MAX_POLLS = 30
let pool: Pool | undefined

export interface TrialPollBudget {
  allowed: boolean
  retryAfterSeconds: number
}

interface Queryable {
  query(text: string, values: unknown[]): Promise<{ rows: Array<{ attempts: number; window_started_at: Date }> }>
}

export async function consumeTrialPollBudget(deviceCode: string, now = Date.now(), store?: Queryable): Promise<TrialPollBudget> {
  if (deviceCode.length < 20 || deviceCode.length > 256 || !Number.isSafeInteger(now)) throw new Error('trial-request-invalid')
  if (!store) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('trial-database-unavailable')
    pool ??= new Pool({ connectionString: url, max: 2, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } })
    store = pool
  }
  const hash = createHash('sha256').update(deviceCode).digest('hex')
  const result = await store.query(
    `INSERT INTO vectalon_private.trial_device_rate_limits (device_hash, window_started_at, attempts, expires_at)
     VALUES ($1, to_timestamp($2 / 1000.0), 1, to_timestamp(($2 + $3 * 2) / 1000.0))
     ON CONFLICT (device_hash) DO UPDATE SET
       window_started_at = CASE WHEN vectalon_private.trial_device_rate_limits.window_started_at <= to_timestamp(($2 - $3) / 1000.0) THEN to_timestamp($2 / 1000.0) ELSE vectalon_private.trial_device_rate_limits.window_started_at END,
       attempts = CASE WHEN vectalon_private.trial_device_rate_limits.window_started_at <= to_timestamp(($2 - $3) / 1000.0) THEN 1 ELSE LEAST(vectalon_private.trial_device_rate_limits.attempts + 1, 120) END,
       expires_at = to_timestamp(($2 + $3 * 2) / 1000.0)
     RETURNING attempts, window_started_at`,
    [hash, now, WINDOW_MS],
  )
  const row = result.rows[0]
  const retryAfterSeconds = Math.min(60, Math.max(5, Math.ceil((row.window_started_at.getTime() + WINDOW_MS - now) / 1000)))
  return { allowed: row.attempts <= MAX_POLLS, retryAfterSeconds }
}
