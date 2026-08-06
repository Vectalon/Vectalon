import { IncidentAnalyzer } from './IncidentAnalyzer'
import type { ParsedCrash } from '../knowledge/telemetry'

/**
 * Autonomous release monitor — Phase II-2.
 *
 * After a release ships, monitor the crash rate for a window and auto-file an
 * incident (with a rollback suggestion) when it spikes above the baseline.
 * Fully deterministic — no model calls.
 */

export interface CrashMonitorOptions {
  /** Comparison baseline in crashes per 1,000 sessions (or per day). */
  baselineRate: number | null
  /** Monitoring window in hours (default 24). */
  windowHours?: number
  /** Spike threshold as a multiple of the baseline (default 2.0 = double). */
  threshold?: number
  /** Assumed session count for the window when not derivable from the crashes. */
  sessions?: number
}

export interface CrashSpike {
  spiked: boolean
  currentRate: number
  baselineRate: number | null
  ratio: number | null
  threshold: number
  windowHours: number
  crashCount: number
  /** Rollback suggestion severity: 'rollback' | 'watch' | 'ok'. */
  action: 'rollback' | 'watch' | 'ok'
  message: string
}

export interface MonitorResult {
  spike: CrashSpike
  incident: ReturnType<IncidentAnalyzer['analyze']> | null
  report: string
}

const DEFAULT_SESSIONS_PER_DAY = 1000

/**
 * Compute the crash rate for a batch of crashes in a window. When `sessions`
 * is not given, the rate is normalized to crashes per 1,000 sessions per day
 * using the default session volume — a comparable, deterministic baseline.
 */
export function analyzeCrashRate(crashes: ParsedCrash[], options: CrashMonitorOptions): CrashSpike {
  const windowHours = options.windowHours ?? 24
  const threshold = options.threshold ?? 2.0
  const crashCount = crashes.length

  if (crashCount === 0 || options.baselineRate === null) {
    const action: CrashSpike['action'] = options.baselineRate === null && crashCount > 0 ? 'watch' : 'ok'
    return {
      spiked: false,
      currentRate: crashCount === 0 ? 0 : Number((crashCount / (windowHours / 24) / (options.sessions || DEFAULT_SESSIONS_PER_DAY) * 1000).toFixed(3)),
      baselineRate: options.baselineRate,
      ratio: null,
      threshold,
      windowHours,
      crashCount,
      action,
      message: action === 'watch'
        ? `${crashCount} crash(es) in the ${windowHours}h window; no baseline to compare — monitoring.`
        : 'No crashes in the monitoring window — release is healthy.',
    }
  }

  // Rate = crashes per 1,000 sessions per day (normalized from the window).
  const days = windowHours / 24
  const sessions = options.sessions || DEFAULT_SESSIONS_PER_DAY
  const currentRate = Number(((crashCount / days) / sessions * 1000).toFixed(3))
  const ratio = Number((currentRate / options.baselineRate).toFixed(2))
  const spiked = ratio >= threshold

  const action: CrashSpike['action'] = spiked ? 'rollback' : 'ok'
  return {
    spiked,
    currentRate,
    baselineRate: options.baselineRate,
    ratio,
    threshold,
    windowHours,
    crashCount,
    action,
    message: spiked
      ? `Crash rate ${currentRate}/1k sessions is ${ratio}x the baseline (${options.baselineRate}/1k) — **recommend rollback** of release ${crashes[0]?.release || 'current'}.`
      : `Crash rate ${currentRate}/1k sessions is ${ratio}x the baseline (${options.baselineRate}/1k) — within threshold (${threshold}x).`,
  }
}

/**
 * Full monitor pass: analyze the crash rate, file an incident when it spikes
 * (via the existing IncidentAnalyzer, so the report matches the rest of the
 * harness), and render the final monitor report.
 */
export function monitorRelease(crashes: ParsedCrash[], options: CrashMonitorOptions): MonitorResult {
  const spike = analyzeCrashRate(crashes, options)

  let incident: MonitorResult['incident'] = null
  if (spike.spiked && crashes.length > 0) {
    // Severity is derived from the crash facts (volume + keywords) by the
    // IncidentAnalyzer — a marginal 2.1x spike with 3 crashes is sev2, a
    // flood of OOM/SIGSEGV crashes is sev1.
    incident = new IncidentAnalyzer().analyze({
      title: `Crash-rate spike after release ${crashes[0].release || 'unknown'}`,
      description: `Crash rate spiked to ${spike.currentRate}/1k sessions (${spike.ratio}x baseline) in the ${spike.windowHours}h monitoring window.`,
      crashes,
    })
  }

  const report = renderMonitorReport(spike, incident)
  return { spike, incident, report }
}

/** Render the monitor pass as a markdown report. */
export function renderMonitorReport(spike: CrashSpike, incident: MonitorResult['incident']): string {
  const lines: string[] = []
  lines.push('## 📡 Release monitor')
  lines.push('')
  if (spike.spiked) {
    lines.push(`🔴 **Crash-rate spike detected** — ${spike.message}`)
  } else {
    lines.push(`🟢 ${spike.message}`)
  }
  lines.push('')
  lines.push(`- Crashes in window: **${spike.crashCount}** over ${spike.windowHours}h`)
  lines.push(`- Current rate: **${spike.currentRate}/1k sessions/day**`)
  lines.push(spike.baselineRate !== null ? `- Baseline: ${spike.baselineRate}/1k sessions/day` : '- Baseline: not configured')
  if (spike.ratio !== null) lines.push(`- Ratio: ${spike.ratio}x (threshold ${spike.threshold}x)`)
  lines.push('')
  if (incident) {
    lines.push('### Auto-filed incident')
    lines.push('')
    lines.push(`- **Severity:** ${incident.severity}`)
    lines.push(`- **Impact:** ${incident.impact}`)
    lines.push(`- **Probable cause:** ${incident.probableCause}`)
    lines.push(`- **Cause bucket:** ${incident.causeBucket}`)
    lines.push('')
    lines.push('**Suggested action: roll back the release.**')
  } else {
    lines.push('No incident filed — crash rate is within threshold.')
  }
  return lines.join('\n')
}
