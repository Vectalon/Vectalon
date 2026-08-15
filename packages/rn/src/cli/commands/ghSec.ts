/**
 * vectalon gh-sec — GitHub Security Posture Agent (Roadmap Phase 11,
 * item 093) — Business Source License 1.1 (BSL-1.1)
 *
 * One security snapshot of the GitHub surface. Reports to
 * docs/vectalon/gh-sec/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runGhSec, writeGhSecReport } from '../../ghSec'

export interface GhSecCommandOptions {
  /** Read security data from a JSON export instead of the gh API. */
  file?: string
  /** Print machine-readable output. */
  json?: boolean
}

export async function ghSecCommand(directory: string, options: GhSecCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runGhSec(root, { file: options.file })
  const { jsonPath } = writeGhSecReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon gh-sec — GitHub Security Posture (093)'))
  logger.info(`project: ${root} · source: ${report.source}`)
  logger.info('')
  const d = report.dependabot
  logger.info(
    `Dependabot: ${d.open} open (${d.critical} critical/high) | secrets: ${report.secretScanning.open} | protection: ${report.branchProtection.enabled ? pc.green('on') : pc.yellow('off')} | verdict: ${report.verdict === 'approved' ? pc.green(report.verdict) : pc.yellow(report.verdict)}`,
  )
  logger.info('')
  for (const f of report.findings) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id} (${f.surface})`)
    logger.info(`    ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
