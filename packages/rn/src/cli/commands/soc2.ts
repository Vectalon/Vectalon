/**
 * vectalon soc2 — SOC2 Readiness Agent (Roadmap Phase 9, item 075)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Repository-evidence checklist across the SOC2 trust criteria. Reports to
 * docs/vectalon/soc2/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runSoc2Scan, writeSoc2Report } from '../../soc2'

export interface Soc2CommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function soc2Command(directory: string, options: Soc2CommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runSoc2Scan(root)
  const { jsonPath } = writeSoc2Report(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  const color = report.score >= 80 ? pc.green : report.score >= 50 ? pc.yellow : pc.red
  body.push(`Score: ${color(`${report.score}%`)} (${report.summary.pass} pass, ${report.summary.partial} partial, ${report.summary.fail} fail)`)
  body.push('')
  for (const c of report.controls) {
    const icon = c.status === 'pass' ? pc.green('✓') : c.status === 'partial' ? pc.yellow('▲') : pc.red('✖')
    body.push(`  ${icon} [${c.criteria}] ${c.title} — ${c.status}`)
    body.push(`    ${dim(c.evidence || 'no evidence')}`)
  }
  body.push('')
  body.push(dim('Note: repository-evidence self-assessment, not an audit. Process/personnel evidence is required for certification.'))

  printCarbonReport({
    title: 'vectalon soc2 — SOC2 Readiness Agent (075)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
