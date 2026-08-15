/**
 * vectalon governance — Enterprise Governance Agent (Roadmap Phase 10, item 083)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Checks enterprise-governance evidence: license, security policy,
 * CODEOWNERS, SBOM, Dependabot, CI. Reports to docs/vectalon/governance/
 * (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runGovScan, writeGovReport } from '../../governance'

export interface GovCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function governanceCommand(directory: string, options: GovCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runGovScan(root)
  const { jsonPath } = writeGovReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon governance — Enterprise Governance Agent (083)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const verdictColor = report.verdict === 'approved' ? pc.green : pc.yellow
  logger.info(`Verdict: ${verdictColor(report.verdict)} | checks: ${report.checks.length}`)
  logger.info('')
  for (const c of report.checks) {
    const mark = c.status === 'pass' ? pc.green('✔') : c.status === 'warn' ? pc.yellow('▲') : pc.red('✖')
    logger.info(`  ${mark} ${c.label.padEnd(18)} ${c.evidence}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
