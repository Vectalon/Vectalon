/**
 * vectalon deps — Dependency Upgrade Agent (Roadmap Phase 8, item 067)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Finds what to upgrade and the safe path: RN ecosystem pairing violations,
 * duplicate versions across workspace members, and vulnerable dependencies
 * via best-effort npm audit. Reports to docs/vectalon/deps/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runDepsScan, writeDepsReport } from '../../deps'
import type { DepOptions } from '../../deps'

export interface DepsCommandOptions extends DepOptions {
  /** Print machine-readable output. */
  json?: boolean
  /** Set by commander for `--no-audit` (true when the flag is absent). */
  audit?: boolean
}

export async function depsCommand(directory: string, options: DepsCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  const reviewOptions: DepOptions = { ...options, skipAudit: options.audit === false }
  const report = await runDepsScan(root, reviewOptions)
  const { jsonPath } = writeDepsReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon deps — Dependency Upgrade Agent (067)'))
  logger.info(`project: ${root}`)
  logger.info('')

  const verdictColor = report.verdict === 'approved'
    ? pc.green
    : report.verdict === 'needs-attention'
      ? pc.yellow
      : pc.red
  logger.info(`Verdict: ${verdictColor(report.verdict)}`)
  logger.info(`Dependencies: ${report.depCount}`)
  logger.info(`Findings: ${report.summary.total} (${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  logger.info('')

  if (!report.audit.ran) {
    logger.info(`${pc.dim('Dependency audit:')} skipped — ${report.audit.skippedReason ?? 'not run'}`)
  } else {
    logger.info(`${pc.dim('Dependency audit:')} ${report.audit.total} advisory(ies) — ${report.audit.critical} critical, ${report.audit.high} high`)
  }
  logger.info('')

  if (report.findings.length === 0) {
    logger.info('No dependency issues found — the tree is aligned and clean.')
  }
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id} — ${f.package} (${f.current})`)
    logger.info(`    ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  logger.info('')

  for (const line of report.summary.topRecommendations) {
    logger.info(`→ ${line}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
  logger.success('Dependency scan complete — apply the upgrade paths one at a time, then re-run.')
}
