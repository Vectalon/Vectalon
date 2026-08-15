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
import { printCarbonReport, dim } from '../carbon'
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

  const body: string[] = []
  body.push(`Commits: ${report.totalCommits} | Authors: ${report.authors.length} | Bus factor: ${report.busFactor} | Cadence: ${report.cadencePerDay.toFixed(1)}/day`)
  body.push('')
  body.push(pc.bold('Authors:'))
  for (const a of report.authors.slice(0, 8)) {
    body.push(`  ${a.author.padEnd(20)} ${String(a.commits).padStart(4)} commits  ${dim(`(${(a.share * 100).toFixed(0)}%)`)}`)
  }
  body.push('')
  for (const f of report.findings) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id} — ${f.message}`)
    body.push(`    ${dim(f.suggestion)}`)
  }

  printCarbonReport({
    title: 'vectalon team-stats — Team Productivity Analytics (077)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
