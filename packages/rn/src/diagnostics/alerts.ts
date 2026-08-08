/**
 * Admin alert webhook (P2-19).
 *
 * Wake up on patterns, not refunds. When the error telemetry pipeline sees
 * ≥5 errors with the same stack signature inside 1 hour, or a serve/daemon
 * heartbeat goes silent for >30 minutes from an active license, POST a
 * structured alert to a Discord/Slack webhook (VECTALON_ALERT_WEBHOOK).
 * Each alert carries the stack fingerprint, affected versions, and OS counts
 * — "14 Windows users can't init", not "why are refunds spiking?".
 *
 * Alerting is off by default (no webhook URL) and every send is best-effort.
 * Per-signature dedupe state lives in the user config dir so a cluster is
 * alerted once per window, not on every flush.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import pkg from '../../package.json'
import { LicenseStore, LicenseValidator, TrialTracker } from '@vectalon-dev/core'
import { configDirPath } from '../config'
import { reportError } from '../utils/safe'
import type { ErrorReport } from './types'

/** Discord/Slack webhook URL; empty = alerting disabled. */
export const ALERT_WEBHOOK_URL = process.env.VECTALON_ALERT_WEBHOOK || ''
/** Errors with the same signature inside this window trigger an alert. */
export const ERROR_CLUSTER_THRESHOLD = 5
export const ERROR_CLUSTER_WINDOW_MS = 60 * 60 * 1000
/** A heartbeat older than this triggers the "silent" alert. */
export const HEARTBEAT_STALE_MS = 30 * 60 * 1000

const ALERT_STATE_FILE = 'alerts-state.json'

/** Stable fingerprint for an error: first two stack frames, else the message. */
export function errorFingerprint(event: ErrorReport): string {
  if (event.stack) {
    const frames = event.stack.split('\n').slice(1, 3).map(f => f.trim()).filter(Boolean).join('|')
    if (frames) return frames
  }
  return event.message || 'unknown'
}

function readAlertState(): Record<string, { alertedAt: number }> {
  try {
    const file = join(configDirPath(), ALERT_STATE_FILE)
    if (!existsSync(file)) return {}
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, { alertedAt: number }>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAlertState(state: Record<string, { alertedAt: number }>): void {
  try {
    const dir = configDirPath()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, ALERT_STATE_FILE), JSON.stringify(state, null, 2))
  } catch (err) {
    reportError(err, 'alerts: writing alert state')
  }
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const k = key(item)
    counts[k] = (counts[k] || 0) + 1
  }
  return counts
}

/** Build the human-readable webhook message. */
export function buildAlertText(payload: Record<string, unknown>): string {
  switch (payload.type) {
    case 'error-cluster': {
      const osCounts = (payload.osCounts as Record<string, number>) || {}
      const osLine = Object.entries(osCounts)
        .map(([os, n]) => `${n}× ${os}`)
        .join(', ')
      return [
        `🚨 **Vectalon error cluster** — ${payload.count} errors with the same signature in the last hour`,
        `**Fingerprint:** \`${payload.fingerprint}\``,
        `**Affected versions:** ${(payload.affectedVersions as string[]).join(', ')}`,
        `**OS:** ${osLine || 'unknown'}`,
        `**Commands:** ${((payload.commands as string[]) || []).join(', ') || 'unknown'}`,
      ].join('\n')
    }
    case 'heartbeat-stale': {
      return [
        `⚠️ **Vectalon heartbeat silent** — ${payload.kind} has not pinged for >30 minutes (active license)`,
        `**Last ping:** ${new Date(payload.lastPingAt as number).toISOString()}`,
        `**Version:** ${payload.version ?? pkg.version}`,
      ].join('\n')
    }
    default:
      return JSON.stringify(payload, null, 2)
  }
}

/** POST an alert to the webhook (Discord + Slack compatible). Best-effort. */
export async function sendAdminAlert(payload: Record<string, unknown>): Promise<boolean> {
  if (!ALERT_WEBHOOK_URL) return false
  try {
    const text = buildAlertText(payload)
    const res = await fetch(ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Both Discord ({content}) and Slack ({text}) understand these keys.
      body: JSON.stringify({ content: text, text }),
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok
  } catch (err) {
    reportError(err, 'alerts: sending admin alert')
    return false
  }
}

/**
 * Scan a batch of queued errors for a signature cluster (≥5 identical
 * fingerprints in 1h) and alert once per window per signature. No-op when no
 * webhook is configured.
 */
export function checkErrorClusterAlert(events: ErrorReport[], now = Date.now()): void {
  if (!ALERT_WEBHOOK_URL) return
  if (!Array.isArray(events) || events.length === 0) return

  const windowed = events.filter(e => now - (e.timestamp || 0) < ERROR_CLUSTER_WINDOW_MS)
  const byFingerprint = new Map<string, ErrorReport[]>()
  for (const event of windowed) {
    const fingerprint = errorFingerprint(event)
    const group = byFingerprint.get(fingerprint) || []
    group.push(event)
    byFingerprint.set(fingerprint, group)
  }

  const state = readAlertState()
  let changed = false
  for (const [fingerprint, group] of byFingerprint) {
    if (group.length < ERROR_CLUSTER_THRESHOLD) continue
    const last = state[fingerprint]
    if (last && now - last.alertedAt < ERROR_CLUSTER_WINDOW_MS) continue // already alerted this window
    void sendAdminAlert({
      type: 'error-cluster',
      fingerprint,
      count: group.length,
      windowMs: ERROR_CLUSTER_WINDOW_MS,
      affectedVersions: [...new Set(group.map(e => e.version).filter(Boolean))],
      osCounts: countBy(group, e => e.os || 'unknown'),
      commands: [...new Set(group.map(e => e.command).filter(Boolean))],
    })
    // Mark as alerted synchronously (single write below) — dedupe is about
    // not spamming the webhook within a window, not about retry-on-failure.
    state[fingerprint] = { alertedAt: now }
    changed = true
  }
  if (changed) writeAlertState(state)
}

/** Where a serve/daemon records its last successful heartbeat ping. */
export function heartbeatStatePath(root: string): string {
  return join(root, '.vectalon', 'heartbeat.json')
}

/** Record a successful liveness ping (called by the heartbeat sender). */
export function recordHeartbeatPing(root: string | undefined, kind: string): void {
  if (!root) return
  try {
    const path = heartbeatStatePath(root)
    mkdirSync(join(path, '..'), { recursive: true })
    const existing: { kind?: string; lastPingAt?: number } = {}
    try {
      if (existsSync(path)) Object.assign(existing, JSON.parse(readFileSync(path, 'utf-8')))
    } catch {
      // ignore malformed state
    }
    writeFileSync(path, JSON.stringify({ ...existing, kind, lastPingAt: Date.now() }, null, 2))
  } catch (err) {
    reportError(err, 'alerts: recording heartbeat ping')
  }
}

/** True when a license or an active trial is present. */
export function hasActiveLicense(): boolean {
  try {
    const license = LicenseStore.read()
    if (license?.key) {
      const validation = LicenseValidator.validate(license.key)
      if (validation.valid) return true
    }
    const days = TrialTracker.daysRemaining()
    return typeof days === 'number' && days >= 0
  } catch {
    return false
  }
}

/**
 * Alert when the last heartbeat ping is older than 30 minutes and the project
 * has an active license/trial (a paying user whose serve silently died).
 * Deduped to once per stale window. Called at serve/daemon/status startup —
 * the next run after the gap is what surfaces the silence.
 */
export function checkHeartbeatStaleness(root: string, now = Date.now()): void {
  if (!ALERT_WEBHOOK_URL) return
  if (!hasActiveLicense()) return
  let state: { kind?: string; lastPingAt?: number; alertedAt?: number }
  try {
    const path = heartbeatStatePath(root)
    if (!existsSync(path)) return
    state = JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return
  }
  if (!state || typeof state.lastPingAt !== 'number') return
  if (now - state.lastPingAt <= HEARTBEAT_STALE_MS) return
  if (state.alertedAt && now - state.alertedAt < HEARTBEAT_STALE_MS) return

  void sendAdminAlert({
    type: 'heartbeat-stale',
    kind: state.kind || 'serve',
    lastPingAt: state.lastPingAt,
    version: pkg.version,
  }).then(ok => {
    if (ok) {
      try {
        writeFileSync(heartbeatStatePath(root), JSON.stringify({ ...state, alertedAt: now }, null, 2))
      } catch (err) {
        reportError(err, 'alerts: recording heartbeat alert')
      }
    }
  })
}
