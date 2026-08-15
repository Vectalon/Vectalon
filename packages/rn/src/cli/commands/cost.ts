/**
 * vectalon cost — Cost Governance Agent (Roadmap Phase 11, item 099)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Cloud + model spend estimate from project config. Estimates are labeled
 * as estimates. Reports to docs/vectalon/cost/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
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

  const body: string[] = []
  body.push(`Estimated spend: ${pc.bold('$' + report.totalUsd + '/mo')}`)
  body.push('')
  for (const l of report.lines) {
    body.push(`  ${dim('•')} ${l.label.padEnd(40)} $${l.amountUsd}  (${l.basis})`)
  }
  if (report.lines.length === 0) body.push(`  ${dim('No cost surfaces found — see findings.')}`)
  body.push('')
  body.push(dim('Assumptions:'))
  for (const a of report.assumptions) body.push(`  ${dim('- ' + a)}`)
  body.push('')
  for (const f of report.findings) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id} — ${f.message}`)
    body.push(`    ${dim(f.suggestion)}`)
  }

  printCarbonReport({
    title: 'vectalon cost — Cost Governance (099)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
