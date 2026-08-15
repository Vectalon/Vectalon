/**
 * vectalon repos — Multi-repository Memory Agent (Roadmap Phase 10, item 085)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Verifies the workspace manifest against local sibling checkouts. Reports
 * to docs/vectalon/repos/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runReposScan, writeReposReport } from '../../repos'

export interface ReposCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function reposCommand(directory: string, options: ReposCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runReposScan(root)
  const { jsonPath } = writeReposReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon repos — Multi-repository Memory Agent (085)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const verdictColor = report.verdict === 'approved' ? pc.green : pc.yellow
  logger.info(`Verdict: ${verdictColor(report.verdict)} | manifest: ${report.manifestFile ?? 'none'} | repos: ${report.repoCount}`)
  logger.info('')
  for (const c of report.checks) {
    const mark = c.status === 'ok' ? pc.green('✔') : c.status === 'no-memory' ? pc.yellow('▲') : pc.red('✖')
    logger.info(`  ${mark} ${c.name.padEnd(24)} ${c.path} — ${c.evidence}`)
  }
  for (const f of report.findings.slice(0, 15)) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id} ${f.repo ? `— ${f.repo}` : ''}`)
    logger.info(`    ${f.message}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
