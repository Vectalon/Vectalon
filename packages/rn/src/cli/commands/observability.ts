/**
 * vectalon observability — Mobile Observability Agent (Roadmap Phase 10, item 082)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Audits instrumentation coverage and slow traces. Reports to
 * docs/vectalon/observability/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runObsScan, writeObsReport } from '../../observability'

export interface ObsCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function observabilityCommand(directory: string, options: ObsCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runObsScan(root)
  const { jsonPath } = writeObsReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon observability — Mobile Observability Agent (082)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const verdictColor = report.verdict === 'approved' ? pc.green : pc.yellow
  logger.info(`Verdict: ${verdictColor(report.verdict)} | traces: ${report.tracesScanned} | slow: ${report.slowTraces.length}`)
  logger.info('')
  for (const f of report.findings.slice(0, 15)) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id}`)
    logger.info(`    ${f.message}`)
  }
  for (const s of report.slowTraces.slice(0, 5)) {
    logger.info(`  ${pc.yellow('▲')} slow trace: ${s.name} — ${s.durationMs} ms${s.release ? ` (${s.release})` : ''}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
