/**
 * vectalon soc2 — SOC2 Readiness Agent (Roadmap Phase 9, item 075)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Repository-evidence checklist across the SOC2 trust criteria. Reports to
 * docs/vectalon/soc2/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runSoc2Scan, writeSoc2Report } from '../../soc2'

export interface Soc2CommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function soc2Command(directory: string, options: Soc2CommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runSoc2Scan(root)
  const { jsonPath } = writeSoc2Report(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon soc2 — SOC2 Readiness Agent (075)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const color = report.score >= 80 ? pc.green : report.score >= 50 ? pc.yellow : pc.red
  logger.info(`Score: ${color(`${report.score}%`)} (${report.summary.pass} pass, ${report.summary.partial} partial, ${report.summary.fail} fail) — ${report.verdict}`)
  logger.info('')
  for (const c of report.controls) {
    const icon = c.status === 'pass' ? pc.green('✓') : c.status === 'partial' ? pc.yellow('▲') : pc.red('✖')
    logger.info(`  ${icon} [${c.criteria}] ${c.title} — ${c.status}`)
    logger.info(`    ${pc.dim(c.evidence || 'no evidence')}`)
  }
  logger.info('')
  logger.info('Note: repository-evidence self-assessment, not an audit. Process/personnel evidence is required for certification.')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
