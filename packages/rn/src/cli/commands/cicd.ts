/**
 * vectalon cicd — CI/CD Intelligence Agent (Roadmap Phase 9, item 073)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Scans CI workflows for anti-patterns: unpinned actions, missing
 * concurrency/timeouts, inline secrets, deploys without a test gate.
 * Reports to docs/vectalon/cicd/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { runCiScan, writeCiReport } from '../../cicd'

export interface CicdCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function cicdCommand(directory: string, options: CicdCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runCiScan(root)
  const { jsonPath } = writeCiReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`systems: ${report.ciSystems.join(', ') || 'none detected'} | files: ${report.files.length}`)
  body.push('')
  if (report.findings.length === 0) body.push('No CI anti-patterns found.')
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id} — ${f.file}:${f.line}`)
    body.push(`    ${parchment(f.message)}`)
    body.push(`    ${dim(f.suggestion)}`)
  }

  printCarbonReport({
    title: 'vectalon cicd — CI/CD Intelligence Agent (073)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
