/**
 * vectalon arch-score — Mobile Architecture Scorecard (Roadmap Phase 9,
 * item 072) — Business Source License 1.1 (BSL-1.1)
 *
 * Scores the module graph 0-100 across cycles, layering, coupling,
 * cohesion, testability, and depth. Reports to docs/vectalon/arch-score/
 * (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runArchScore, writeArchScoreReport } from '../../archScore'
import type { ArchScoreOptions } from '../../archScore'

export interface ArchScoreCommandOptions extends ArchScoreOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function archScoreCommand(directory: string, options: ArchScoreCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runArchScore(root, { srcDir: options.srcDir })
  const { jsonPath } = writeArchScoreReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon arch-score — Mobile Architecture Scorecard (072)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const color = report.total >= 85 ? pc.green : report.total >= 70 ? pc.yellow : pc.red
  logger.info(`Score: ${color(`${report.total}/100 (grade ${report.grade})`)} — ${report.verdict}`)
  logger.info('')
  for (const d of report.dimensions) {
    const c = d.score >= 85 ? pc.green : d.score >= 60 ? pc.yellow : pc.red
    logger.info(`  ${c(String(d.score).padStart(3))}  ${d.label.padEnd(18)} ${pc.dim(d.detail)}`)
  }
  logger.info('')
  logger.info(pc.bold('Top improvements:'))
  for (const i of report.topImprovements) logger.info(`  → ${i}`)
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
