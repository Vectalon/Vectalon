/**
 * Phase V-5 benchmark — deterministic baseline comparison (M4).
 *
 * The CI gate runs the deterministic baseline (`vectalon bench --baseline
 * <file>`) and fails the build when any scored axis regresses beyond a
 * tolerance. The baseline file is a committed `BenchSummary` JSON (the same
 * shape `--json -o` writes), so teams regenerate it with:
 *
 *   npx vectalon bench --json -o bench/baseline.json
 */

import { existsSync, readFileSync } from 'fs'
import type { BenchAxisScores, BenchSummary } from './types'
import { reportError } from '../utils/safe'

/** Default allowed axis drop before a regression is flagged (1 percentage point). */
export const DEFAULT_BASELINE_TOLERANCE = 0.01

export interface BaselineAxisDelta {
  /** Scenario id, suite id, or `overall`. */
  scope: string
  /** Axis label: correctness / adherence / guardrails / composite. */
  axis: string
  baseline: number
  current: number
  delta: number
}

export interface BaselineComparison {
  ok: boolean
  /** Axes that dropped more than the tolerance. */
  regressions: BaselineAxisDelta[]
  /** Axes that improved more than the tolerance (informational). */
  improvements: BaselineAxisDelta[]
  /** Scenario ids in the baseline that did not run this time. */
  missing: string[]
  /** Scenario ids that ran this time but are not in the baseline. */
  added: string[]
}

function isNullableNumber(v: unknown): boolean {
  return v === null || typeof v === 'number'
}

/** Parse and validate a baseline file; returns null on any problem. */
export function loadBaselineFile(file: string): BenchSummary | null {
  if (!existsSync(file)) return null
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf-8'))
  } catch (err) {
    reportError(err, `baseline: reading baseline file ${file}`)
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (!Array.isArray(b.runs) || !Array.isArray(b.suites)) return null

  // Validate run entries so a truncated/hand-edited baseline fails cleanly
  // (the CLI reuses the "could not load baseline" path) instead of crashing
  // compareToBaseline with a TypeError on a missing `axes` field.
  for (const run of b.runs as unknown[]) {
    if (!run || typeof run !== 'object') return null
    const r = run as Record<string, unknown>
    const axes = r.axes as Record<string, unknown> | undefined
    if (!axes || typeof axes !== 'object') return null
    for (const axis of ['correctness', 'adherence', 'guardrails'] as const) {
      if (!isNullableNumber(axes[axis])) return null
    }
    if (!isNullableNumber(r.composite)) return null
  }

  return b as unknown as BenchSummary
}

function compareAxes(
  regressions: BaselineAxisDelta[],
  improvements: BaselineAxisDelta[],
  scope: string,
  baselineAxes: BenchAxisScores,
  currentAxes: BenchAxisScores,
  tolerance: number
): void {
  const axes: Array<[string, number | null, number | null]> = [
    ['correctness', baselineAxes.correctness, currentAxes.correctness],
    ['adherence', baselineAxes.adherence, currentAxes.adherence],
    ['guardrails', baselineAxes.guardrails, currentAxes.guardrails],
  ]
  for (const [axis, b, c] of axes) {
    if (b === null || c === null) continue
    const delta = c - b
    if (delta <= -tolerance) regressions.push({ scope, axis, baseline: b, current: c, delta })
    else if (delta >= tolerance) improvements.push({ scope, axis, baseline: b, current: c, delta })
  }
}

/**
 * Compare a fresh deterministic run against a stored baseline. `ok` is false
 * when any scored axis dropped more than `tolerance`, or a baseline scenario
 * no longer ran. Scenarios present in the new run but absent from the baseline
 * are reported as `added` (informational, not a regression).
 */
export function compareToBaseline(
  current: BenchSummary,
  baseline: BenchSummary,
  tolerance = DEFAULT_BASELINE_TOLERANCE
): BaselineComparison {
  const regressions: BaselineAxisDelta[] = []
  const improvements: BaselineAxisDelta[] = []

  const baselineById = new Map(baseline.runs.map(r => [r.id, r]))
  const currentById = new Map(current.runs.map(r => [r.id, r]))

  const missing: string[] = []
  const added: string[] = []

  for (const id of baselineById.keys()) {
    const baseRun = baselineById.get(id)
    const curRun = currentById.get(id)
    if (!baseRun || !curRun) {
      missing.push(id)
      continue
    }
    compareAxes(regressions, improvements, id, baseRun.axes, curRun.axes, tolerance)
    if (baseRun.composite !== null && curRun.composite !== null) {
      const delta = curRun.composite - baseRun.composite
      if (delta <= -tolerance) {
        regressions.push({ scope: id, axis: 'composite', baseline: baseRun.composite, current: curRun.composite, delta })
      } else if (delta >= tolerance) {
        improvements.push({ scope: id, axis: 'composite', baseline: baseRun.composite, current: curRun.composite, delta })
      }
    }
  }

  for (const id of currentById.keys()) {
    if (!baselineById.has(id)) added.push(id)
  }

  for (const baseSuite of baseline.suites) {
    const curSuite = current.suites.find(s => s.suite === baseSuite.suite)
    if (!curSuite) {
      missing.push(`suite:${baseSuite.suite}`)
      continue
    }
    for (const axis of ['composite', 'guardrails'] as const) {
      const base = baseSuite[axis]
      const cur = curSuite[axis]
      if (base === null || cur === null) continue
      const delta = cur - base
      if (delta <= -tolerance) {
        regressions.push({ scope: `suite:${baseSuite.suite}`, axis, baseline: base, current: cur, delta })
      } else if (delta >= tolerance) {
        improvements.push({ scope: `suite:${baseSuite.suite}`, axis, baseline: base, current: cur, delta })
      }
    }
  }

  // Note: overallReferenceComposite / overallRelativeComposite (M6) are
  // deliberately NOT compared — they are derived reporting values that shift
  // with the rubric/references, not independent scored axes.

  if (baseline.overallComposite !== null && current.overallComposite !== null) {
    const delta = current.overallComposite - baseline.overallComposite
    if (delta <= -tolerance) {
      regressions.push({ scope: 'overall', axis: 'composite', baseline: baseline.overallComposite, current: current.overallComposite, delta })
    } else if (delta >= tolerance) {
      improvements.push({ scope: 'overall', axis: 'composite', baseline: baseline.overallComposite, current: current.overallComposite, delta })
    }
  }
  if (baseline.overallGuardrails !== null && current.overallGuardrails !== null) {
    const delta = current.overallGuardrails - baseline.overallGuardrails
    if (delta <= -tolerance) {
      regressions.push({ scope: 'overall', axis: 'guardrails', baseline: baseline.overallGuardrails, current: current.overallGuardrails, delta })
    } else if (delta >= tolerance) {
      improvements.push({ scope: 'overall', axis: 'guardrails', baseline: baseline.overallGuardrails, current: current.overallGuardrails, delta })
    }
  }

  const ok = regressions.length === 0 && missing.length === 0
  return { ok, regressions, improvements, missing, added }
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

/** Human-readable comparison summary for the CLI. */
export function formatBaselineComparison(c: BaselineComparison, tolerance: number): string {
  const lines: string[] = []
  lines.push(`Baseline comparison (tolerance ${pct(tolerance)}):`)

  if (c.regressions.length > 0) {
    lines.push('')
    lines.push('REGRESSIONS:')
    for (const r of c.regressions) {
      lines.push(`  - ${r.scope} ${r.axis}: ${pct(r.baseline)} → ${pct(r.current)} (${(r.delta * 100).toFixed(1)} pts)`)
    }
  }
  if (c.missing.length > 0) {
    lines.push('')
    lines.push(`MISSING from run: ${c.missing.join(', ')}`)
  }
  if (c.improvements.length > 0) {
    lines.push('')
    lines.push('Improvements:')
    for (const r of c.improvements) {
      lines.push(`  + ${r.scope} ${r.axis}: ${pct(r.baseline)} → ${pct(r.current)} (+${(r.delta * 100).toFixed(1)} pts)`)
    }
  }
  if (c.added.length > 0) {
    lines.push(`New scenarios not in baseline: ${c.added.join(', ')}`)
  }

  lines.push('')
  if (c.ok) {
    lines.push('Baseline OK — no axis regressed beyond tolerance.')
  } else {
    lines.push(`Baseline FAILED — ${c.regressions.length} regression(s), ${c.missing.length} missing item(s).`)
  }
  return lines.join('\n')
}
