import { writeFileSync } from 'fs'
import { logger } from '../logger'
import { ModelRouter } from '../../model/ModelRouter'
import type { ModelProviderType } from '../../model/types'
import { runBenchmarkFromDir } from '../../bench/runner'
import { formatBenchmarkReport } from '../../bench/report'
import { defaultScenariosDir } from '../../bench/loader'
import type { BenchSummary } from '../../bench/types'

export interface BenchCommandOptions {
  /** Model provider (local/openai/anthropic); runs the real-model leaderboard pass. */
  model?: string
  /** Only run scenarios in this suite. */
  suite?: string
  /** Run real tests/typecheck/lint for correctness scoring (slow). */
  live?: boolean
  /** Print the summary as JSON instead of markdown. */
  json?: boolean
  /** Write the report to a file instead of stdout. */
  output?: string
  /** Override the scenarios directory (default: bench/scenarios). */
  scenarios?: string
}

const VALID_PROVIDERS = ['local', 'openai', 'anthropic']

export async function benchCommand(options: BenchCommandOptions): Promise<void> {
  if (options.model && !VALID_PROVIDERS.includes(options.model)) {
    logger.error(`Unknown model provider: ${options.model}`)
    logger.info(`Available providers: ${VALID_PROVIDERS.join(', ')}`)
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
    filter: options.suite ? { suite: options.suite } : undefined,
    scenariosDir: options.scenarios,
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
    logger.error(`No scenarios ran from ${scenariosDir}${suiteHint}`)
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
    renderCompletionLine(summary)
    return
  }

  const report = formatBenchmarkReport(summary)
  if (options.output) {
    writeFileSync(options.output, report)
    logger.info(`Report written to ${options.output}`)
  } else {
    logger.out(report + '\n')
  }
  renderCompletionLine(summary)
}

function renderCompletionLine(summary: BenchSummary): void {
  const composite = summary.overallComposite !== null
    ? `${(summary.overallComposite * 100).toFixed(0)}%`
    : 'n/a'
  logger.success(`Benchmark complete: ${summary.runs.length} scenario(s) run, overall composite ${composite}`)
}
