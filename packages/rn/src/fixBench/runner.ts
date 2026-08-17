/**
 * vc fix-bench — the runner. For each scenario: materialize the healthy base,
 * overlay the broken files (and the failing log when given), run the REAL
 * `runFix` pipeline (diagnose → plan → sandbox-apply → verify) with a stubbed
 * command runner so nothing builds, then score six axes:
 *
 *   1. diagnosis        — the root finding matches the expected diagnosis id/keywords
 *   2. fix              — applying the planned edits reaches the expected file state
 *   3. build-success    — after the fix, the expected root cause no longer fires
 *   4. false-positive   — diagnosing the healthy control stays quiet
 *   5. time             — wall-clock per scenario (vs a 30-min human baseline)
 *   6. human-intervention — scenarios the pipeline could NOT auto-fix
 *
 * Business Source License 1.1 (BSL-1.1)
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { FIX_BENCH_BASE } from './base'
import { runFix } from '../fix'
import { diagnose } from '../fix/diagnose'
import { applyEdits } from '../fix/apply'
import type { FixBenchOptions, FixBenchScenario, FixBenchScenarioRun, FixBenchSummary } from './types'

/** The stubbed runner: verification "passes" instantly — no real tsc/jest/gradle. */
function stubRun(): FixBenchOptions['run'] {
  return async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })
}

interface Materialized {
  dir: string
  cleanup: () => void
}

function materialize(base: Record<string, string>, overrides: Record<string, string>, logText?: string): Materialized {
  const dir = mkdtempSync(join(tmpdir(), 'vectalon-fixbench-'))
  const files: Record<string, string> = { ...base }
  for (const [path, content] of Object.entries(overrides)) files[path] = content
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(dir, relPath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content)
  }
  let logPath: string | null = null
  if (logText) {
    logPath = join(dir, 'build.log')
    writeFileSync(logPath, logText)
  }
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
    ...(logPath ? { logPath } : {}),
  }
}

/** The root finding id the pipeline produced for a project, if any. */
function rootFindingId(projectRoot: string, issue: string, logPath?: string): { id: string | null; message: string; title: string; errorCount: number } {
  const { findings } = diagnose(projectRoot, { issue, log: logPath })
  const root =
    findings.find(f => f.rootCause) ??
    findings.find(f => f.severity === 'error') ??
    findings.find(f => f.severity === 'warning') ??
    findings[0] ??
    null
  return {
    id: root?.id ?? null,
    message: root?.message ?? '',
    title: root?.title ?? '',
    errorCount: findings.filter(f => f.severity === 'error').length,
  }
}

function diagnosisMatches(scenario: FixBenchScenario, id: string | null, message: string, title: string): boolean {
  if (!id) return false
  if (id === scenario.expect.diagnosisId) return true
  const haystack = `${message} ${title}`.toLowerCase()
  return scenario.expect.diagnosisKeywords.every(k => haystack.includes(k.toLowerCase()))
}

/** Does the broken file set actually trigger the expected diagnosis at all? */
function smokeCheck(scenario: FixBenchScenario, root: string, logPath?: string): string | null {
  const { id, message, title } = rootFindingId(root, scenario.issue, logPath)
  if (!diagnosisMatches(scenario, id, message, title)) {
    return `scenario does not reproduce: expected diagnosis '${scenario.expect.diagnosisId}' (${scenario.expect.diagnosisKeywords.join(' | ')}) but pipeline reported '${id ?? 'nothing'}'`
  }
  return null
}

export async function runFixScenario(scenario: FixBenchScenario, options: FixBenchOptions = {}): Promise<FixBenchScenarioRun> {
  const run = options.run ?? stubRun()
  const started = Date.now()

  // 1 — Materialize the broken project and run the real pipeline.
  const broken = materialize(FIX_BENCH_BASE, scenario.broken, scenario.log)
  let report
  try {
    report = await runFix(broken.dir, {
      issue: scenario.issue,
      log: (broken as Materialized & { logPath?: string }).logPath,
      run,
    })
  } finally {
    broken.cleanup()
  }
  const ms = Date.now() - started

  const rootFinding = report.findings.find(f => f.rootCause) ?? report.findings.find(f => f.severity === 'error') ?? report.findings.find(f => f.severity === 'warning') ?? report.findings[0] ?? null
  const diagnosisId = rootFinding?.id ?? null
  const diagnosis = diagnosisMatches(scenario, diagnosisId, rootFinding?.message ?? '', rootFinding?.title ?? '')

  // 2 — Fix accuracy: apply the planned edits to a fresh copy of the broken
  // tree and check the expected file reaches the required state. Only counts
  // when the diagnosis was correct — a wrong diagnosis is never a fix.
  const fixProbe = materialize(FIX_BENCH_BASE, scenario.broken, scenario.log)
  let fix = false
  let buildSuccess = false
  try {
    const applied = applyEdits(fixProbe.dir, report.edits)
    const fixedPath = join(fixProbe.dir, scenario.expect.fixFile)
    let contentOk = false
    if (existsSync(fixedPath)) {
      const content = readFileSync(fixedPath, 'utf-8')
      const hasAll = scenario.expect.mustContain.every(s => content.includes(s))
      const hasNone = scenario.expect.mustNotContain.every(s => !content.includes(s))
      contentOk = hasAll && hasNone
    }
    const editedFixFile = applied.applied.some(e => e.file === scenario.expect.fixFile)
    // A scenario that declares no fixed-file expectation (empty mustContain /
    // empty healthy) is diagnosis-only by definition — a stray edit must never
    // score as a fix.
    fix = diagnosis && editedFixFile && contentOk && scenario.expect.mustContain.length > 0
    // 3 — Build-success proxy: after the fix, the expected root cause must no
    // longer fire against the same issue/log.
    const probeLog = (fixProbe as Materialized & { logPath?: string }).logPath
    const after = rootFindingId(fixProbe.dir, scenario.issue, probeLog)
    const cleared = after.id !== scenario.expect.diagnosisId && !scenario.expect.diagnosisKeywords.some(k => `${after.message} ${after.title}`.toLowerCase().includes(k.toLowerCase()))
    buildSuccess = diagnosis && cleared
  } finally {
    fixProbe.cleanup()
  }

  // 4 — False-positive control: the healthy project must produce no errors.
  const healthy = materialize(FIX_BENCH_BASE, scenario.healthy)
  let noFalsePositive = true
  try {
    const healthyLog = (healthy as Materialized & { logPath?: string }).logPath
    const { errorCount } = rootFindingId(healthy.dir, scenario.issue, healthyLog)
    noFalsePositive = errorCount === 0
  } finally {
    healthy.cleanup()
  }

  const autoFixed = report.edits.length > 0 && diagnosis

  const verdict = diagnosis ? (fix ? 'fixed' : 'diagnosed') : 'missed'
  const note: string[] = []
  if (!diagnosis) note.push(`diagnosis ${diagnosisId ?? 'none'} ≠ expected ${scenario.expect.diagnosisId}`)
  else if (!fix) note.push('diagnosed but edit did not reach the expected file state')
  if (report.edits.length === 0) note.push('no deterministic edit planned (manual fix)')

  return {
    id: scenario.id,
    suite: scenario.suite,
    title: scenario.title,
    diagnosis,
    diagnosisId,
    fix,
    autoFixed,
    buildSuccess,
    noFalsePositive,
    ms,
    verdict,
    ...(note.length > 0 ? { note: note.join('; ') } : {}),
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

/** Human baseline: 30 minutes per real RN failure (a conservative floor). */
const HUMAN_MINUTES_PER_FAILURE = 30

export async function runFixBenchmark(scenarios: FixBenchScenario[], options: FixBenchOptions = {}): Promise<FixBenchSummary> {
  const total = scenarios.length
  const runs: FixBenchScenarioRun[] = []
  for (let i = 0; i < total; i++) {
    const scenario = scenarios[i]
    options.onScenarioStart?.({ index: i + 1, total, scenario })
    const run = await runFixScenario(scenario, options)
    options.onScenarioComplete?.({ index: i + 1, total, scenario, run })
    runs.push(run)
  }

  const bySuite = new Map<string, FixBenchScenarioRun[]>()
  for (const run of runs) {
    const list = bySuite.get(run.suite) || []
    list.push(run)
    bySuite.set(run.suite, list)
  }

  const suites: FixBenchSummary['suites'] = []
  for (const [suite, suiteRuns] of bySuite.entries()) {
    suites.push({
      suite: suite as FixBenchSummary['suites'][number]['suite'],
      total: suiteRuns.length,
      diagnosis: suiteRuns.filter(r => r.diagnosis).length,
      fix: suiteRuns.filter(r => r.fix).length,
      buildSuccess: suiteRuns.filter(r => r.buildSuccess).length,
    })
  }

  const msValues = runs.map(r => r.ms)
  const totalMs = msValues.reduce((a, b) => a + b, 0)
  const timeSavedHours = (runs.length * HUMAN_MINUTES_PER_FAILURE) / 60 - totalMs / 3_600_000

  return {
    specVersion: scenarios[0]?.specVersion ?? 0,
    total,
    runs,
    suites,
    diagnosisAccuracy: total > 0 ? runs.filter(r => r.diagnosis).length / total : 0,
    fixAccuracy: total > 0 ? runs.filter(r => r.fix).length / total : 0,
    buildSuccessRate: total > 0 ? runs.filter(r => r.buildSuccess).length / total : 0,
    falsePositiveRate: total > 0 ? runs.filter(r => !r.noFalsePositive).length / total : 0,
    timeMs: { median: median(msValues), p90: percentile(msValues, 90), total: totalMs },
    timeSavedHours,
    humanInterventionRate: total > 0 ? runs.filter(r => !r.autoFixed).length / total : 0,
  }
}

export async function runFixBenchmarkFromDir(
  options: FixBenchOptions = {}
): Promise<{ summary: FixBenchSummary; problems: Array<{ file: string; problems: string[] }> }> {
  const { loadFixBenchScenarios, defaultFixScenariosDir } = await import('./loader')
  const loaded = loadFixBenchScenarios(options.scenariosDir || defaultFixScenariosDir())
  let scenarios = loaded.scenarios
  if (options.suite) scenarios = scenarios.filter(s => s.suite === options.suite)
  if (options.ids) scenarios = scenarios.filter(s => options.ids!.includes(s.id))
  if (scenarios.length === 0) {
    return {
      summary: {
        specVersion: 0,
        total: 0,
        runs: [],
        suites: [],
        diagnosisAccuracy: 0,
        fixAccuracy: 0,
        buildSuccessRate: 0,
        falsePositiveRate: 0,
        timeMs: { median: 0, p90: 0, total: 0 },
        timeSavedHours: 0,
        humanInterventionRate: 0,
      },
      problems: loaded.problems,
    }
  }
  const summary = await runFixBenchmark(scenarios, options)
  return { summary, problems: loaded.problems }
}
