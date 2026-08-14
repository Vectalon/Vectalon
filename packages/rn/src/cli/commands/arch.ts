/**
 * vectalon arch — Architecture Review Agent (Roadmap Phase 8, item 062)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Reviews a project's architecture in one deterministic pass: module
 * boundaries and coupling metrics, circular dependencies, layering
 * violations, god modules, wide fan-in, orphans, and deep nesting — with a
 * verdict and severity-ranked recommendations. Reports to
 * docs/vectalon/arch/ (gitignored) with --json output.
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runArchReview, renderArchMarkdown, writeArchReport } from '../../arch'
import type { ArchOptions } from '../../arch'

export interface ArchCommandOptions extends ArchOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function archCommand(directory: string, options: ArchCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  const report = runArchReview(root, options)
  const { jsonPath } = writeArchReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon arch — Architecture Review Agent (062)'))
  logger.info(`project: ${root}`)
  logger.info('')

  const verdictColor = report.verdict === 'approved'
    ? pc.green
    : report.verdict === 'needs-attention'
      ? pc.yellow
      : pc.red
  logger.info(`Verdict: ${verdictColor(report.verdict)}`)
  logger.info(`Files: ${report.fileCount} in ${report.srcDir}/ | Modules: ${report.modules.length}`)
  logger.info(`Findings: ${report.summary.total} (${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  logger.info('')

  if (report.modules.length > 0) {
    logger.info(pc.bold('Modules'))
    for (const m of report.modules) {
      logger.info(`  ${pc.bold(m.path)}  ${pc.dim(`${m.files} file(s), fan-in ${m.fanIn}, fan-out ${m.fanOut}`)}`)
    }
    logger.info('')
  }

  if (report.findings.length === 0) {
    logger.info('No architecture issues found — the module graph is clean.')
  }
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id} — ${f.file || f.module}`)
    logger.info(`    ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  logger.info('')

  for (const line of report.summary.topRecommendations) {
    logger.info(`→ ${line}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
  logger.success('Architecture review complete — address the findings before the debt compounds.')
}
