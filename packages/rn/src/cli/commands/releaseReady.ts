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
import { printCarbonReport, parchment, dim } from '../carbon'
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

  const body: string[] = []
  body.push(`Version: ${report.version || '(none)'} | Last tag: ${report.lastTag || '(none)'}`)
  body.push(`Checks: ${report.summary.total} (${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  body.push('')

  for (const c of report.checks) {
    const icon = c.severity === 'error' ? pc.red('✖') : c.severity === 'warning' ? pc.yellow('▲') : dim('✓')
    body.push(`  ${icon} [${c.severity}] ${c.title}`)
    body.push(`    ${parchment(c.message)}${c.fix ? dim(` — ${c.fix}`) : ''}`)
  }
  body.push('')

  for (const line of report.summary.topRecommendations) {
    body.push(`→ ${line}`)
  }

  printCarbonReport({
    title: 'vectalon release-ready — Release Readiness Agent (069)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
  if (report.verdict === 'approved') {
    logger.success('Release ready — ship it.')
  } else {
    logger.warn('Not ready — address the errors and warnings above.')
  }
}
