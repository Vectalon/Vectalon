/**
 * Phase V-5 benchmark — leaderboard merge + renderer (M5).
 *
 * The nightly GitHub Actions workflow runs `vectalon bench --live --model <m>`
 * once per provider, writing one `BenchSummary` JSON per model (named after the
 * model, e.g. `openai.json`). This module loads those per-model results from a
 * results directory and renders a timestamped `BENCHMARK_RESULTS.md`
 * leaderboard — scenario × model × axis — that the workflow commits back to the
 * repo, giving a public, time-sliced model comparison for RN code generation.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename, resolve } from 'path'
import { collectJsonFiles } from './fs'
import type { BenchScenarioRun, BenchSummary } from './types'
import { reportError } from '../utils/safe'

/** One model pass: the provider id (from the filename) + its scored summary. */
export interface LeaderboardRun {
  model: string
  summary: BenchSummary
}

/**
 * Default results directory: <projectRoot>/bench/results, resolved against
 * the current working directory — the same place `vectalon bench --json -o
 * bench/results/<model>.json` writes per-model results. Never resolved
 * against the module location: when installed, that would point into
 * node_modules/@vectalon-dev/rn-vectalon and find nothing.
 */
export function defaultLeaderboardResultsDir(): string {
  return resolve(process.cwd(), 'bench', 'results')
}

/**
 * Load every result JSON under `dir` (recursively). Each file must be a
 * `BenchSummary` written by `vectalon bench --json -o <model>.json`; the model
 * id is the file basename minus `.json`. Unparseable or malformed files are
 * skipped (a corrupt result for one model must not break the leaderboard).
 */
export function loadLeaderboardRuns(dir: string): LeaderboardRun[] {
  if (!existsSync(dir)) return []

  const runs: LeaderboardRun[] = []
  for (const file of collectJsonFiles(dir)) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<BenchSummary>
      if (!raw || !Array.isArray(raw.runs)) continue
      runs.push({ model: basename(file, '.json'), summary: raw as BenchSummary })
    } catch (err) {
      reportError(err, `leaderboard: skipping unparseable result file ${file}`)
    }
  }
  return runs.sort((a, b) => a.model.localeCompare(b.model))
}

function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/a' : `${(value * 100).toFixed(0)}%`
}

/**
 * Marker that identifies this comment for upserting — the PR workflow finds an
 * existing comment containing it and updates it instead of spamming new ones on
 * every push.
 */
export const LEADERBOARD_PR_COMMENT_MARKER = '<!-- vectalon-leaderboard -->'

/**
 * Render a compact, PR-friendly leaderboard comment: the overall composite +
 * guardrail pass rates per model (plus relative-to-human when references are
 * present) and a link to the full `BENCHMARK_RESULTS.md`. This is what the PR
 * workflow posts/updates on pull requests.
 */
export function renderLeaderboardPrComment(runs: LeaderboardRun[], timestamp: string): string {
  if (runs.length === 0) {
    return `${LEADERBOARD_PR_COMMENT_MARKER}\n` +
      'No leaderboard results available yet — the nightly benchmark has not produced results for this branch.'
  }

  const models = runs.map(r => r.model)
  const scenarioCount = new Set(runs.flatMap(r => (r.summary.runs || []).map(x => x.id))).size
  const hasReferences = runs.some(r => r.summary.overallReferenceComposite !== null)

  const lines: string[] = []
  lines.push(LEADERBOARD_PR_COMMENT_MARKER)
  lines.push('## 📊 RN coding tests — model leaderboard')
  lines.push('')
  lines.push(
    `_Generated: ${timestamp} · spec v${runs[0]?.summary.specVersion ?? 0} · ` +
      `${models.length} model(s) · ${scenarioCount} scenario(s) · ` +
      `[full results](BENCHMARK_RESULTS.md)_`
  )
  lines.push('')
  if (hasReferences) {
    lines.push('| Model | Overall | Guardrails | vs Human |')
    lines.push('| --- | --- | --- | --- |')
    for (const run of runs) {
      lines.push(
        `| ${run.model} | ${pct(run.summary.overallComposite)} | ${pct(run.summary.overallGuardrails)} | ` +
          `${pct(run.summary.overallRelativeComposite)} |`
      )
    }
  } else {
    lines.push('| Model | Overall | Guardrails |')
    lines.push('| --- | --- | --- |')
    for (const run of runs) {
      lines.push(`| ${run.model} | ${pct(run.summary.overallComposite)} | ${pct(run.summary.overallGuardrails)} |`)
    }
  }
  lines.push('')
  lines.push(
    'The nightly workflow benchmarks each provider on the RN coding-test suite; higher is better. ' +
      '“vs Human” is the generated composite relative to the human reference solutions (M6).'
  )
  return lines.join('\n')
}

type LeaderboardAxis = 'composite' | 'correctness' | 'adherence' | 'guardrails'

function scenarioValue(run: BenchScenarioRun, axis: LeaderboardAxis): number | null {
  if (axis === 'composite') return run.composite
  return run.axes[axis]
}

function modelSummary(runs: LeaderboardRun[], model: string): BenchSummary | undefined {
  return runs.find(r => r.model === model)?.summary
}

function scenarioRun(summary: BenchSummary | undefined, id: string): BenchScenarioRun | undefined {
  return summary?.runs.find(r => r.id === id)
}

/**
 * Render the leaderboard markdown: a header with the run timestamp and a
 * scenario × model table per axis (composite, correctness, adherence,
 * guardrails), an overall row, and a relative-to-human summary (M6).
 */
export function renderLeaderboard(runs: LeaderboardRun[], timestamp: string): string {
  const models = runs.map(r => r.model)

  // Stable scenario ordering: first-seen order across runs, then alphabetical
  // for ids not present in the first run.
  const scenarioIds: string[] = []
  for (const { summary } of runs) {
    for (const run of summary.runs || []) {
      if (!scenarioIds.includes(run.id)) scenarioIds.push(run.id)
    }
  }
  scenarioIds.sort()

  const lines: string[] = []
  lines.push('# RN Coding Tests — Model Leaderboard')
  lines.push('')
  lines.push(
    `_Generated: ${timestamp} · spec v${runs[0]?.summary.specVersion ?? 0} · ` +
      `${models.length} model(s) · ${scenarioIds.length} scenario(s)_`
  )
  lines.push('')

  const sections: Array<{ title: string; axis: LeaderboardAxis; overall: boolean }> = [
    { title: 'Composite', axis: 'composite', overall: true },
    { title: 'Correctness', axis: 'correctness', overall: false },
    { title: 'Adherence', axis: 'adherence', overall: false },
    { title: 'Guardrails', axis: 'guardrails', overall: true },
  ]

  for (const section of sections) {
    lines.push(`## ${section.title}`)
    lines.push('')
    lines.push(`| Scenario | ${models.join(' | ')} |`)
    lines.push(`| --- | ${models.map(() => '---').join(' | ')} |`)
    for (const id of scenarioIds) {
      const cells = models.map(model => {
        const run = scenarioRun(modelSummary(runs, model), id)
        return run ? pct(scenarioValue(run, section.axis)) : '—'
      })
      lines.push(`| ${id} | ${cells.join(' | ')} |`)
    }
    if (section.overall) {
      const cells = models.map(model => {
        const summary = modelSummary(runs, model)
        const value =
          section.axis === 'composite'
            ? summary?.overallComposite ?? null
            : summary?.overallGuardrails ?? null
        return summary ? pct(value) : '—'
      })
      lines.push(`| **Overall** | ${cells.join(' | ')} |`)
    }
    lines.push('')
  }

  const hasReferences = runs.some(r => (r.summary.runs || []).length > 0 && r.summary.overallReferenceComposite !== null)
  if (hasReferences) {
    lines.push('## Relative to human (overall)')
    lines.push('')
    lines.push('| Model | Relative composite | Reference composite |')
    lines.push('| --- | --- | --- |')
    for (const model of models) {
      const summary = modelSummary(runs, model)
      lines.push(
        `| ${model} | ${pct(summary?.overallRelativeComposite ?? null)} | ` +
          `${pct(summary?.overallReferenceComposite ?? null)} |`
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}

/** Render and write the leaderboard to `file` (e.g. BENCHMARK_RESULTS.md). */
export function writeLeaderboard(file: string, runs: LeaderboardRun[], timestamp: string): void {
  writeFileSync(file, renderLeaderboard(runs, timestamp) + '\n')
}
