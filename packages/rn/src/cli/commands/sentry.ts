/**
 * vectalon sentry — Sentry Intelligence Agent (Roadmap Phase 10, item 081)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Ranks crash classes from Sentry/Crashlytics telemetry exports. Reports to
 * docs/vectalon/sentry/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runSentryScan, writeSentryReport } from '../../sentry'

export interface SentryCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function sentryCommand(directory: string, options: SentryCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runSentryScan(root)
  const { jsonPath } = writeSentryReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`files: ${report.filesScanned} | events: ${report.events} | crash classes: ${report.crashClasses.length}`)
  body.push('')
  for (const c of report.crashClasses.slice(0, 10)) {
    const color = c.severity === 'critical' ? pc.red : c.severity === 'warning' ? pc.yellow : dim
    body.push(`  ${color(`[${c.severity.toUpperCase()}]`)} ${c.key} — ${c.eventCount} events, ${c.userCount} users, bucket: ${c.bucket}`)
  }
  if (report.crashClasses.length > 10) body.push(dim(`  … and ${report.crashClasses.length - 10} more classes`))
  for (const f of report.findings) {
    const icon = f.severity === 'critical' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id} ${f.key ? `— ${f.key}` : ''}`)
    body.push(`    ${f.message}`)
  }

  printCarbonReport({
    title: 'vectalon sentry — Sentry Intelligence Agent (081)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
