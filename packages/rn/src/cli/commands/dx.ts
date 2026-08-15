/**
 * vectalon dx — DX Scoring Agent (Roadmap Phase 11, item 100)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One developer-experience score from local evidence. Reports to
 * docs/vectalon/dx/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runDx, writeDxReport } from '../../dx'

export interface DxCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function dxCommand(directory: string, options: DxCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runDx(root)
  const { jsonPath } = writeDxReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon dx — Developer Experience Score (100)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const gradeColor = report.grade === 'A' ? pc.green : report.grade === 'B' ? pc.cyan : report.grade === 'C' ? pc.yellow : pc.red
  logger.info(`Score: ${pc.bold(String(report.score) + '/100')} ${gradeColor(`(${report.grade})`)} | verdict: ${report.verdict === 'approved' ? pc.green(report.verdict) : pc.yellow(report.verdict)}`)
  logger.info('')
  for (const a of report.axes) {
    const bar = '█'.repeat(Math.round(a.score / 10)).padEnd(10, '░')
    const color = a.score >= 70 ? pc.green : a.score >= 40 ? pc.yellow : pc.red
    logger.info(`  ${color(bar)} ${String(a.score).padStart(3)}  ${a.label.padEnd(20)} ${pc.dim(a.note)}`)
  }
  logger.info('')
  logger.info(pc.bold('Top improvements:'))
  for (const i of report.improvements) {
    logger.info(`  +${i.gain}pts  ${i.label}: ${i.action}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
