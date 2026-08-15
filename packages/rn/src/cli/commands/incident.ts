/**
 * vectalon incident — Incident Commander Agent (Roadmap Phase 11, item 097)
 * Business Source License 1.1 (BSL-1.1)
 *
 * From a crash log (or the latest crash report) to an incident brief.
 * Reports to docs/vectalon/incident/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runIncident, writeIncidentReport } from '../../incident'

export interface IncidentCommandOptions {
  /** Path to the crash log to analyze (default: latest crash report). */
  log?: string
  /** Print machine-readable output. */
  json?: boolean
}

export async function incidentCommand(directory: string, options: IncidentCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runIncident(root, { log: options.log })
  const { jsonPath } = writeIncidentReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`source: ${report.source}`)
  body.push('')
  if (report.rootCause === 'no-data') {
    body.push(`  ${pc.yellow('▲')} No crash data — ${report.probableCause}`)
    body.push('')
    for (const s of report.nextSteps) body.push(`  - ${s}`)
    printCarbonReport({
      title: 'vectalon incident — Incident Commander (097)',
      verdict: report.verdict,
      lines: body,
      reportPath: jsonPath,
      root,
    })
    return
  }
  const sev = report.severity === 'error' ? pc.red(report.severity) : pc.yellow(report.severity)
  body.push(`Platform: ${report.platform} | root cause: ${pc.bold(report.rootCause)} | severity: ${sev}`)
  if (report.exceptionType) body.push(`Exception: ${report.exceptionType}`)
  body.push('')
  body.push(pc.bold('Probable cause:'))
  body.push(`  ${report.probableCause}`)
  if (report.releaseRisk) {
    const risk = report.releaseRisk.risk
    body.push(`  ${dim('Release risk:')} ${risk === 'low' ? pc.green(risk) : pc.yellow(risk)} (${report.releaseRisk.score}/100)`)
  }
  body.push('')
  if (report.hotFiles.length > 0) {
    body.push(pc.bold('Hot files:'))
    for (const h of report.hotFiles) {
      body.push(`  ${h.file}`)
      for (const c of h.recentCommits) body.push(`    ${dim(c)}`)
    }
    body.push('')
  }
  body.push(pc.bold('Next steps:'))
  for (const s of report.nextSteps) body.push(`  - ${s}`)

  printCarbonReport({
    title: 'vectalon incident — Incident Commander (097)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
