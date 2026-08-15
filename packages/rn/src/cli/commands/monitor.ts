/**
 * vectalon monitor — Observability Dashboard Agent (Roadmap Phase 11,
 * item 094) — Business Source License 1.1 (BSL-1.1)
 *
 * Telemetry folded into one executive view. Reports to
 * docs/vectalon/monitor/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
import { runMonitor, writeMonitorReport } from '../../monitor'

export interface MonitorCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function monitorCommand(directory: string, options: MonitorCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runMonitor(root)
  const { jsonPath } = writeMonitorReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`Crash classes: ${report.crashClasses} | telemetry events: ${report.telemetryEvents}`)
  body.push('')
  for (const s of report.surfaces) {
    const mark = s.verdict === 'approved' ? pc.green('✓') : s.verdict === 'no-data' ? dim('○') : pc.yellow('▲')
    body.push(`  ${mark} ${s.label.padEnd(32)} ${String(s.verdict).padEnd(18)} ${s.summary}`)
  }
  body.push('')
  for (const f of report.findings) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id} — ${f.message}`)
  }

  printCarbonReport({
    title: 'vectalon monitor — Observability Dashboard (094)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
