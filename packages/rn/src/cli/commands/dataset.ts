/**
 * vectalon dataset — Fine-tuning Dataset Agent (Roadmap Phase 10, item 088)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Validates a fine-tuning JSONL dataset: schema, duplicates, balance, PII.
 * Reports to docs/vectalon/dataset/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runDatasetScan, writeDatasetReport } from '../../dataset'

export interface DatasetCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function datasetCommand(directory: string, options: DatasetCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runDatasetScan(root)
  const { jsonPath } = writeDatasetReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon dataset — Fine-tuning Dataset Agent (088)'))
  logger.info(`project: ${root}`)
  logger.info('')
  const verdictColor = report.verdict === 'approved' ? pc.green : pc.yellow
  logger.info(`Verdict: ${verdictColor(report.verdict)} | examples: ${report.stats.entries} | files: ${report.stats.files}`)
  logger.info('')
  if (report.stats.entries > 0) {
    logger.info(`  ${pc.dim('median length')} ${report.stats.medianLength} chars  ·  ${pc.dim('max')} ${report.stats.maxLength}  ·  ${pc.dim('duplicates')} ${report.stats.duplicates}`)
  }
  for (const f of report.findings.slice(0, 15)) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : pc.dim('•')
    logger.info(`  ${icon} [${f.severity}] ${f.id}${f.line !== undefined ? ` (line ${f.line})` : ''}`)
    logger.info(`    ${f.message}`)
  }
  logger.info('')
  logger.info(`Report: ${pc.dim(jsonPath)}`)
}
