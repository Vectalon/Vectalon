/**
 * vectalon release-ready — Release Readiness Agent (Roadmap Phase 8, item 069)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Answers "can we ship?" with one deterministic checklist: version bumped,
 * CHANGELOG section present, clean tree, CI workflows, lockfile, tests,
 * secrets hygiene, and TODO/FIXME triage. Only read-only git commands run.
 * Reports to docs/vectalon/release-ready/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runReleaseReady, writeReleaseReadyReport } from '../../releaseReady'

export interface ReleaseReadyCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function releaseReadyCommand(directory: string, options: ReleaseReadyCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  const report = await runReleaseReady(root)
  const { jsonPath } = writeReleaseReadyReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon release-ready — Release Readiness Agent (069)'))
  logger.info(`project: ${root}`)
  logger.info('')

  const verdictColor = report.verdict === 'approved'
    ? pc.green
    : report.verdict === 'needs-attention'
      ? pc.yellow
      : pc.red
  logger.info(`Verdict: ${verdictColor(report.verdict)}`)
  logger.info(`Version: ${report.version || '(none)'} | Last tag: ${report.lastTag || '(none)'}`)
  logger.info(`Checks: ${report.summary.total} (${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  logger.info('')

  for (const c of report.checks) {
    const icon = c.severity === 'error' ? pc.red('✖') : c.severity === 'warning' ? pc.yellow('▲') : pc.dim('✓')
    logger.info(`  ${icon} [${c.severity}] ${c.title}`)
    logger.info(`    ${c.message}${c.fix ? pc.dim(` — ${c.fix}`) : ''}`)
  }
  logger.info('')

  for (const line of report.summary.topRecommendations) {
    logger.info(`→ ${line}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
  if (report.verdict === 'approved') {
    logger.success('Release ready — ship it.')
  } else {
    logger.warn('Not ready — address the errors and warnings above.')
  }
}
