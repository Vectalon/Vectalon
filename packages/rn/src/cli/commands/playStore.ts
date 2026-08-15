/**
 * vectalon play-store — Deep Play Store Readiness Agent (Roadmap Phase 10, item 087)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Deep Play-specific readiness: manifest, SDK levels, signing, listing
 * assets. Reports to docs/vectalon/play-store/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runPlayScan, writePlayReport } from '../../playStore'

export interface PlayStoreCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function playStoreCommand(directory: string, options: PlayStoreCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runPlayScan(root)
  const { jsonPath } = writePlayReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon play-store — Deep Play Store Readiness Agent (087)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const verdictColor = report.verdict === 'approved' ? pc.green : report.verdict === 'needs-attention' ? pc.yellow : pc.red
  logger.info(`Verdict: ${verdictColor(report.verdict)} | checks: ${report.checks.length}`)
  logger.info('')
  for (const c of report.checks) {
    const mark = c.status === 'pass' ? pc.green('✔') : c.status === 'warn' ? pc.yellow('▲') : pc.red('✖')
    logger.info(`  ${mark} ${c.label.padEnd(20)} ${c.message}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
