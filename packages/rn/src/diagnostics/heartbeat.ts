/**
 * Liveness heartbeat (P0-3)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Every 5 minutes `vectalon serve` and `vectalon daemon` POST a lightweight
 * health ping (version, uptime, active model provider, OS, project type) to
 * the telemetry endpoint. This is NOT usage tracking — it is liveness: a
 * broken release is visible within one interval. Requires separate explicit
 * `telemetry.heartbeat=true` consent; `telemetry.enabled=false` disables it.
 * Always off in dev/test mode unless explicitly injected for testing.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import pkg from '../../package.json'
import { platform, release, arch } from 'os'
import { HEARTBEAT_ENDPOINT } from './errorReporter'
import { getConfig } from '../config'
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
  /** Test injection; never overrides explicit configuration opt-out. */
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

/** Heartbeat consent is independent of error-report consent. */
function heartbeatEnabled(enabled?: boolean): boolean {
  if (getConfig('telemetry.enabled') === false || getConfig('telemetry.heartbeat') === false) return false
  if (enabled !== undefined) return enabled
  if (process.env.NODE_ENV === 'test' || process.env.VECTALON_DEV_MODE === '1') return false
  return getConfig('telemetry.heartbeat') === true
}

/** Send one heartbeat; returns true when the endpoint accepted it. Never throws. */
export async function sendHeartbeat(options: HeartbeatOptions): Promise<boolean> {
  if (!heartbeatEnabled(options.enabled)) return false
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
  if (heartbeatEnabled(options.enabled)) {
    void sendHeartbeat({ ...options, startedAt })
  }

  const interval = setInterval(() => {
    if (heartbeatEnabled(options.enabled)) {
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
