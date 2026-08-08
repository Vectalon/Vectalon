/**
 * Crash-rate anomaly detection & auto-rollout gates — M18.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Extends the deterministic CrashMonitor with statistical anomaly detection
 * (z-score) over the crash-rate time series. Crashes that carry a timestamp
 * are bucketed into hourly windows; a baseline (mean + stdDev) is built from
 * the historical buckets or loaded from the knowledge base; the current
 * window's rate is then scored as z = (rate − mean) / stdDev. When the spike
 * exceeds baseline + n·stdDev (default 3σ) an incident is auto-filed with a
 * rollback suggestion — the auto-rollout gate.
 *
 * Baselines are persisted in the knowledge base (same pattern as
 * perf/baseline.ts), so the gate is self-learning: after each healthy window
 * the richer of the stored vs newly-derived baseline is persisted, and the
 * next release is compared against accumulated history. A spike window never
 * overwrites the stored baseline — the gate stays strict until the release is
 * rolled back or fixed.
 *
 * Semantics: the "current window" is the most recent **non-empty** hourly
 * bucket (empty buckets are excluded from both the series and the baseline),
 * so the detector compares the latest active hour's rate against the mean of
 * prior active-hour rates. Crashes that carry no timestamp cannot form a
 * series and are handled by the ratio fallback in CrashMonitor.
 *
 * Fully deterministic — no model calls.
 */

import { ArtifactStore } from '../knowledge/ArtifactStore'
import { IncidentAnalyzer } from './IncidentAnalyzer'
import type { ParsedCrash } from '../knowledge/telemetry'

/** One point in the crash-rate time series. */
export interface CrashRateSample {
  /** Bucket start time (epoch ms). */
  bucketStart: number
  /** Crashes observed in the bucket. */
  count: number
  /** Normalized rate: crashes per 1k sessions per day. */
  rate: number
}

/** Statistical distribution a window is compared against. */
export interface CrashAnomalyBaseline {
  mean: number
  stdDev: number
  /** Number of historical buckets the baseline was derived from. */
  sampleCount: number
  capturedAt: number
  windowHours: number
  bucketHours: number
}

export interface CrashAnomalyOptions {
  /** Monitoring window in hours (default 24). */
  windowHours?: number
  /** Bucket size in hours for the time series (default 1). */
  bucketHours?: number
  /** Z-score threshold — spike when rate exceeds mean + n·stdDev (default 3). */
  zScoreThreshold?: number
  /** Minimum historical buckets required for a statistical baseline (default 5). */
  minSamples?: number
  /** Assumed sessions per day for rate normalization (default 1000). */
  sessions?: number
  /** Explicit baseline (e.g. loaded from the KB) — skips history derivation. */
  baseline?: CrashAnomalyBaseline | null
}

export interface CrashAnomalyResult {
  detected: boolean
  /** z = (currentRate − mean) / stdDev; null when no baseline is available. */
  zScore: number | null
  currentRate: number
  baseline: CrashAnomalyBaseline | null
  /** Rollout gate severity: 'rollback' | 'watch' | 'ok'. */
  action: 'rollback' | 'watch' | 'ok'
  /** The threshold that was applied (for reporting). */
  zScoreThreshold: number
  message: string
  series: CrashRateSample[]
}

export interface AnomalyMonitorResult {
  result: CrashAnomalyResult
  incident: ReturnType<IncidentAnalyzer['analyze']> | null
  report: string
}

const DEFAULT_SESSIONS_PER_DAY = 1000
const BASELINE_TYPE = 'telemetry' as const
const BASELINE_KIND = 'crash-rate-baseline'
const MAX_BASELINES = 10

/**
 * Bucket crashes by timestamp into hourly windows and normalize each bucket's
 * rate to crashes per 1k sessions per day (the same scale as the ratio-based
 * baseline, so the numbers stay comparable). Crashes without a timestamp are
 * skipped — they cannot form a series and are handled by the ratio fallback.
 */
export function bucketCrashSeries(
  crashes: ParsedCrash[],
  options: { bucketHours?: number; sessions?: number } = {}
): CrashRateSample[] {
  const bucketHours = options.bucketHours ?? 1
  const sessions = options.sessions ?? DEFAULT_SESSIONS_PER_DAY
  const bucketMs = bucketHours * 3600_000
  const counts = new Map<number, number>()
  for (const crash of crashes) {
    if (typeof crash.timestamp !== 'number') continue
    const bucketStart = Math.floor(crash.timestamp / bucketMs) * bucketMs
    counts.set(bucketStart, (counts.get(bucketStart) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucketStart, count]) => ({
      bucketStart,
      count,
      rate: Number((count / (bucketHours / 24) / sessions * 1000).toFixed(3)),
    }))
}

/**
 * Build a statistical baseline from the historical buckets (all but the
 * latest). Returns null when there is not enough history — the caller then
 * reports a `watch` instead of a false spike.
 */
export function deriveAnomalyBaseline(
  series: CrashRateSample[],
  options: CrashAnomalyOptions = {}
): CrashAnomalyBaseline | null {
  if (series.length < 2) return null
  const history = series.slice(0, -1)
  const minSamples = options.minSamples ?? 5
  if (history.length < minSamples) return null
  const mean = history.reduce((sum, s) => sum + s.rate, 0) / history.length
  // Sample stdDev (Bessel's correction, n−1): with small sample sizes the
  // population stdDev under-estimates spread and would cause false spikes.
  const variance = history.reduce((sum, s) => sum + (s.rate - mean) ** 2, 0) / (history.length - 1)
  return {
    mean,
    stdDev: Math.sqrt(variance),
    sampleCount: history.length,
    capturedAt: Date.now(),
    windowHours: options.windowHours ?? 24,
    bucketHours: options.bucketHours ?? 1,
  }
}

/**
 * Detect a crash-rate anomaly in the current window vs the baseline. The
 * current window is the latest bucket; the baseline comes from an explicit
 * value (KB-loaded) or is derived from the historical buckets.
 */
export function detectCrashAnomaly(
  crashes: ParsedCrash[],
  options: CrashAnomalyOptions = {}
): CrashAnomalyResult {
  const zThreshold = options.zScoreThreshold ?? 3.0
  const series = bucketCrashSeries(crashes, options)

  if (series.length === 0) {
    const noCrashes = crashes.length === 0
    return {
      detected: false,
      zScore: null,
      currentRate: 0,
      baseline: null,
      zScoreThreshold: zThreshold,
      action: noCrashes ? 'ok' : 'watch',
      message: noCrashes
        ? 'No crashes in the monitoring window — release is healthy.'
        : `${crashes.length} crash(es) without timestamps — cannot build a time series; use the ratio baseline (--baseline) or re-export telemetry with timestamps.`,
      series,
    }
  }

  const current = series[series.length - 1]
  const baseline = options.baseline ?? deriveAnomalyBaseline(series, options)

  if (!baseline) {
    return {
      detected: false,
      zScore: null,
      currentRate: current.rate,
      baseline: null,
      zScoreThreshold: zThreshold,
      action: 'watch',
      message: `${current.count} crash(es) in the current window (${current.rate}/1k sessions/day) — not enough history for a statistical baseline (need ≥ ${options.minSamples ?? 5} buckets); monitoring.`,
      series,
    }
  }

  const zScore =
    baseline.stdDev === 0
      ? current.rate > baseline.mean
        ? Number.POSITIVE_INFINITY
        : 0
      : Number(((current.rate - baseline.mean) / baseline.stdDev).toFixed(2))
  const detected = zScore >= zThreshold
  const action: CrashAnomalyResult['action'] = detected ? 'rollback' : zScore >= 1 ? 'watch' : 'ok'
  const renderZ = zScore === Number.POSITIVE_INFINITY ? '∞' : String(zScore)
  const release = crashes.find(c => c.release)?.release || 'current'

  const message = detected
    ? `Crash rate ${current.rate}/1k sessions/day is ${renderZ}σ above the baseline mean ${baseline.mean.toFixed(2)} (σ ${baseline.stdDev.toFixed(2)}) — **recommend rollback** of release ${release}.`
    : `Crash rate ${current.rate}/1k sessions/day is ${renderZ}σ vs baseline mean ${baseline.mean.toFixed(2)} (σ ${baseline.stdDev.toFixed(2)}) — within threshold (${zThreshold}σ).`

  return { detected, zScore, currentRate: current.rate, baseline, action, zScoreThreshold: zThreshold, message, series }
}

/** Persist a baseline snapshot; returns the previous baseline (or null). */
export function recordCrashBaseline(
  store: ArtifactStore,
  baseline: CrashAnomalyBaseline
): CrashAnomalyBaseline | null {
  const previous = getLatestCrashBaseline(store)
  const content = [
    '# Crash-rate baseline',
    '',
    `- Mean rate: ${baseline.mean.toFixed(3)}/1k sessions/day`,
    `- StdDev: ${baseline.stdDev.toFixed(3)}`,
    `- Samples: ${baseline.sampleCount} buckets`,
    `- Window: ${baseline.windowHours}h (${baseline.bucketHours}h buckets)`,
    `- Captured: ${new Date(baseline.capturedAt).toISOString()}`,
  ].join('\n')
  store.add({
    type: BASELINE_TYPE,
    title: 'Crash-rate baseline',
    content,
    source: 'generated',
    status: 'active',
    meta: {
      kind: BASELINE_KIND,
      mean: String(baseline.mean),
      stdDev: String(baseline.stdDev),
      sampleCount: String(baseline.sampleCount),
      windowHours: String(baseline.windowHours),
      bucketHours: String(baseline.bucketHours),
    },
  })
  trimBaselines(store)
  return previous
}

/** The most recent baseline artifact (parsed from its meta), or null. */
export function getLatestCrashBaseline(store: ArtifactStore): CrashAnomalyBaseline | null {
  const candidates = store
    .list()
    .filter(a => a.type === BASELINE_TYPE && a.meta?.kind === BASELINE_KIND)
  const latest = candidates[candidates.length - 1]
  if (!latest) return null
  const mean = Number(latest.meta?.mean)
  const stdDev = Number(latest.meta?.stdDev)
  if (!Number.isFinite(mean) || !Number.isFinite(stdDev)) return null
  return {
    mean,
    stdDev,
    sampleCount: Number(latest.meta?.sampleCount) || 0,
    capturedAt: latest.createdAt,
    windowHours: Number(latest.meta?.windowHours) || 24,
    bucketHours: Number(latest.meta?.bucketHours) || 1,
  }
}

/** Trim baselines beyond the cap (insertion order). */
function trimBaselines(store: ArtifactStore): void {
  const baselines = store.list().filter(a => a.type === BASELINE_TYPE && a.meta?.kind === BASELINE_KIND)
  const excess = baselines.length - MAX_BASELINES
  if (excess <= 0) return
  for (const artifact of baselines.slice(0, excess)) {
    store.remove(artifact.id)
  }
}

/**
 * Full anomaly monitor pass: detect the z-score anomaly, auto-file an incident
 * (via the existing IncidentAnalyzer) when it spikes, and refresh the KB
 * baseline — but only on healthy windows, so a spike never poisons the gate.
 */
export function monitorReleaseAnomaly(
  crashes: ParsedCrash[],
  options: CrashAnomalyOptions = {},
  store?: ArtifactStore
): AnomalyMonitorResult {
  const stored =
    options.baseline !== undefined ? options.baseline : store ? getLatestCrashBaseline(store) : null
  // Derive from the current window when it carries enough history — the
  // telemetry export accumulates across runs, so this baseline absorbs the
  // latest data and genuinely learns. Prefer the richer baseline (more
  // samples) for comparison, falling back to the stored one otherwise.
  const derived = deriveAnomalyBaseline(bucketCrashSeries(crashes, options), options)
  const baseline = stored && (!derived || derived.sampleCount <= stored.sampleCount) ? stored : derived
  const result = detectCrashAnomaly(crashes, { ...options, baseline })

  let incident: AnomalyMonitorResult['incident'] = null
  if (result.detected && crashes.length > 0) {
    const release = crashes.find(c => c.release)?.release || 'unknown'
    incident = new IncidentAnalyzer().analyze({
      title: `Crash-rate anomaly after release ${release}`,
      description: `Crash rate spiked ${result.zScore === Number.POSITIVE_INFINITY ? '>∞' : `${result.zScore}σ`} above the baseline mean in the ${options.windowHours ?? 24}h monitoring window (z-score anomaly detection).`,
      crashes,
    })
  }

  // Healthy windows refresh the baseline (the richer of stored vs derived);
  // spike windows leave the stored baseline untouched so the gate stays strict.
  if (store && baseline && !result.detected) {
    recordCrashBaseline(store, baseline)
  }

  return { result, incident, report: renderAnomalyReport(result, incident) }
}

/** Render the anomaly monitor pass as a markdown report. */
export function renderAnomalyReport(result: CrashAnomalyResult, incident: AnomalyMonitorResult['incident']): string {
  const lines: string[] = []
  lines.push('## 📡 Release monitor (z-score)')
  lines.push('')
  if (result.detected) {
    lines.push(`🔴 **Crash-rate anomaly detected** — ${result.message}`)
  } else if (result.action === 'watch') {
    lines.push(`🟡 ${result.message}`)
  } else {
    lines.push(`🟢 ${result.message}`)
  }
  lines.push('')
  const total = result.series.reduce((sum, s) => sum + s.count, 0)
  lines.push(`- Crashes in window: **${total}** over ${result.series.length} bucket(s)`)
  lines.push(`- Current rate: **${result.currentRate}/1k sessions/day**`)
  if (result.baseline) {
    lines.push(`- Baseline: mean ${result.baseline.mean.toFixed(2)}, σ ${result.baseline.stdDev.toFixed(2)} (${result.baseline.sampleCount} bucket(s))`)
    if (result.zScore !== null) {
      lines.push(`- Z-score: ${result.zScore === Number.POSITIVE_INFINITY ? '∞' : result.zScore} (threshold ${result.zScoreThreshold}σ)`)
    }
  } else {
    lines.push('- Baseline: not established yet — collecting history')
  }
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
  } else if (result.detected) {
    lines.push('**Rollback is recommended** — verify the crash window manually.')
  } else {
    lines.push('No incident filed — crash rate is within the statistical threshold.')
  }
  return lines.join('\n')
}
