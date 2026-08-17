/**
 * vc fix-bench — "make vc fix unbelievably reliable" (Roadmap directive #2).
 * Business Source License 1.1 (BSL-1.1)
 *
 * Runs the real `runFix` pipeline against a pack of 100 real React Native
 * failure scenarios — Gradle conflicts, Kotlin/AGP mismatches, CocoaPods,
 * Xcode, Metro, Hermes, RN upgrade breakages, native module linking, and
 * TypeScript regressions — and scores the six axes the directive names:
 * diagnosis accuracy (target ≥ 80%), fix accuracy without human modification
 * (target ≥ 50%), build success, false-positive rate, time saved, and human
 * intervention.
 */
import { writeFileSync } from 'fs'
import { resolve, join } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { printCarbonReport, parchment, dim } from '../carbon'
import { runFixBenchmarkFromDir } from '../../fixBench/runner'
import type { FixBenchSummary } from '../../fixBench/types'

export interface FixBenchCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
  /** Write the report to a file instead of stdout. */
  output?: string
  /** Run only scenarios in this suite. */
  suite?: string
  /** Run only scenarios with these comma-separated ids. */
  ids?: string
  /** Override the scenario directory (default: bench/fix). */
  scenarios?: string
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

function renderBody(summary: FixBenchSummary): string[] {
  const lines: string[] = []
  lines.push(`  ${pc.bold(String(summary.total))} real RN failure scenarios · ${summary.suites.length} suites`)
  lines.push('')

  const target = (name: string, value: number, goal: number, unit: string): string => {
    const ok = value >= goal
    const colored = ok ? pc.green(pct(value)) : pc.yellow(pct(value))
    return `  ${pc.bold(name.padEnd(26))} ${colored.padEnd(12)} target ${pct(goal)} ${ok ? pc.green('✓') : dim(`(${unit} below)`)}`
  }

  lines.push(target('Diagnosis accuracy', summary.diagnosisAccuracy, 0.8, 'product milestone'))
  lines.push(target('Fix accuracy (auto, no human)', summary.fixAccuracy, 0.5, 'product milestone'))
  lines.push(`  ${pc.bold('Build success (post-fix)'.padEnd(26))} ${parchment(pct(summary.buildSuccessRate))}`)
  lines.push(`  ${pc.bold('False positive rate'.padEnd(26))} ${parchment(pct(summary.falsePositiveRate))}`)
  lines.push(`  ${pc.bold('Human intervention'.padEnd(26))} ${parchment(pct(summary.humanInterventionRate))}`)
  lines.push('')

  lines.push(`  ${pc.bold('Time:')} median ${summary.timeMs.median.toFixed(0)}ms/scenario · p90 ${summary.timeMs.p90.toFixed(0)}ms · total ${(summary.timeMs.total / 1000).toFixed(1)}s`)
  lines.push(`  ${pc.bold('Estimated time saved:')} ${pc.green(`${summary.timeSavedHours.toFixed(1)} hours`)} vs a 30-min-per-failure human baseline`)
  lines.push('')

  lines.push(`  ${pc.bold('By suite:')}`)
  const header = `    ${'suite'.padEnd(18)} ${'total'.padEnd(6)} ${'diagnosed'.padEnd(10)} ${'fixed'.padEnd(8)} ${'build ok'.padEnd(9)}`
  lines.push(header)
  for (const s of summary.suites) {
    lines.push(
      `    ${s.suite.padEnd(18)} ${String(s.total).padEnd(6)} ${`${s.diagnosis}/${s.total}`.padEnd(10)} ${`${s.fix}/${s.total}`.padEnd(8)} ${`${s.buildSuccess}/${s.total}`.padEnd(9)}`
    )
  }
  lines.push('')

  const missed = summary.runs.filter(r => !r.diagnosis)
  if (missed.length > 0) {
    lines.push(`  ${pc.bold('Missed diagnoses:')}`)
    for (const r of missed) {
      lines.push(`    ${dim(`${r.id} — ${r.note ?? 'no root cause'}`)}`)
    }
    lines.push('')
  }
  lines.push(`  ${dim('Every scenario runs the real vc fix pipeline hermetically (no builds) — deterministic and CI-safe.')}`)
  lines.push(`  ${dim('Scenarios are in bench/fix/ — add a failure, re-run, and the score moves.')}`)
  return lines
}

export async function fixBenchCommand(options: FixBenchCommandOptions): Promise<void> {
  const root = resolve(process.cwd())
  const ids = options.ids ? options.ids.split(',').map(s => s.trim()).filter(Boolean) : undefined

  const { summary, problems } = await runFixBenchmarkFromDir({
    suite: options.suite,
    ids,
    scenariosDir: options.scenarios,
    onScenarioStart: ({ index, total, scenario }) => {
      logger.step(index, `${scenario.title} (${scenario.id}) — fixing… [${index}/${total}]`)
    },
    onScenarioComplete: ({ index, total, scenario, run }) => {
      const mark = run.verdict === 'fixed' ? pc.green('✓ fixed') : run.verdict === 'diagnosed' ? pc.yellow('○ diagnosed') : pc.red('✗ missed')
      logger.dim(`  [${index}/${total}] ${scenario.id} → ${mark} · ${run.ms.toFixed(0)}ms${run.noFalsePositive ? '' : ' · FP!'}`)
    },
  })

  for (const problem of problems) {
    logger.warn(`Scenario problem: ${problem.file} — ${problem.problems.join('; ')}`)
  }

  if (summary.total === 0) {
    logger.error(`No fix-bench scenarios ran from ${options.scenarios ?? 'bench/fix'}${options.suite ? ` (suite: ${options.suite})` : ''}`)
    process.exit(1)
  }

  if (options.json) {
    const json = JSON.stringify(summary, null, 2)
    if (options.output) {
      writeFileSync(options.output, json)
      logger.info(`Report written to ${options.output}`)
    } else {
      logger.out(json + '\n')
    }
    return
  }

  if (options.output) {
    writeFileSync(options.output, renderBody(summary).join('\n') + '\n')
    logger.info(`Report written to ${options.output}`)
    return
  }

  printCarbonReport({
    title: `vc fix-bench — ${summary.total} real RN failures, measured`,
    verdict: summary.diagnosisAccuracy >= 0.8 && summary.fixAccuracy >= 0.5 ? 'approved' : summary.diagnosisAccuracy >= 0.8 ? 'needs-attention' : 'changes-requested',
    lines: renderBody(summary),
    reportPath: join(root, 'docs', 'vectalon', 'fix-bench', 'report.txt'),
    root,
    done:
      summary.diagnosisAccuracy >= 0.8 && summary.fixAccuracy >= 0.5
        ? 'Both product-milestone targets met — 80%+ correct diagnosis and 50%+ fixes applied without human modification.'
        : summary.diagnosisAccuracy >= 0.8
          ? 'Diagnosis target met; the fix-accuracy target (50% auto-fix) needs more deterministic edit seams.'
          : 'Below targets — extend the fix pipeline (new diagnosis patterns + edit seams) and re-run. The score is the roadmap.',
  })
}
