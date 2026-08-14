/**
 * vectalon app-store — App Store Readiness Agent (Roadmap Phase 9, item 074)
 * Business Source License 1.1 (BSL-1.1)
 *
 * iOS/Android store-readiness checks: version consistency, icons, privacy
 * manifest, permissions, cleartext posture. Reports to
 * docs/vectalon/app-store/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runStoreScan, writeStoreReport } from '../../appStore'

export interface AppStoreCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function appStoreCommand(directory: string, options: AppStoreCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runStoreScan(root)
  const { jsonPath } = writeStoreReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon app-store — Store Readiness Agent (074)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const verdictColor = report.verdict === 'approved' ? pc.green : report.verdict === 'needs-attention' ? pc.yellow : pc.red
  logger.info(`Verdict: ${verdictColor(report.verdict)} (${report.summary.total} findings)`)
  logger.info('')
  if (report.findings.length === 0) logger.info('No store-readiness issues found.')
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.platform} — ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
