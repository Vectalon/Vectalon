/**
 * vectalon sec — Security Review Agent (Roadmap Phase 8, item 063)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Reviews a project's security posture in one pass: hardcoded secrets
 * (redacted), unsafe code patterns, and best-effort dependency advisories
 * via npm audit (degrading to a skip when the audit can't run). Verdict
 * approved / needs-attention / changes-requested; --json; reports to
 * docs/vectalon/sec/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runSecurityReview, writeSecurityReport } from '../../security'
import type { SecurityOptions } from '../../security'

export interface SecCommandOptions extends SecurityOptions {
  /** Print machine-readable output. */
  json?: boolean
  /** Set by commander for `--no-audit` (true when the flag is absent). */
  audit?: boolean
}

export async function secCommand(directory: string, options: SecCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  // commander's `--no-audit` surfaces as `audit: false`; map onto the
  // SecurityOptions surface used by the library and tests.
  const reviewOptions: SecurityOptions = { ...options, skipAudit: options.audit === false }
  const report = await runSecurityReview(root, reviewOptions)
  const { jsonPath } = writeSecurityReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon sec — Security Review Agent (063)'))
  logger.info(`project: ${root}`)
  logger.info('')

  const verdictColor = report.verdict === 'approved'
    ? pc.green
    : report.verdict === 'needs-attention'
      ? pc.yellow
      : pc.red
  logger.info(`Verdict: ${verdictColor(report.verdict)}`)
  logger.info(`Files scanned: ${report.fileCount}`)
  logger.info(`Findings: ${report.summary.total} (${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  logger.info('')

  if (!report.audit.ran) {
    logger.info(`${pc.dim('Dependency audit:')} skipped — ${report.audit.skippedReason ?? 'not run'}`)
  } else {
    logger.info(`${pc.dim('Dependency audit:')} ${report.audit.total} advisory(ies) — ${report.audit.critical} critical, ${report.audit.high} high, ${report.audit.moderate} moderate, ${report.audit.low} low`)
  }
  logger.info('')

  if (report.findings.length === 0) {
    logger.info('No security issues found.')
  }
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file
    logger.info(`  ${icon} [${f.severity}] ${f.id} — ${loc}`)
    logger.info(`    ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  logger.info('')

  for (const line of report.summary.topRecommendations) {
    logger.info(`→ ${line}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
  logger.success('Security review complete — fix the errors before shipping.')
}
