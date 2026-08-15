/**
 * vectalon lora — LoRA Training Readiness Agent (Roadmap Phase 10, item 089)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Checks LoRA training prerequisites: config, dataset, VRAM estimate.
 * Reports to docs/vectalon/lora/ (gitignored).
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport } from '../carbon'
import { runLoraScan, writeLoraReport } from '../../lora'

export interface LoraCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
  /** Path to the LoRA config (default .vectalon/lora/config.json). */
  config?: string
}

export async function loraCommand(directory: string, options: LoraCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const report = runLoraScan(root, options.config)
  const { jsonPath } = writeLoraReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`checks: ${report.checks.length}`)
  body.push('')
  for (const c of report.checks) {
    const mark = c.status === 'pass' ? pc.green('✔') : c.status === 'warn' ? pc.yellow('▲') : pc.red('✖')
    body.push(`  ${mark} ${c.label.padEnd(20)} ${c.message}`)
  }

  printCarbonReport({
    title: 'vectalon lora — LoRA Training Readiness Agent (089)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
  })
}
