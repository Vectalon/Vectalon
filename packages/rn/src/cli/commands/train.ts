/**
 * vectalon train — Release Train Automation (Roadmap Phase 11, item 098)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Dry-run release planning across the workspace. Read-only — nothing is
 * modified. Reports to docs/vectalon/train/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runTrain, writeTrainReport } from '../../train'

export interface TrainCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function trainCommand(directory: string, options: TrainCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runTrain(root)
  const { jsonPath } = writeTrainReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon train — Release Train (098, dry-run)'))
  logger.info(`project: ${root}`)
  logger.info('')
  logger.info(`Repos: ${report.repos.length} | verdict: ${report.verdict === 'approved' ? pc.green(report.verdict) : pc.yellow(report.verdict)} | read-only: nothing was modified`)
  logger.info('')
  for (const r of report.repos) {
    const bump = r.suggestedBump === 'none' ? pc.dim('none') : pc.bold(r.suggestedBump)
    logger.info(pc.bold(r.name))
    logger.info(
      `  version: ${r.version ?? pc.dim('—')} | last tag: ${r.lastTag ?? pc.dim('—')} | bump: ${bump} | changelog: ${r.changelogSection ? pc.green('✓') : pc.red('✗')} | clean: ${r.dirty ? pc.red('✗') : pc.green('✓')}`,
    )
    for (const c of r.checks) {
      logger.info(`    ${c.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')} ${c.message}`)
    }
  }
  logger.info('')
  for (const f of report.findings) {
    logger.info(`  ${pc.yellow('▲')} [${f.severity}] ${f.id} (${f.repo}) — ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
