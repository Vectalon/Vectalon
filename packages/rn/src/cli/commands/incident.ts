/**
 * vectalon incident — Incident Commander Agent (Roadmap Phase 11, item 097)
 * Business Source License 1.1 (BSL-1.1)
 *
 * From a crash log (or the latest crash report) to an incident brief.
 * Reports to docs/vectalon/incident/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
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

  logger.info(pc.bold('vectalon incident — Incident Commander (097)'))
  logger.info(`project: ${root} · source: ${report.source}`)
  logger.info('')
  if (report.rootCause === 'no-data') {
    logger.info(`  ${pc.yellow('▲')} No crash data — ${report.probableCause}`)
    logger.info('')
    for (const s of report.nextSteps) logger.info(`  - ${s}`)
    logger.info('')
    logger.info(`Report: ${pc.dim(jsonPath)}`)
    return
  }
  const sev = report.severity === 'error' ? pc.red(report.severity) : pc.yellow(report.severity)
  logger.info(`Platform: ${report.platform} | root cause: ${pc.bold(report.rootCause)} | severity: ${sev} | verdict: ${report.verdict === 'approved' ? pc.green(report.verdict) : pc.yellow(report.verdict)}`)
  if (report.exceptionType) logger.info(`Exception: ${report.exceptionType}`)
  logger.info('')
  logger.info(pc.bold('Probable cause:'))
  logger.info(`  ${report.probableCause}`)
  if (report.releaseRisk) {
    const risk = report.releaseRisk.risk
    logger.info(`  ${pc.dim('Release risk:')} ${risk === 'low' ? pc.green(risk) : pc.yellow(risk)} (${report.releaseRisk.score}/100)`)
  }
  logger.info('')
  if (report.hotFiles.length > 0) {
    logger.info(pc.bold('Hot files:'))
    for (const h of report.hotFiles) {
      logger.info(`  ${h.file}`)
      for (const c of h.recentCommits) logger.info(`    ${pc.dim(c)}`)
    }
    logger.info('')
  }
  logger.info(pc.bold('Next steps:'))
  for (const s of report.nextSteps) logger.info(`  - ${s}`)
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
