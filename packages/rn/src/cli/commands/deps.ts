/**
 * vectalon deps — Dependency Upgrade Agent (Roadmap Phase 8, item 067)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Finds what to upgrade and the safe path: RN ecosystem pairing violations,
 * duplicate versions across workspace members, and vulnerable dependencies
 * via best-effort npm audit. Reports to docs/vectalon/deps/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { runDepsScan, writeDepsReport } from '../../deps'
import type { DepOptions } from '../../deps'

export interface DepsCommandOptions extends DepOptions {
  /** Print machine-readable output. */
  json?: boolean
  /** Set by commander for `--no-audit` (true when the flag is absent). */
  audit?: boolean
}

export async function depsCommand(directory: string, options: DepsCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  const reviewOptions: DepOptions = { ...options, skipAudit: options.audit === false }
  const report = await runDepsScan(root, reviewOptions)
  const { jsonPath } = writeDepsReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`Dependencies: ${report.depCount}`)
  body.push(`Findings: ${report.summary.total} (${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  body.push('')

  if (!report.audit.ran) {
    body.push(`${dim('Dependency audit:')} skipped — ${report.audit.skippedReason ?? 'not run'}`)
  } else {
    body.push(`${dim('Dependency audit:')} ${report.audit.total} advisory(ies) — ${report.audit.critical} critical, ${report.audit.high} high`)
  }
  body.push('')

  if (report.findings.length === 0) {
    body.push('No dependency issues found — the tree is aligned and clean.')
  }
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id} — ${f.package} (${f.current})`)
    body.push(`    ${parchment(f.message)}`)
    body.push(`    ${dim(f.suggestion)}`)
  }
  body.push('')

  for (const line of report.summary.topRecommendations) {
    body.push(`→ ${line}`)
  }

  printCarbonReport({
    title: 'vectalon deps — Dependency Upgrade Agent (067)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
    done: 'Dependency scan complete — apply the upgrade paths one at a time, then re-run.',
  })
}
