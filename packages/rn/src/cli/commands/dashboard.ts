/**
 * vectalon dashboard — Engineering Dashboard (Roadmap Phase 9, item 079)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Aggregates every agent report into one executive view + self-contained
 * HTML dashboard. --run regenerates the fast core reports first. Reports to
 * docs/vectalon/dashboard/ (gitignored).
 */
import { execSync } from 'child_process'
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runDashboard, writeDashboardReport } from '../../dashboard'
import type { DashboardOptions } from '../../dashboard'

export interface DashboardCommandOptions extends DashboardOptions {
  /** Print machine-readable output. */
  json?: boolean
  /** Open the HTML dashboard in the default browser. */
  open?: boolean
}

export async function dashboardCommand(directory: string, options: DashboardCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = await runDashboard(root, { run: options.run })
  const { jsonPath, htmlPath } = writeDashboardReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon dashboard — Engineering Dashboard (079)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const color = report.overall === 'approved' ? pc.green : report.overall === 'needs-attention' ? pc.yellow : pc.red
  logger.info(`Overall: ${color(report.overall)} | ${report.summary.agents} agents, ${report.summary.findings} findings (${report.summary.errors} err, ${report.summary.warnings} warn)`)
  logger.info('')
  for (const a of report.agents) {
    const c = a.verdict === 'approved' ? pc.green : a.verdict === 'needs-attention' ? pc.yellow : pc.red
    logger.info(`  ${c(a.verdict.padEnd(18))} ${a.agent.padEnd(16)} ${a.errors} err / ${a.warnings} warn / ${a.infos} info`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
  logger.info(`HTML:   ${pc.dim(htmlPath)}`)
  if (options.open) {
    try {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
      execSync(`${opener} "${htmlPath}"`)
      logger.success('Opened the dashboard in your browser.')
    } catch {
      logger.warn('Could not open the browser automatically — open the HTML path above.')
    }
  }
}
