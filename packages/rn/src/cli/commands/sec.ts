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
import { printCarbonReport, parchment, dim } from '../carbon'
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

  const body: string[] = []
  body.push(`Files scanned: ${report.fileCount}`)
  body.push(`Findings: ${report.summary.total} (${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  body.push('')

  if (!report.audit.ran) {
    body.push(`${dim('Dependency audit:')} skipped — ${report.audit.skippedReason ?? 'not run'}`)
  } else {
    body.push(`${dim('Dependency audit:')} ${report.audit.total} advisory(ies) — ${report.audit.critical} critical, ${report.audit.high} high, ${report.audit.moderate} moderate, ${report.audit.low} low`)
  }
  body.push('')

  if (report.findings.length === 0) {
    body.push('No security issues found.')
  }
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file
    body.push(`  ${icon} [${f.severity}] ${f.id} — ${loc}`)
    body.push(`    ${parchment(f.message)}`)
    body.push(`    ${dim(f.suggestion)}`)
  }
  body.push('')

  for (const line of report.summary.topRecommendations) {
    body.push(`→ ${line}`)
  }

  printCarbonReport({
    title: 'vectalon sec — Security Review Agent (063)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
    done: 'Security review complete — fix the errors before shipping.',
  })
}
