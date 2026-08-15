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
import { printCarbonReport } from '../carbon'
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

  const body: string[] = []
  body.push(`checks: ${report.checks.length}`)
  body.push('')
  for (const c of report.checks) {
    const mark = c.status === 'pass' ? pc.green('✔') : c.status === 'warn' ? pc.yellow('▲') : pc.red('✖')
    body.push(`  ${mark} ${c.label.padEnd(18)} ${c.evidence}`)
  }

  printCarbonReport({
    title: 'vectalon governance — Enterprise Governance Agent (083)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
