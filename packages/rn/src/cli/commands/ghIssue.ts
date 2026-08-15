/**
 * vectalon gh-issue — GitHub Issue Intelligence Agent (Roadmap Phase 11,
 * item 091) — Business Source License 1.1 (BSL-1.1)
 *
 * Triage signal from the open-issue backlog. Reports to
 * docs/vectalon/gh-issue/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runGhIssue, writeGhIssueReport } from '../../ghIssue'

export interface GhIssueCommandOptions {
  /** Read issue JSON from an export file instead of the gh CLI. */
  file?: string
  /** Maximum number of issues to analyze. */
  max?: number
  /** Print machine-readable output. */
  json?: boolean
}

export async function ghIssueCommand(directory: string, options: GhIssueCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runGhIssue(root, { file: options.file, max: options.max })
  const { jsonPath } = writeGhIssueReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon gh-issue — GitHub Issue Intelligence (091)'))
  logger.info(`project: ${root} · source: ${report.source}`)
  logger.info('')
  if (report.issues.length === 0) {
    for (const f of report.findings) {
      logger.info(`  ${pc.yellow('▲')} [${f.severity}] ${f.id}`)
      logger.info(`    ${f.message}`)
      logger.info(`    ${pc.dim(f.suggestion)}`)
    }
    logger.info('')
    logger.info(`Verdict: ${pc.red(report.verdict)} (no issue data)`)
    logger.info(`Report: ${pc.dim(jsonPath)}`)
    return
  }
  const s = report.summary
  logger.info(`Open: ${s.total} | stale: ${pc.yellow(String(s.stale))} | unassigned: ${pc.yellow(String(s.unassigned))} | triaged: ${pc.green(String(s.triaged))} | verdict: ${report.verdict === 'approved' ? pc.green(report.verdict) : pc.yellow(report.verdict)}`)
  logger.info('')
  for (const i of report.issues) {
    logger.info(`  #${String(i.number).padEnd(5)} ${i.title.slice(0, 48).padEnd(50)} ${String(i.ageDays).padStart(3)}d  ${i.labels.join(',') || pc.dim('unlabeled')}  ${i.verdict}`)
  }
  logger.info('')
  for (const f of report.findings.filter(x => x.severity === 'warning')) {
    logger.info(`  ${pc.yellow('▲')} [${f.severity}] ${f.id}${f.issue ? ` (issue #${f.issue})` : ''} — ${f.message}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
