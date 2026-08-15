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
import { printCarbonReport, renderCarbonWindow, parchment, dim } from '../carbon'
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
    logger.info(renderCarbonWindow({
      title: 'vectalon crash — Crash Intelligence Agent (071)',
      lines: [
        'No crash log provided.',
        dim('Pass --log <path> to an iOS/Android/JS crash log — the platform is auto-detected.'),
        dim('Or force it: --platform ios / android / javascript'),
      ],
    }))
    return
  }
  const report = runCrashAnalysis(log, { platform: options.platform })
  const { jsonPath } = writeCrashReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`platform: ${report.platform}`)
  if (report.exceptionType) body.push(`exception: ${dim(report.exceptionType)}`)
  if (report.message) body.push(`message: ${dim(report.message)}`)
  body.push('')
  body.push(pc.bold(`Root cause: ${report.finding.bucket}`))
  body.push(parchment(report.finding.probableCause))
  body.push('')
  body.push(pc.bold('Standard fix:'))
  body.push(`  ${report.finding.fix}`)
  body.push('')
  body.push(pc.bold('Investigation:'))
  for (const s of report.finding.investigation.slice(0, 5)) body.push(`  - ${parchment(s)}`)

  printCarbonReport({
    title: 'vectalon crash — Crash Intelligence Agent (071)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
