/**
 * vectalon release-predict — Release Prediction Agent (Roadmap Phase 10, item 086)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Derives a release-risk score from git history. Reports to
 * docs/vectalon/release-predict/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runReleasePredict, writePredictReport } from '../../releasePredict'

export interface ReleasePredictCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function releasePredictCommand(directory: string, options: ReleasePredictCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runReleasePredict(root)
  const { jsonPath } = writePredictReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon release-predict — Release Prediction Agent (086)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const riskColor = report.risk === 'low' ? pc.green : report.risk === 'moderate' ? pc.yellow : report.risk === 'high' ? pc.red : pc.bgRed
  logger.info(`Risk: ${riskColor(report.risk)} | score: ${report.score}/100 | window: ${report.windowDays}d (${report.windowCommits} commits)`)
  logger.info('')
  logger.info(report.riskDescription)
  logger.info('')
  for (const f of report.factors) {
    logger.info(`  ${pc.dim(f.name.padEnd(26))} ${String(f.value).padStart(6)}  (${f.goodDirection === 'lower' ? 'lower = safer' : 'higher = safer'})`)
  }
  for (const f of report.findings) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id}`)
    logger.info(`    ${f.message}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
