/**
 * vectalon perms — Agent Permissions Audit (Roadmap Phase 9, item 078)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Audits agent/MCP config for over-permissioned tool grants and embedded
 * credentials. Reports to docs/vectalon/perms/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runPermsScan, writePermsReport } from '../../perms'

export interface PermsCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function permsCommand(directory: string, options: PermsCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runPermsScan(root)
  const { jsonPath } = writePermsReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon perms — Agent Permissions Audit (078)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const verdictColor = report.verdict === 'approved' ? pc.green : report.verdict === 'needs-attention' ? pc.yellow : pc.red
  logger.info(`Verdict: ${verdictColor(report.verdict)} | config files: ${report.configFiles.length}`)
  logger.info('')
  if (report.configFiles.length === 0) {
    logger.info('No agent/MCP config files found — nothing to audit.')
  }
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id} — ${f.file}:${f.line}`)
    logger.info(`    ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
