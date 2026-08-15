/**
 * vectalon figma — Figma-to-code Sync Agent (Roadmap Phase 10, item 080)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Checks design↔code drift against a Figma JSON export. Reports to
 * docs/vectalon/figma/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runFigmaSync, writeFigmaReport } from '../../figma'

export interface FigmaCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function figmaCommand(directory: string, options: FigmaCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runFigmaSync(root)
  const { jsonPath } = writeFigmaReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon figma — Figma-to-code Sync Agent (080)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const verdictColor = report.verdict === 'approved' ? pc.green : pc.yellow
  logger.info(`Verdict: ${verdictColor(report.verdict)} | colors: ${report.colors.length} | components: ${report.components.length} | file: ${report.designFile ?? 'none'}`)
  logger.info('')
  if (report.findings.length === 0) logger.info('No design↔code drift detected.')
  for (const f of report.findings.slice(0, 15)) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id} ${f.designName ? `— ${f.designName}` : ''}`)
    logger.info(`    ${f.message}`)
    logger.info(`    ${pc.dim(f.suggestion)}`)
  }
  if (report.findings.length > 15) logger.info(pc.dim(`  … and ${report.findings.length - 15} more`))
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
