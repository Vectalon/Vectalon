/**
 * vectalon audit — Org-wide Audit Trail Agent (Roadmap Phase 10, item 084)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Validates the org audit trail (`.vectalon/audit/*.jsonl`) and summarizes
 * activity. Reports to docs/vectalon/audit/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
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

  logger.info(pc.bold('vectalon audit — Org-wide Audit Trail Agent (084)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const verdictColor = report.verdict === 'approved' ? pc.green : pc.yellow
  logger.info(`Verdict: ${verdictColor(report.verdict)} | entries: ${report.summary.entries} | files: ${report.summary.files}`)
  logger.info('')
  for (const a of report.summary.actors.slice(0, 5)) logger.info(`  ${pc.dim('actor')} ${a.actor.padEnd(20)} ${a.count} entries`)
  for (const f of report.findings.slice(0, 15)) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id}${f.line !== undefined ? ` (line ${f.line})` : ''}`)
    logger.info(`    ${f.message}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
