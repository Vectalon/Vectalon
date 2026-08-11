/**
 * Structured error telemetry (P0-1)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Replaces the anonymous opt-in UsageReporter with a structured error reporter:
 * crash dumps, stack traces, and CLI command context are queued to a local JSON
 * file and POSTed to the Vectalon error endpoint. Errors-only and opt-out:
 * usage/feature tracking is NOT collected, and `telemetry.enabled=false` or
 * `telemetry.errors=false` in the user config disables everything. Captures are
 * silent on failure — a broken reporter must never mask the original error.
 *
 * Endpoint is overridable with RN_VECTALON_TELEMETRY_URL (used by the self-test
 * to verify the pipeline against a local HTTP server).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { platform, release, arch } from 'os'
import pkg from '../../package.json'
import { configDirPath, getConfig, setConfig } from '../config'
import { reportError } from '../utils/safe'
import { checkErrorClusterAlert } from './alerts'
import type { ErrorReport } from './types'

export const DEFAULT_TELEMETRY_BASE_URL = 'https://telemetry.vectalon.dev'
export const TELEMETRY_BASE_URL = process.env.RN_VECTALON_TELEMETRY_URL || DEFAULT_TELEMETRY_BASE_URL
export const ERROR_ENDPOINT = `${TELEMETRY_BASE_URL}/v1/errors`
export const HEARTBEAT_ENDPOINT = `${TELEMETRY_BASE_URL}/v1/heartbeat`
export const SUPPORT_ENDPOINT = `${TELEMETRY_BASE_URL}/v1/support`
/** The support address the upload backend routes to (embedded in the bundle). */
export const SUPPORT_RECIPIENT = 'neofaceless22@gmail.com'

export const MAX_QUEUED_ERRORS = 50

export interface CaptureErrorOptions {
  /** Write the queue here (default: <config-dir>/telemetry-queue.json). */
  queuePath?: string
  /** Include the full stack trace (default: true outside dev/test mode). */
  includeStack?: boolean
  /** Force capture on/off (tests use this to bypass the NODE_ENV gate). */
  enabled?: boolean
  /** Pass through to the queue file (round-trip verification in tests). */
  _now?: number
}

/** Whether error telemetry is active: opt-out, disabled in dev/test mode. */
export function errorsEnabled(): boolean {
  if (process.env.NODE_ENV === 'test') return false
  if (process.env.VECTALON_DEV_MODE === '1') return false
  if (getConfig('telemetry.enabled') === false) return false
  if (getConfig('telemetry.errors') === false) return false
  return true
}

/** Opt-out toggle for error reporting (setConfig-backed, testable). */
export function setErrorsEnabled(enabled: boolean): void {
  setConfig('telemetry.errors', enabled)
}

/** The CLI command under which the process is running (for context). */
export function commandContext(): string {
  const args = process.argv.slice(2)
  // argv[0] may be the subcommand name (e.g. "init") or a flag.
  return args[0] || 'vectalon'
}

function osLabel(): string {
  return `${platform()} ${release()} ${arch()}`
}

/**
 * Persistent install identity: a stable random clientId stored in the user
 * config dir, plus a best-effort project slug from the cwd package.json name.
 * Lets the admin error dashboard group errors by customer. Never throws.
 */
function clientIdentity(): { clientId: string; project?: string } {
  let clientId = ''
  try {
    const file = join(configDirPath(), 'client.json')
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as { clientId?: unknown }
      if (typeof parsed?.clientId === 'string' && parsed.clientId) clientId = parsed.clientId
    }
    if (!clientId) {
      clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
      mkdirSync(configDirPath(), { recursive: true })
      writeFileSync(file, JSON.stringify({ clientId }))
    }
  } catch (err) {
    reportError(err, 'errorReporter: client identity')
  }

  let project: string | undefined
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as {
      name?: unknown
    }
    if (typeof pkg?.name === 'string' && pkg.name.trim()) project = pkg.name.trim()
  } catch {
    // not running inside a package — no project slug
  }
  return { clientId, project }
}

/** Absolute queue path: project-local when a root is given, else user config. */
export function queuePathFor(root?: string): string {
  if (root) return join(root, '.vectalon', 'telemetry-queue.json')
  return join(configDirPath(), 'telemetry-queue.json')
}

/** Read the on-disk error queue (newest last). Never throws. */
export function readErrorQueue(queuePath: string): ErrorReport[] {
  try {
    if (!existsSync(queuePath)) return []
    const parsed = JSON.parse(readFileSync(queuePath, 'utf-8')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e): e is ErrorReport => !!e && typeof e === 'object' && typeof (e as ErrorReport).message === 'string')
  } catch (err) {
    reportError(err, 'errorReporter: reading queue')
    return []
  }
}

/** Persist the queue. Never throws. */
export function writeErrorQueue(queuePath: string, events: ErrorReport[]): void {
  try {
    mkdirSync(join(queuePath, '..'), { recursive: true })
    writeFileSync(queuePath, JSON.stringify(events, null, 2))
  } catch (err) {
    reportError(err, 'errorReporter: writing queue')
  }
}

/**
 * Capture one error: normalize it, dedupe by message (re-stamps the most
 * recent occurrence), cap the queue, and persist. Never throws.
 */
export function captureError(error: unknown, command: string, context?: string, options: CaptureErrorOptions = {}): ErrorReport | null {
  if (options.enabled === false || (options.enabled === undefined && !errorsEnabled())) return null
  const err = error instanceof Error ? error : new Error(String(error))
  const includeStack = options.includeStack ?? (errorsEnabled() && process.env.VECTALON_DEV_MODE !== '1')
  const report: ErrorReport = {
    schemaVersion: 1,
    timestamp: options._now ?? Date.now(),
    command,
    message: err.message || String(error),
    ...(includeStack && err.stack ? { stack: err.stack } : {}),
    ...(context ? { context } : {}),
    version: pkg.version,
    nodeVersion: process.version,
    os: osLabel(),
    ...(process.env.NODE_ENV !== 'test' ? { production: true } : {}),
    ...clientIdentity(),
  }

  const queuePath = options.queuePath || queuePathFor()
  const queue = readErrorQueue(queuePath).filter(e => e.message !== report.message)
  queue.push(report)
  writeErrorQueue(queuePath, queue.slice(-MAX_QUEUED_ERRORS))
  return report
}

/** Convenience: capture with the process's own command context. */
export function reportErrorTelemetry(error: unknown, context?: string): ErrorReport | null {
  return captureError(error, commandContext(), context)
}

export interface FlushErrorQueueOptions {
  queuePath?: string
  /** Injectable fetch (tests + self-test point this at a local server). */
  fetchFn?: typeof fetch
  /** Force the flush on/off (bypasses the errorsEnabled gate for tests). */
  enabled?: boolean
  endpoint?: string
  _now?: number
}

/**
 * POST every queued error event to the endpoint; on success clears the queue,
 * on failure keeps it (events are never dropped). Returns the number of
 * events flushed. Never throws.
 */
export async function flushErrorQueue(options: FlushErrorQueueOptions = {}): Promise<number> {
  if (options.enabled === false || (options.enabled === undefined && !errorsEnabled())) return 0
  const queuePath = options.queuePath || queuePathFor()
  const queue = readErrorQueue(queuePath)
  if (queue.length === 0) return 0

  // P2-19: a signature cluster in this batch (≥5 identical fingerprints in
  // 1h) posts to the admin webhook before the batch is flushed/cleared.
  checkErrorClusterAlert(queue, options._now)

  const fetchFn = options.fetchFn || globalThis.fetch
  const endpoint = options.endpoint || ERROR_ENDPOINT
  try {
    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, events: queue }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) {
      rmSync(queuePath, { force: true })
      return queue.length
    }
    return 0
  } catch (err) {
    reportError(err, 'errorReporter: flushing queue')
    return 0
  }
}
