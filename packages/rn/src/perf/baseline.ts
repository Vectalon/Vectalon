/**
 * vectalon profile — performance baselines in the knowledge base
 * Business Source License 1.1 (BSL-1.1)
 *
 * Each analysis run can be persisted as a baseline `analytics` artifact (the
 * same pattern as bundle snapshots in `knowledge/bundleHistory.ts`), so the
 * team brain sees the runtime history like any other artifact. Comparing a new
 * run against the stored baseline flags regressions:
 *
 * - JS-thread blocking time up more than N% (default 25%)
 * - Retained heap up more than N% (default 30%)
 *
 * Deterministic — thresholds only, no model calls.
 */

import { ArtifactStore } from '../knowledge/ArtifactStore'
import type { PerfAnalysis, PerfBaselineSummary, PerfCompareResult, PerfFinding, PerfAnalyzeOptions } from './types'
import { formatBytes } from '../utils/bundleAnalyzer'

const TITLE_PREFIX = 'Hermes perf baseline'
const BASELINE_TYPE = 'analytics' as const
/** Keep at most this many baselines so artifacts.json stays bounded. */
const MAX_BASELINES = 10

/** Build a compact, comparable summary from a full analysis. */
export function summarizeAnalysis(analysis: PerfAnalysis, label = 'default'): PerfBaselineSummary {
  return {
    capturedAt: Date.now(),
    label,
    totalBlockingMs: analysis.cpu?.totalBlockingMs ?? 0,
    totalRetainedBytes: analysis.heap?.totalRetainedBytes ?? null,
    totalHeapBytes: analysis.heap?.totalHeapBytes ?? null,
    hotFunction: analysis.cpu?.hotFunctions[0]?.functionName ?? null,
    topRetainedObject: analysis.heap?.topRetained[0]?.name ?? null,
  }
}

/** Persist a baseline snapshot; returns the previous baseline (or null). */
export function recordPerfBaseline(
  store: ArtifactStore,
  analysis: PerfAnalysis,
  label = 'default'
): PerfBaselineSummary | null {
  const previous = getLatestPerfBaseline(store, label)
  const summary = summarizeAnalysis(analysis, label)

  const content = [
    `# Hermes perf baseline (${label})`,
    '',
    `- JS-thread blocking: ${summary.totalBlockingMs}ms`,
    `- Retained: ${summary.totalRetainedBytes !== null ? formatBytes(summary.totalRetainedBytes) : 'n/a'}`,
    `- Heap total: ${summary.totalHeapBytes !== null ? formatBytes(summary.totalHeapBytes) : 'n/a'}`,
    `- Hot function: ${summary.hotFunction ?? 'n/a'}`,
    `- Top retained object: ${summary.topRetainedObject ?? 'n/a'}`,
  ].join('\n')

  store.add({
    type: BASELINE_TYPE,
    title: `${TITLE_PREFIX}: ${label}`,
    content,
    source: 'generated',
    status: 'active',
    meta: {
      label,
      kind: 'hermes-runtime',
      totalBlockingMs: String(summary.totalBlockingMs),
      totalRetainedBytes: summary.totalRetainedBytes !== null ? String(summary.totalRetainedBytes) : '',
      totalHeapBytes: summary.totalHeapBytes !== null ? String(summary.totalHeapBytes) : '',
      hotFunction: summary.hotFunction ?? '',
      topRetainedObject: summary.topRetainedObject ?? '',
    },
  })
  trimBaselines(store, label)
  return previous
}

/** The most recent baseline artifact's summary (parsed from its meta), or null. */
export function getLatestPerfBaseline(store: ArtifactStore, label = 'default'): PerfBaselineSummary | null {
  const candidates = store
    .list()
    .filter(a => a.type === BASELINE_TYPE && a.meta?.label === label && a.title.startsWith(TITLE_PREFIX))
  const latest = candidates[candidates.length - 1]
  if (!latest) return null
  const blocking = Number(latest.meta?.totalBlockingMs)
  const retained = latest.meta?.totalRetainedBytes ? Number(latest.meta.totalRetainedBytes) : null
  const heap = latest.meta?.totalHeapBytes ? Number(latest.meta.totalHeapBytes) : null
  return {
    capturedAt: latest.createdAt,
    label,
    totalBlockingMs: Number.isFinite(blocking) ? blocking : 0,
    totalRetainedBytes: retained !== null && Number.isFinite(retained) ? retained : null,
    totalHeapBytes: heap !== null && Number.isFinite(heap) ? heap : null,
    hotFunction: latest.meta?.hotFunction || null,
    topRetainedObject: latest.meta?.topRetainedObject || null,
  }
}

/** Trim baselines beyond the cap for a label (insertion order). */
function trimBaselines(store: ArtifactStore, label: string): void {
  const baselines = store
    .list()
    .filter(a => a.type === BASELINE_TYPE && a.meta?.label === label && a.title.startsWith(TITLE_PREFIX))
  const excess = baselines.length - MAX_BASELINES
  if (excess <= 0) return
  for (const artifact of baselines.slice(0, excess)) {
    store.remove(artifact.id)
  }
}

/** Percentage growth; null when the baseline is missing or zero. */
export function pctGrowth(baseline: number, current: number): number | null {
  if (baseline <= 0) return null
  return ((current - baseline) / baseline) * 100
}

/**
 * Compare a current analysis against a stored baseline and return regression
 * findings. Thresholds come from PerfAnalyzeOptions (blocking 25%, retained 30%).
 */
export function compareToBaseline(
  analysis: PerfAnalysis,
  baseline: PerfBaselineSummary | null,
  options: PerfAnalyzeOptions = {}
): PerfCompareResult {
  const current = summarizeAnalysis(analysis, baseline?.label ?? 'default')
  const regressions: PerfFinding[] = []
  const blockingPct = baseline ? pctGrowth(baseline.totalBlockingMs, current.totalBlockingMs) : null
  const retainedPct =
    baseline && baseline.totalRetainedBytes !== null && current.totalRetainedBytes !== null
      ? pctGrowth(baseline.totalRetainedBytes, current.totalRetainedBytes)
      : null
  const blockingThreshold = options.blockingRegressionPct ?? 25
  const retainedThreshold = options.retainedRegressionPct ?? 30

  if (blockingPct !== null && blockingPct >= blockingThreshold) {
    regressions.push({
      category: 'regression',
      severity: blockingPct >= blockingThreshold * 2 ? 'error' : 'warning',
      target: current.hotFunction ?? 'JS thread',
      file: null,
      metric: `+${blockingPct.toFixed(0)}% JS-thread blocking`,
      message: `JS-thread blocking time grew ${blockingPct.toFixed(0)}% vs the baseline (${baseline?.totalBlockingMs ?? 0}ms → ${current.totalBlockingMs}ms).`,
      suggestion: 'Review the hot function diff for new synchronous work, loops, or re-render storms since the baseline.',
    })
  }
  if (retainedPct !== null && retainedPct >= retainedThreshold) {
    regressions.push({
      category: 'regression',
      severity: retainedPct >= retainedThreshold * 2 ? 'error' : 'warning',
      target: current.topRetainedObject ?? 'heap',
      file: null,
      metric: `+${retainedPct.toFixed(0)}% retained memory`,
      message: `Retained heap grew ${retainedPct.toFixed(0)}% vs the baseline (${formatBytes(baseline?.totalRetainedBytes ?? 0)} → ${formatBytes(current.totalRetainedBytes ?? 0)}).`,
      suggestion: 'Check for added subscriptions, caches, or screens that no longer release on unmount.',
    })
  }

  return {
    regressions,
    deltas: {
      blockingMs: current.totalBlockingMs - (baseline?.totalBlockingMs ?? 0),
      blockingPct,
      retainedBytes: (current.totalRetainedBytes ?? 0) - (baseline?.totalRetainedBytes ?? 0),
      retainedPct,
    },
  }
}

/** Render a baseline comparison block for the CLI report. */
export function renderBaselineComparison(result: PerfCompareResult, label: string): string {
  const lines: string[] = []
  if (result.regressions.length === 0) {
    lines.push(`🟢 No regressions vs baseline "${label}".`)
    return lines.join('\n')
  }
  lines.push(`🔴 ${result.regressions.length} regression(s) vs baseline "${label}":`)
  for (const r of result.regressions) {
    lines.push(`- ${r.message}`)
  }
  return lines.join('\n')
}
