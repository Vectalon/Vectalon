/**
 * vectalon team-stats — Team Productivity Analytics (Roadmap Phase 9,
 * item 077) — Business Source License 1.1 (BSL-1.1)
 *
 * Deterministic git-history analytics: cadence, bus factor, author
 * distribution. Read-only git. Reports to docs/vectalon/team-stats/
 * (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runTeamStats, writeTeamStatsReport } from '../../teamStats'

export interface TeamStatsCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function teamStatsCommand(directory: string, options: TeamStatsCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runTeamStats(root)
  const { jsonPath } = writeTeamStatsReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon team-stats — Team Productivity Analytics (077)'))
  logger.info(`project: ${root}`)
  logger.info('')
  logger.info(`Commits: ${report.totalCommits} | Authors: ${report.authors.length} | Bus factor: ${report.busFactor} | Cadence: ${report.cadencePerDay.toFixed(1)}/day | Verdict: ${report.verdict === 'approved' ? pc.green(report.verdict) : pc.yellow(report.verdict)}`)
  logger.info('')
  logger.info(pc.bold('Authors:'))
  for (const a of report.authors.slice(0, 8)) {
    logger.info(`  ${a.author.padEnd(20)} ${String(a.commits).padStart(4)} commits  ${pc.dim(`(${(a.share * 100).toFixed(0)}%)`)}`)
  }
  logger.info('')
  for (const f of report.findings) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id} — ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
