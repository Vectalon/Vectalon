import { logger } from '../logger'
import {
  defaultLeaderboardResultsDir,
  loadLeaderboardRuns,
  writeLeaderboard,
} from '../../bench/leaderboard'

export interface LeaderboardCommandOptions {
  /** Results directory containing one BenchSummary JSON per model (default bench/results). */
  dir?: string
  /** Output file (default BENCHMARK_RESULTS.md). */
  out?: string
  /** Print the merged runs as JSON instead of writing markdown. */
  json?: boolean
  /** Override the leaderboard timestamp (ISO string; default now). */
  timestamp?: string
}

export function leaderboardCommand(options: LeaderboardCommandOptions): void {
  const dir = options.dir || defaultLeaderboardResultsDir()
  const runs = loadLeaderboardRuns(dir)

  if (runs.length === 0) {
    logger.error(`No benchmark result files found in ${dir}`)
    logger.info('Run per-model passes first, e.g.:')
    logger.dim('  npx vectalon bench --model openai --live --json -o bench/results/openai.json')
    process.exit(1)
  }

  if (options.json) {
    logger.out(JSON.stringify(runs, null, 2) + '\n')
    return
  }

  const timestamp = options.timestamp || new Date().toISOString()
  const out = options.out || 'BENCHMARK_RESULTS.md'
  writeLeaderboard(out, runs, timestamp)
  const scenarioCount = runs.reduce((sum, r) => sum + r.summary.runs.length, 0)
  logger.success(`Leaderboard written to ${out} (${runs.length} model(s), ${scenarioCount} scenario run(s), ${timestamp})`)
}
