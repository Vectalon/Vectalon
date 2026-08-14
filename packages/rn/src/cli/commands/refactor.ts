/**
 * vectalon refactor — Refactoring Agent (Roadmap Phase 8, item 066)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Scans a project's source files in one deterministic pass and proposes
 * concrete, safe refactors: dead code, duplication, modernization, type
 * smells, style debt, and complexity — every finding line-pinned with a
 * specific suggestion. Reports to docs/vectalon/refactor/ (gitignored)
 * with --json output.
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runRefactorScan, renderRefactorMarkdown, writeRefactorReport } from '../../refactor'

export interface RefactorCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function refactorCommand(directory: string, options: RefactorCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  const report = runRefactorScan(root)
  const { jsonPath } = writeRefactorReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon refactor — Refactoring Agent (066)'))
  logger.info(`project: ${root}`)
  logger.info('')

  const verdictColor = report.verdict === 'approved'
    ? pc.green
    : report.verdict === 'needs-attention'
      ? pc.yellow
      : pc.red
  logger.info(`Verdict: ${verdictColor(report.verdict)}`)
  logger.info(`Files scanned: ${report.fileCount}`)
  logger.info(`Findings: ${report.summary.total} (${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  logger.info('')

  if (report.findings.length === 0) {
    logger.info('No refactor opportunities found — the code is clean.')
  }
  // Whole-project scans can surface hundreds of small findings — print the
  // severity-ranked top, point at the full report for the rest.
  const printed = report.findings.slice(0, 15)
  for (const f of printed) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file
    logger.info(`  ${icon} [${f.severity}] ${f.id} — ${loc}`)
    logger.info(`    ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  if (report.findings.length > printed.length) {
    logger.info(pc.dim(`  …and ${report.findings.length - printed.length} more — see report.json / report.md for the full list`))
  }
  logger.info('')

  for (const line of report.summary.topRecommendations) {
    logger.info(`→ ${line}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
  logger.success('Refactor scan complete — start with the warnings; they are the safest, highest-value wins.')
}
