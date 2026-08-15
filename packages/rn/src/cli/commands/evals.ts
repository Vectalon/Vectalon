/**
 * vectalon evals — Model Evaluation Harness (Roadmap Phase 11, item 095)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Scores golden eval cases deterministically. Reports to
 * docs/vectalon/evals/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runEvalsCommand, writeEvalsReport } from '../../evals'

export interface EvalsCommandOptions {
  /** Path to the cases file (default .vectalon/evals/cases.json). */
  cases?: string
  /** Print machine-readable output. */
  json?: boolean
}

export async function evalsCommand(directory: string, options: EvalsCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runEvalsCommand(root, { cases: options.cases })
  const { jsonPath } = writeEvalsReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon evals — Model Evaluation Harness (095)'))
  logger.info(`project: ${root}`)
  logger.info(`source: ${report.source}`)
  logger.info('')
  const r = report.regression
  logger.info(
    `Cases: ${report.cases.length} | pass: ${pc.green(String(report.passed))}/${report.cases.length} (${report.passRate}%) | verdict: ${report.verdict === 'approved' ? pc.green(report.verdict) : pc.yellow(report.verdict)}${r.delta !== null ? pc.dim(` | Δ ${r.delta >= 0 ? '+' : ''}${r.delta}pt vs previous`) : ''}`,
  )
  logger.info('')
  for (const c of report.cases) {
    logger.info(`  ${c.passed ? pc.green('✓') : pc.red('✗')} ${c.id.padEnd(24)} [${c.mode}] ${c.note}`)
  }
  logger.info('')
  for (const f of report.findings.filter(x => x.severity === 'warning')) {
    logger.info(`  ${pc.yellow('▲')} [${f.severity}] ${f.id} — ${f.message}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
