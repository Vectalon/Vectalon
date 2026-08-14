/**
 * vectalon a11y — Accessibility Agent (Roadmap Phase 8, item 068)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass over component files that flags accessibility
 * debt: unlabeled images, touchables without roles, unlabeled TextInputs,
 * and undersized touch targets. Reports to docs/vectalon/a11y/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runA11yScan, writeA11yReport } from '../../a11y'

export interface A11yCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function a11yCommand(directory: string, options: A11yCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  const report = runA11yScan(root)
  const { jsonPath } = writeA11yReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon a11y — Accessibility Agent (068)'))
  logger.info(`project: ${root}`)
  logger.info('')

  const verdictColor = report.verdict === 'approved'
    ? pc.green
    : report.verdict === 'needs-attention'
      ? pc.yellow
      : pc.red
  logger.info(`Verdict: ${verdictColor(report.verdict)}`)
  logger.info(`Component files scanned: ${report.fileCount}`)
  logger.info(`Findings: ${report.summary.total} (${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s))`)
  logger.info('')

  if (report.findings.length === 0) {
    logger.info('No accessibility issues found — the component tree is screen-reader friendly.')
  }
  const printed = report.findings.slice(0, 15)
  for (const f of printed) {
    const icon = f.severity === 'error' ? pc.red('✖') : pc.yellow('▲')
    logger.info(`  ${icon} [${f.severity}] ${f.id} — ${f.file}:${f.line}`)
    logger.info(`    ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  if (report.findings.length > printed.length) {
    logger.info(pc.dim(`  …and ${report.findings.length - printed.length} more — see report.json / report.md`))
  }
  logger.info('')

  for (const line of report.summary.topRecommendations) {
    logger.info(`→ ${line}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
  logger.success('Accessibility scan complete — fix the errors (unlabeled images) first.')
}
