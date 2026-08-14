/**
 * vectalon crash — Crash Intelligence Agent (Roadmap Phase 9, item 071)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Classifies an iOS/Android/JS crash log into a root cause with the
 * standard fix. Reports to docs/vectalon/crash/ (gitignored).
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runCrashAnalysis, writeCrashReport } from '../../crash'
import type { CrashOptions } from '../../crash'

export interface CrashCommandOptions extends CrashOptions {
  /** Path to the crash log to classify. */
  log: string
  /** Print machine-readable output. */
  json?: boolean
}

export async function crashCommand(directory: string, options: CrashCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  let log: string
  try {
    log = readFileSync(resolve(options.log), 'utf-8')
  } catch {
    logger.info(pc.bold('vectalon crash — Crash Intelligence Agent (071)'))
    logger.info('No crash log provided.')
    logger.info(pc.dim('Pass --log <path> to an iOS/Android/JS crash log — the platform is auto-detected.'))
    logger.info(pc.dim('Or force it: --platform ios / android / javascript'))
    return
  }
  const report = runCrashAnalysis(log, { platform: options.platform })
  const { jsonPath } = writeCrashReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon crash — Crash Intelligence Agent (071)'))
  logger.info(`platform: ${report.platform} | verdict: ${report.verdict === 'changes-requested' ? pc.red(report.verdict) : pc.yellow(report.verdict)}`)
  if (report.exceptionType) logger.info(`exception: ${pc.dim(report.exceptionType)}`)
  if (report.message) logger.info(`message: ${pc.dim(report.message)}`)
  logger.info('')
  logger.info(pc.bold(`Root cause: ${report.finding.bucket}`))
  logger.info(report.finding.probableCause)
  logger.info('')
  logger.info(pc.bold('Standard fix:'))
  logger.info(`  ${report.finding.fix}`)
  logger.info('')
  logger.info(pc.bold('Investigation:'))
  for (const s of report.finding.investigation.slice(0, 5)) logger.info(`  - ${s}`)
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
