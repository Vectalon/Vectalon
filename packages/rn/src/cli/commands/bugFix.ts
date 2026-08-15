/**
 * vectalon bug-fix — Autonomous Bug Fix Agent (Roadmap Phase 8, item 070)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Proposes fixes for deterministic defects and applies the provably-safe
 * ones with --apply (refusing a dirty git tree unless --force). Reports to
 * docs/vectalon/bug-fix/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { printCarbonReport, parchment, dim } from '../carbon'
import { runBugFix, writeBugFixReport } from '../../bugFix'
import type { BugFixOptions } from '../../bugFix'

export interface BugFixCommandOptions extends BugFixOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function bugFixCommand(directory: string, options: BugFixCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = await runBugFix(root, { apply: options.apply, force: options.force })
  const { jsonPath } = writeBugFixReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`Findings: ${report.summary.total} (${report.summary.fixable} auto-fixable) | Applied: ${report.summary.applied} | Refused (dirty tree): ${report.refused}`)
  body.push('')

  if (report.findings.length === 0) {
    body.push('No fixable findings — nothing to do.')
  }
  for (const f of report.findings.slice(0, 15)) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id} — ${f.file}:${f.line} (${f.fixable ? 'auto' : 'manual'})`)
    body.push(`    ${parchment(f.message)}`)
    body.push(`    ${dim(f.suggestion)}`)
  }
  if (report.findings.length > 15) body.push(dim(`  … and ${report.findings.length - 15} more (full plan in the report)`))
  body.push('')

  printCarbonReport({
    title: 'vectalon bug-fix — Autonomous Bug Fix Agent (070)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
  if (options.apply && report.refused > 0) {
    logger.warn(`Refused ${report.refused} auto-fixes: working tree is dirty. Commit/stash, or re-run with --force.`)
  } else if (options.apply) {
    logger.success(`Applied ${report.summary.applied} safe fix(es). Review the diff before committing.`)
  } else {
    logger.info('Dry run — pass --apply to execute the safe fixes (git must be clean).')
  }
}
