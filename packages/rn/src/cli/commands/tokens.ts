/**
 * vectalon tokens — Design Token Sync Agent (Roadmap Phase 9, item 076)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Checks design-token drift: orphaned tokens, hardcoded values, duplicate
 * token values. Reports to docs/vectalon/tokens/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runTokenScan, writeTokenReport } from '../../tokens'

export interface TokensCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function tokensCommand(directory: string, options: TokensCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runTokenScan(root)
  const { jsonPath } = writeTokenReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon tokens — Design Token Sync Agent (076)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const verdictColor = report.verdict === 'approved' ? pc.green : pc.yellow
  logger.info(`Verdict: ${verdictColor(report.verdict)} | tokens: ${report.tokenCount} | file: ${report.tokenFile ?? 'none'}`)
  logger.info('')
  if (report.findings.length === 0) logger.info('No token drift detected.')
  for (const f of report.findings.slice(0, 15)) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id} ${f.token ? `— ${f.token}` : ''}`)
    logger.info(`    ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  if (report.findings.length > 15) logger.info(pc.dim(`  … and ${report.findings.length - 15} more`))
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
