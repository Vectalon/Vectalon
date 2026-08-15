/**
 * vectalon monitor — Observability Dashboard Agent (Roadmap Phase 11,
 * item 094) — Business Source License 1.1 (BSL-1.1)
 *
 * Telemetry folded into one executive view. Reports to
 * docs/vectalon/monitor/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
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

  logger.info(pc.bold('vectalon monitor — Observability Dashboard (094)'))
  logger.info(`project: ${root}`)
  logger.info('')
  logger.info(`Crash classes: ${report.crashClasses} | telemetry events: ${report.telemetryEvents} | verdict: ${report.verdict === 'approved' ? pc.green(report.verdict) : pc.yellow(report.verdict)}`)
  logger.info('')
  for (const s of report.surfaces) {
    const mark = s.verdict === 'approved' ? pc.green('✓') : s.verdict === 'no-data' ? pc.dim('○') : pc.yellow('▲')
    logger.info(`  ${mark} ${s.label.padEnd(32)} ${String(s.verdict).padEnd(18)} ${s.summary}`)
  }
  logger.info('')
  for (const f of report.findings) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id} — ${f.message}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
