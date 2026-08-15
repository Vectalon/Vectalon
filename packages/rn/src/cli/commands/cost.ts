/**
 * vectalon cost — Cost Governance Agent (Roadmap Phase 11, item 099)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Cloud + model spend estimate from project config. Estimates are labeled
 * as estimates. Reports to docs/vectalon/cost/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runCost, writeCostReport } from '../../cost'

export interface CostCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function costCommand(directory: string, options: CostCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runCost(root)
  const { jsonPath } = writeCostReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon cost — Cost Governance (099)'))
  logger.info(`project: ${root}`)
  logger.info('')
  logger.info(`Estimated spend: ${pc.bold('$' + report.totalUsd + '/mo')} | verdict: ${report.verdict === 'approved' ? pc.green(report.verdict) : pc.yellow(report.verdict)}`)
  logger.info('')
  for (const l of report.lines) {
    logger.info(`  ${pc.dim('•')} ${l.label.padEnd(40)} $${l.amountUsd}  (${l.basis})`)
  }
  if (report.lines.length === 0) logger.info(`  ${pc.dim('No cost surfaces found — see findings.')}`)
  logger.info('')
  logger.info(pc.dim('Assumptions:'))
  for (const a of report.assumptions) logger.info(`  ${pc.dim('- ' + a)}`)
  logger.info('')
  for (const f of report.findings) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id} — ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
