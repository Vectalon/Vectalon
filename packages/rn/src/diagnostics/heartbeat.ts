/**
 * Liveness heartbeat (P0-3)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Every 5 minutes `vectalon serve` and `vectalon daemon` POST a lightweight
 * health ping (version, uptime, active model provider, OS, project type) to
 * the telemetry endpoint. This is NOT usage tracking — it is liveness: a
 * broken release is visible within one interval. Disabled alongside error
 * telemetry via `telemetry.enabled=false` and always off in dev/test mode.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import pkg from '../../package.json'
import { platform, release, arch } from 'os'
import { HEARTBEAT_ENDPOINT, errorsEnabled } from './errorReporter'
import { recordHeartbeatPing } from './alerts'
import { reportError } from '../utils/safe'
import type { HeartbeatPayload } from './types'

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

export interface HeartbeatOptions {
  /** 'serve' | 'daemon' */
  kind: 'serve' | 'daemon'
  /** Project root (used to derive the project flavor). */
  root?: string
  /** Active model provider label, e.g. "openai (gpt-4o)". */
  modelProvider?: string
  /** Project flavor override; auto-detected from package.json when omitted. */
  projectType?: string
  /** Ping interval (default 5 min). */
  intervalMs?: number
  /** Injectable fetch (tests + self-test). */
  fetchFn?: typeof fetch
  /** Endpoint override (tests). */
  endpoint?: string
  /** Force send on/off (bypasses the errorsEnabled opt-out gate for tests). */
  enabled?: boolean
  startedAt?: number
}

/** Detect the project flavor from package.json deps. */
export function detectProjectType(root: string): 'expo' | 'rn-cli' | 'unknown' {
  try {
    const pkgJson = readFileSync(join(root, 'package.json'), 'utf-8')
    const deps = (JSON.parse(pkgJson).dependencies || {}) as Record<string, string>
    if (deps.expo) return 'expo'
    if (deps['react-native']) return 'rn-cli'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Build the payload for one heartbeat. */
export function buildHeartbeatPayload(options: HeartbeatOptions): HeartbeatPayload {
  return {
    schemaVersion: 1,
    kind: options.kind,
    version: pkg.version,
    startedAt: options.startedAt ?? Date.now(),
    timestamp: Date.now(),
    activeModelProvider: options.modelProvider || 'not configured',
    os: `${platform()} ${release()} ${arch()}`,
    projectType: options.projectType || (options.root ? detectProjectType(options.root) : 'unknown'),
    pid: process.pid,
    ...(process.env.NODE_ENV !== 'test' ? { production: true } : {}),
  }
}

/** Send one heartbeat; returns true when the endpoint accepted it. Never throws. */
export async function sendHeartbeat(options: HeartbeatOptions): Promise<boolean> {
  // Self-gate on the same opt-out as error telemetry so a direct API caller
  // cannot bypass telemetry.enabled=false; tests pass enabled:true explicitly.
  if (options.enabled === false || (options.enabled === undefined && !errorsEnabled())) return false
  const payload = buildHeartbeatPayload(options)
  const fetchFn = options.fetchFn || globalThis.fetch
  const endpoint = options.endpoint || HEARTBEAT_ENDPOINT
  try {
    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) {
      // P2-19: record the successful ping so a later run can detect a
      // heartbeat that went silent for >30 min (stale-state alert).
      recordHeartbeatPing(options.root, options.kind)
    }
    return res.ok
  } catch (err) {
    reportError(err, 'heartbeat: sending liveness ping')
    return false
  }
}

export interface HeartbeatHandle {
  stop(): void
}

/**
 * Start periodic liveness pings (first ping immediately, then every
 * intervalMs). The interval is unref'd so it never keeps the process alive on
 * its own — the serve/daemon HTTP servers already do that. Returns a handle to
 * stop pinging (call on shutdown).
 */
export function startHeartbeat(options: HeartbeatOptions): HeartbeatHandle {
  const intervalMs = options.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS
  const startedAt = options.startedAt ?? Date.now()

  // Immediately signal liveness at startup.
  if (errorsEnabled()) {
    void sendHeartbeat({ ...options, startedAt })
  }

  const interval = setInterval(() => {
    if (errorsEnabled()) {
      void sendHeartbeat({ ...options, startedAt })
    }
  }, intervalMs)
  if (process.env.NODE_ENV !== 'test') interval.unref()

  return {
    stop() {
      clearInterval(interval)
    },
  }
}
