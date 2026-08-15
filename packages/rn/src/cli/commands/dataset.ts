/**
 * vectalon dataset — Fine-tuning Dataset Agent (Roadmap Phase 10, item 088)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Validates a fine-tuning JSONL dataset: schema, duplicates, balance, PII.
 * Reports to docs/vectalon/dataset/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, dim } from '../carbon'
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

  const body: string[] = []
  body.push(`examples: ${report.stats.entries} | files: ${report.stats.files}`)
  body.push('')
  if (report.stats.entries > 0) {
    body.push(`  ${dim('median length')} ${report.stats.medianLength} chars  ·  ${dim('max')} ${report.stats.maxLength}  ·  ${dim('duplicates')} ${report.stats.duplicates}`)
  }
  for (const f of report.findings.slice(0, 15)) {
    const icon = f.severity === 'warning' ? pc.yellow('▲') : dim('•')
    body.push(`  ${icon} [${f.severity}] ${f.id}${f.line !== undefined ? ` (line ${f.line})` : ''}`)
    body.push(`    ${f.message}`)
  }

  printCarbonReport({
    title: 'vectalon dataset — Fine-tuning Dataset Agent (088)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
