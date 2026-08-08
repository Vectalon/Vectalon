/**
 * Telemetry payload types — mirrors the shapes the @vectalon-dev/rn client
 * posts (src/diagnostics). Kept permissive: the sink validates loosely and
 * never drops an event over a schema-drift nit.
 */

/** One structured error event (errors-only, opt-out client side). */
export interface ErrorReport {
  schemaVersion?: number
  timestamp?: number
  command?: string
  message: string
  stack?: string
  context?: string
  version?: string
  nodeVersion?: string
  os?: string
  production?: boolean
}

/** Errors POST body: { schemaVersion, events: ErrorReport[] }. */
export interface ErrorBatch {
  schemaVersion?: number
  events: ErrorReport[]
}

/** Liveness heartbeat from `vectalon serve` / `vectalon daemon`. */
export interface HeartbeatPayload {
  schemaVersion?: number
  kind: 'serve' | 'daemon'
  version?: string
  startedAt?: number
  timestamp?: number
  activeModelProvider?: string
  os?: string
  projectType?: string
  pid?: number
  production?: boolean
}

/** Sanitized support bundle uploaded by `vectalon support --upload`. */
export interface SupportBundle {
  schemaVersion?: number
  token: string
  timestamp?: number
  version?: string
  nodeVersion?: string
  os?: string
  packageJson?: Record<string, unknown> | null
  logs?: string[]
  errorQueue?: ErrorReport[]
  vectalonState?: Array<{ path: string; size: number }>
  recipient?: string
}

/** Stored support submission (bundle + delivery metadata). */
export interface SupportRecord {
  bundle: SupportBundle
  receivedAt: string
  emailed: boolean
  emailError?: string
}

/** Storage backend contract. */
export interface Store {
  addError(event: ErrorReport): Promise<void>
  listErrors(limit?: number): Promise<ErrorReport[]>
  recordHeartbeat(beat: HeartbeatPayload): Promise<void>
  listHeartbeats(limit?: number): Promise<HeartbeatPayload[]>
  saveSupport(record: SupportRecord): Promise<void>
  listSupport(limit?: number): Promise<SupportRecord[]>
  counts(): Promise<{ errors: number; heartbeats: number; support: number }>
}

export const CAPS = {
  errors: 500,
  heartbeats: 200,
  support: 100,
} as const

export const HEARTBEAT_ACTIVE_WINDOW_MS = 10 * 60 * 1000

/**
 * Most recent heartbeat per kind+pid within the active window. Shared by the
 * /v1/health handler and the dashboard (single source of truth).
 */
export function activeHeartbeats(beats: HeartbeatPayload[], now: number): HeartbeatPayload[] {
  const latest = new Map<string, HeartbeatPayload>()
  for (const beat of beats) {
    const t = beat.timestamp ?? 0
    if (now - t > HEARTBEAT_ACTIVE_WINDOW_MS) continue
    const key = `${beat.kind}:${beat.pid ?? '?'}`
    const prev = latest.get(key)
    if (!prev || (prev.timestamp ?? 0) < t) latest.set(key, beat)
  }
  return [...latest.values()]
}

/** Error events are expected with these keys (loose validation). */
export function isErrorEvent(value: unknown): value is ErrorReport {
  return !!value && typeof value === 'object' && typeof (value as ErrorReport).message === 'string'
}

export function isHeartbeat(value: unknown): value is HeartbeatPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    ((value as HeartbeatPayload).kind === 'serve' || (value as HeartbeatPayload).kind === 'daemon')
  )
}

export function isSupportBundle(value: unknown): value is SupportBundle {
  return !!value && typeof value === 'object' && typeof (value as SupportBundle).token === 'string'
}
