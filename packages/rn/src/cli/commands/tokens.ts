/**
 * vectalon tokens — Design Token Sync Agent (Roadmap Phase 9, item 076)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Checks design-token drift: orphaned tokens, hardcoded values, duplicate
 * token values. Reports to docs/vectalon/tokens/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
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

  const body: string[] = []
  body.push(`tokens: ${report.tokenCount} | file: ${report.tokenFile ?? 'none'}`)
  body.push('')
  if (report.findings.length === 0) body.push('No token drift detected.')
  for (const f of report.findings.slice(0, 15)) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id} ${f.token ? `— ${f.token}` : ''}`)
    body.push(`    ${parchment(f.message)}`)
    body.push(`    ${dim(f.suggestion)}`)
  }
  if (report.findings.length > 15) body.push(dim(`  … and ${report.findings.length - 15} more`))

  printCarbonReport({
    title: 'vectalon tokens — Design Token Sync Agent (076)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
