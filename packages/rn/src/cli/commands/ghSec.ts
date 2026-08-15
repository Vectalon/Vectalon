/**
 * vectalon gh-sec — GitHub Security Posture Agent (Roadmap Phase 11,
 * item 093) — Business Source License 1.1 (BSL-1.1)
 *
 * One security snapshot of the GitHub surface. Reports to
 * docs/vectalon/gh-sec/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runGhSec, writeGhSecReport } from '../../ghSec'

export interface GhSecCommandOptions {
  /** Read security data from a JSON export instead of the gh API. */
  file?: string
  /** Print machine-readable output. */
  json?: boolean
}

export async function ghSecCommand(directory: string, options: GhSecCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runGhSec(root, { file: options.file })
  const { jsonPath } = writeGhSecReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const d = report.dependabot
  const body: string[] = []
  body.push(`source: ${report.source}`)
  body.push(
    `Dependabot: ${d.open} open (${d.critical} critical/high) | secrets: ${report.secretScanning.open} | protection: ${report.branchProtection.enabled ? pc.green('on') : pc.yellow('off')}`,
  )
  body.push('')
  for (const f of report.findings) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id} (${f.surface})`)
    body.push(`    ${f.message}`)
    body.push(`    ${dim(f.suggestion)}`)
  }

  printCarbonReport({
    title: 'vectalon gh-sec — GitHub Security Posture (093)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
