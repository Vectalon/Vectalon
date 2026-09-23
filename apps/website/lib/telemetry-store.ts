import { Pool } from 'pg'
import type {
  ErrorReport,
  HeartbeatPayload,
  Store,
  SupportRecord,
} from '../../telemetry/src/types'

const LIMITS = { error: 500, heartbeat: 200, support: 100 } as const
let pool: Pool | undefined
let initialized: Promise<void> | undefined

function database(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL not configured')
  return pool ??= new Pool({
    connectionString,
    max: 2,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false },
  })
}

function ensureTable(): Promise<void> {
  return initialized ??= database().query(`
    CREATE TABLE IF NOT EXISTS vectalon_telemetry_records (
      id bigserial PRIMARY KEY,
      kind text NOT NULL CHECK (kind IN ('error', 'heartbeat', 'support')),
      received_at timestamptz NOT NULL DEFAULT now(),
      payload jsonb NOT NULL
    );
    CREATE INDEX IF NOT EXISTS vectalon_telemetry_records_kind_received_idx
      ON vectalon_telemetry_records (kind, received_at DESC);
  `).then(() => undefined)
}

async function add(kind: keyof typeof LIMITS, payload: unknown): Promise<void> {
  await ensureTable()
  const client = await database().connect()
  try {
    await client.query('BEGIN')
    await client.query(
      'INSERT INTO vectalon_telemetry_records (kind, payload) VALUES ($1, $2::jsonb)',
      [kind, JSON.stringify(payload)]
    )
    await client.query(`
      DELETE FROM vectalon_telemetry_records
      WHERE id IN (
        SELECT id FROM vectalon_telemetry_records
        WHERE kind = $1 ORDER BY received_at DESC, id DESC OFFSET $2
      )
    `, [kind, LIMITS[kind]])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function list<T>(kind: keyof typeof LIMITS, limit = 20): Promise<T[]> {
  await ensureTable()
  const count = Math.max(1, Math.min(Math.floor(limit), LIMITS[kind]))
  const result = await database().query<{ payload: T }>(`
    SELECT payload FROM vectalon_telemetry_records
    WHERE kind = $1 ORDER BY received_at DESC, id DESC LIMIT $2
  `, [kind, count])
  return result.rows.map(row => row.payload).reverse()
}

export function telemetryStore(): Store {
  return {
    addError: event => add('error', event),
    listErrors: limit => list<ErrorReport>('error', limit),
    recordHeartbeat: beat => add('heartbeat', beat),
    listHeartbeats: limit => list<HeartbeatPayload>('heartbeat', limit),
    saveSupport: record => add('support', record),
    listSupport: limit => list<SupportRecord>('support', limit),
    async counts() {
      await ensureTable()
      const result = await database().query<{ kind: keyof typeof LIMITS; count: string }>(
        'SELECT kind, count(*)::text AS count FROM vectalon_telemetry_records GROUP BY kind'
      )
      const counts = { errors: 0, heartbeats: 0, support: 0 }
      for (const row of result.rows) counts[`${row.kind}s` as keyof typeof counts] = Number(row.count)
      return counts
    },
  }
}
