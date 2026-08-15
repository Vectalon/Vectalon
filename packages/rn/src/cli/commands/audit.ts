/**
 * vectalon audit — Org-wide Audit Trail Agent (Roadmap Phase 10, item 084)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Validates the org audit trail (`.vectalon/audit/*.jsonl`) and summarizes
 * activity. Reports to docs/vectalon/audit/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runAuditScan, writeAuditReport } from '../../audit'

export interface AuditCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function auditCommand(directory: string, options: AuditCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runAuditScan(root)
  const { jsonPath } = writeAuditReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`entries: ${report.summary.entries} | files: ${report.summary.files}`)
  body.push('')
  for (const a of report.summary.actors.slice(0, 5)) body.push(`  ${dim('actor')} ${a.actor.padEnd(20)} ${a.count} entries`)
  for (const f of report.findings.slice(0, 15)) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id}${f.line !== undefined ? ` (line ${f.line})` : ''}`)
    body.push(`    ${f.message}`)
  }

  printCarbonReport({
    title: 'vectalon audit — Org-wide Audit Trail Agent (084)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
