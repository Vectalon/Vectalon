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
import { printCarbonReport, parchment, dim } from '../carbon'
import { runRefactorScan, writeRefactorReport } from '../../refactor'

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

  const body: string[] = []
  body.push(`Files scanned: ${report.fileCount}`)
  body.push(`Findings: ${report.summary.total} (${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  body.push('')

  if (report.findings.length === 0) {
    body.push('No refactor opportunities found — the code is clean.')
  }
  // Whole-project scans can surface hundreds of small findings — print the
  // severity-ranked top, point at the full report for the rest.
  const printed = report.findings.slice(0, 15)
  for (const f of printed) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file
    body.push(`  ${icon} [${f.severity}] ${f.id} — ${loc}`)
    body.push(`    ${parchment(f.message)}`)
    body.push(`    ${dim(f.suggestion)}`)
  }
  if (report.findings.length > printed.length) {
    body.push(dim(`  …and ${report.findings.length - printed.length} more — see report.json / report.md for the full list`))
  }
  body.push('')

  for (const line of report.summary.topRecommendations) {
    body.push(`→ ${line}`)
  }

  printCarbonReport({
    title: 'vectalon refactor — Refactoring Agent (066)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
    done: 'Refactor scan complete — start with the warnings; they are the safest, highest-value wins.',
  })
}
