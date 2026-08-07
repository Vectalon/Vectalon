/**
 * Vectalon RN — Self-test runner
 * Business Source License 1.1 (BSL-1.1)
 *
 * Runs the feature catalog in isolated temp sandboxes, capturing per-check
 * activity traces (steps, commands, file writes), durations, and failures,
 * then aggregates everything into a SelfTestReport. The runner is pure — it
 * never writes to the user's project; the CLI command persists the report.
 */

import { runCommand as realRunCommand } from '../adapters/runCommand'
import { FEATURE_CATALOG, listFeatureChecks, categorizeChecks } from './catalog'
import { ActivityTracer, Sandbox, createTracedRunner } from './trace'
import type { CheckRun, CheckResult, FeatureCheck, SelfTestOptions, SelfTestReport, SelfTestTotals } from './types'
import pkg from '../../package.json'

/**
 * Live progress hooks. `onStart` fires just before a check begins (for the
 * spinner / "running" line); `onDone` fires as soon as the check finishes, so
 * clients see pass/fail results stream in while the rest of the suite runs.
 */
export interface SelfTestProgressHooks {
  onStart?(check: FeatureCheck, index: number, total: number): void
  onDone?(run: CheckRun, index: number, total: number): void
}

const EMPTY_TOTALS: SelfTestTotals = { pass: 0, fail: 0, warn: 0, total: 0 }

/**
 * Run a single check in its own sandbox — exported for tests and custom suites.
 * `projectRoot` (default cwd) is the real project dir used to resolve model
 * config etc.; the sandbox is only for isolated check fixtures.
 */
export async function runOneCheck(
  check: FeatureCheck,
  options: SelfTestOptions = {},
  projectRoot = process.cwd()
): Promise<CheckRun> {
  const started = Date.now()
  const trace = new ActivityTracer()
  const sandbox = new Sandbox(trace)
  const runCommand = createTracedRunner(trace, sandbox.root, realRunCommand)

  let result: CheckResult = { status: 'fail', detail: 'check did not return a result' }
  let error: string | undefined
  try {
    result = await check.run({ sandbox, trace, runCommand, projectRoot, options })
  } catch (err) {
    error = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err)
    result = { status: 'fail', detail: err instanceof Error ? err.message : String(err) }
  } finally {
    sandbox.cleanup()
  }

  return {
    check,
    status: result.status,
    durationMs: Date.now() - started,
    detail: result.detail,
    error,
    steps: trace.steps,
  }
}

export async function runSelfTest(options: SelfTestOptions = {}, hooks: SelfTestProgressHooks = {}): Promise<SelfTestReport> {
  const started = Date.now()
  const checks = listFeatureChecks({ category: options.category, only: options.only })
  const total = checks.length
  const projectRoot = options.projectRoot || process.cwd()

  const runs: CheckRun[] = []
  for (let i = 0; i < checks.length; i++) {
    hooks.onStart?.(checks[i], i + 1, total)
    const run = await runOneCheck(checks[i], options, projectRoot)
    runs.push(run)
    hooks.onDone?.(run, i + 1, total)
  }

  const totals: SelfTestTotals = { ...EMPTY_TOTALS }
  const byCategory: SelfTestReport['byCategory'] = {}
  const activity = { commands: 0, writes: 0, artifacts: 0, steps: 0 }

  for (const run of runs) {
    totals.total += 1
    if (run.status === 'pass') totals.pass += 1
    else if (run.status === 'fail') totals.fail += 1
    else totals.warn += 1

    const category = run.check.category
    byCategory[category] = byCategory[category] || { ...EMPTY_TOTALS }
    const cat = byCategory[category]!
    cat.total += 1
    if (run.status === 'pass') cat.pass += 1
    else if (run.status === 'fail') cat.fail += 1
    else cat.warn += 1

    const counts = run.steps.reduce(
      (acc, s) => {
        acc.steps += 1
        if (s.kind === 'command') acc.commands += 1
        else if (s.kind === 'write') acc.writes += 1
        else if (s.kind === 'artifact') acc.artifacts += 1
        return acc
      },
      { commands: 0, writes: 0, artifacts: 0, steps: 0 }
    )
    activity.commands += counts.commands
    activity.writes += counts.writes
    activity.artifacts += counts.artifacts
    activity.steps += counts.steps
  }

  return {
    version: pkg.version,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    totals,
    byCategory,
    runs,
    activity,
  }
}

/** Totals for a subset of runs (used by the terminal reporter per category). */
export function totalsForRuns(runs: CheckRun[]): SelfTestTotals {
  const totals: SelfTestTotals = { ...EMPTY_TOTALS }
  for (const run of runs) {
    totals.total += 1
    if (run.status === 'pass') totals.pass += 1
    else if (run.status === 'fail') totals.fail += 1
    else totals.warn += 1
  }
  return totals
}

export { FEATURE_CATALOG, listFeatureChecks, categorizeChecks }
