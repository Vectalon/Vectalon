import 'server-only'
import { Pool } from 'pg'

export type CheckoutStatus = Readonly<{ status: 'pending' | 'processing' | 'active' | 'review'; retryAfterSeconds?: number }>

export function checkoutStatusFromProjection(row: { event_type?: unknown; state?: unknown; reconciled_at?: unknown } | null): CheckoutStatus {
  if (!row) return { status: 'pending', retryAfterSeconds: 5 }
  if (row.state === 'pending-review' || row.event_type === 'unknown') return { status: 'review' }
  if (row.state === 'active' && row.reconciled_at) return { status: 'active' }
  return { status: 'processing', retryAfterSeconds: 5 }
}

export async function checkoutStatus(correlationId: string, databaseUrl = process.env.DATABASE_URL): Promise<CheckoutStatus> {
  if (!/^[A-Za-z0-9-]{8,100}$/.test(correlationId)) throw new Error('checkout-correlation-invalid')
  if (!databaseUrl) throw new Error('commercial-database-unavailable')
  const pool = new Pool({ connectionString: databaseUrl, max: 1, ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: true } })
  try {
    const result = await pool.query(`select e.event_type, p.state, p.reconciled_at from vectalon_private.provider_events e left join vectalon_private.subscription_projections p on p.subscription_id=e.subscription_id where e.normalized_event #>> '{attribution,correlation_id}'=$1 order by e.provider_sequence desc, e.id desc limit 1`, [correlationId])
    return checkoutStatusFromProjection(result.rows[0] ?? null)
  } finally { await pool.end() }
}

