/**
 * vectalon cicd — CI/CD Intelligence Agent (Roadmap Phase 9, item 073)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Scans CI workflows for anti-patterns: unpinned actions, missing
 * concurrency/timeouts, inline secrets, deploys without a test gate.
 * Reports to docs/vectalon/cicd/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runCiScan, writeCiReport } from '../../cicd'

export interface CicdCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function cicdCommand(directory: string, options: CicdCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runCiScan(root)
  const { jsonPath } = writeCiReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon cicd — CI/CD Intelligence Agent (073)'))
  logger.info(`project: ${root}`)
  logger.info(`systems: ${report.ciSystems.join(', ') || 'none detected'} | files: ${report.files.length}`)
  logger.info('')
  const verdictColor = report.verdict === 'approved' ? pc.green : report.verdict === 'needs-attention' ? pc.yellow : pc.red
  logger.info(`Verdict: ${verdictColor(report.verdict)} (${report.summary.total} findings)`)
  logger.info('')
  if (report.findings.length === 0) logger.info('No CI anti-patterns found.')
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id} — ${f.file}:${f.line}`)
    logger.info(`    ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
