import { writeFileSync } from 'fs'
import { logger } from '../logger'
import { ModelRouter } from '../../model/ModelRouter'
import type { ModelProviderType } from '../../model/types'
import { runBenchmarkFromDir } from '../../bench/runner'
import { formatBenchmarkReport } from '../../bench/report'
import { defaultScenariosDir } from '../../bench/loader'
import { DEFAULT_BASELINE_TOLERANCE, loadBaselineFile, compareToBaseline, formatBaselineComparison } from '../../bench/baseline'
import type { BenchSummary } from '../../bench/types'

export interface BenchCommandOptions {
  /** Model provider (local/openai/anthropic); runs the real-model leaderboard pass. */
  model?: string
  /** Only run scenarios in this suite. */
  suite?: string
  /** Run real tests/typecheck/lint for correctness scoring (slow). */
  live?: boolean
  /** Run `npm install` in each temp project before live correctness checks. */
  install?: boolean
  /** Print the summary as JSON instead of markdown. */
  json?: boolean
  /** Write the report to a file instead of stdout. */
  output?: string
  /** Override the scenarios directory (default: bench/scenarios). */
  scenarios?: string
  /** Override the human reference-solutions directory (default: bench/references). */
  references?: string
  /** Compare the deterministic run against a stored baseline JSON (M4 CI gate). */
  baseline?: string
  /** Max allowed axis drop (fraction) before a regression is flagged (default 0.01). */
  tolerance?: number
}

const VALID_PROVIDERS = ['local', 'openai', 'anthropic']

export async function benchCommand(options: BenchCommandOptions): Promise<void> {
  if (options.model && !VALID_PROVIDERS.includes(options.model)) {
    logger.error(`Unknown model provider: ${options.model}`)
    logger.info(`Available providers: ${VALID_PROVIDERS.join(', ')}`)
    process.exit(1)
  }

  if (options.baseline && options.model) {
    logger.error('--baseline compares the deterministic baseline only; drop --model for a regression gate')
    process.exit(1)
  }

  if (options.install && !options.live) {
    logger.warn('--install has no effect without --live (it installs deps before live correctness checks)')
  }

  const tolerance = options.tolerance ?? DEFAULT_BASELINE_TOLERANCE
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    logger.error(`Invalid tolerance: ${String(options.tolerance)}`)
    process.exit(1)
  }

  const baseline = options.baseline ? loadBaselineFile(options.baseline) : null
  if (options.baseline && !baseline) {
    logger.error(`Could not load baseline file: ${options.baseline}`)
    logger.info('Generate one with: npx vectalon bench --json -o bench/baseline.json')
    process.exit(1)
  }

  let modelRouter: ModelRouter | undefined
  if (options.model) {
    logger.info(`Running leaderboard pass with model provider: ${options.model}`)
    modelRouter = new ModelRouter()
    modelRouter.initialize({ provider: options.model as ModelProviderType })
  }

  const { summary, problems, referenceProblems } = await runBenchmarkFromDir({
    modelRouter,
    live: options.live,
    install: options.install,
    filter: options.suite ? { suite: options.suite } : undefined,
    scenariosDir: options.scenarios,
    referencesDir: options.references,
  })

  for (const problem of problems) {
    logger.warn(`Scenario problem: ${problem.file} — ${problem.problems.join('; ')}`)
  }
  for (const problem of referenceProblems) {
    logger.warn(`Reference problem: ${problem.file} — ${problem.problems.join('; ')}`)
  }

  if (summary.runs.length === 0) {
    const scenariosDir = options.scenarios || defaultScenariosDir()
    const suiteHint = options.suite ? ` (suite: ${options.suite})` : ''
    const problemHint =
      problems.length > 0
        ? ` — ${problems.length} scenario file(s) failed validation (see warnings above)`
        : ''
    logger.error(`No scenarios ran from ${scenariosDir}${suiteHint}${problemHint}`)
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
  } else {
    const report = formatBenchmarkReport(summary)
    if (options.output) {
      writeFileSync(options.output, report)
      logger.info(`Report written to ${options.output}`)
    } else {
      logger.out(report + '\n')
    }
  }

  if (baseline) {
    const comparison = compareToBaseline(summary, baseline, tolerance)
    const text = formatBaselineComparison(comparison, tolerance)
    if (options.json) {
      // Keep stdout a pure JSON document; the gate result goes to stderr.
      if (comparison.ok) {
        logger.success(text)
      } else {
        logger.error(text)
      }
    } else {
      logger.out(text + '\n')
    }
    if (!comparison.ok) {
      logger.error(`Baseline FAILED: ${comparison.regressions.length} regression(s), ${comparison.missing.length} missing`)
      process.exit(1)
    }
    logger.success('Baseline OK — no axis regressed beyond tolerance')
  }

  renderCompletionLine(summary)
}

function renderCompletionLine(summary: BenchSummary): void {
  const composite = summary.overallComposite !== null
    ? `${(summary.overallComposite * 100).toFixed(0)}%`
    : 'n/a'
  logger.success(`Benchmark complete: ${summary.runs.length} scenario(s) run, overall composite ${composite}`)
}
