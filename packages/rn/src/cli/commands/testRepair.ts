/**
 * vectalon test-repair — Test Repair Agent (Roadmap Phase 8, item 065)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Diagnoses a failing Jest, Detox, or Maestro test run from its output log:
 * the kind is auto-detected (or forced), the root cause is classified with
 * the standard fix, and corroborating failures are listed — as a fix plan.
 * Reports to docs/vectalon/test-repair/ (gitignored) with --json output.
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { runTestRepair, writeTestRepairReport } from '../../testRepair'
import type { TestRepairOptions, TestKind } from '../../testRepair'

export interface TestRepairCommandOptions extends TestRepairOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export async function testRepairCommand(directory: string, options: TestRepairCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  const report = runTestRepair(root, options)
  const { jsonPath } = writeTestRepairReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  if (report.detection === 'none') {
    printCarbonReport({
      title: 'vectalon test-repair — Test Repair Agent (065)',
      verdict: report.verdict,
      lines: [
        'No test log provided.',
        dim('Pass --log <path> to a failing Jest/Detox/Maestro log — the kind is auto-detected.'),
        dim('Or force it: --jest / --detox / --maestro'),
      ],
      reportPath: jsonPath,
      root,
    })
    return
  }

  const body: string[] = []
  body.push(`Test framework: ${pc.bold(report.kind)} (${report.detection === 'forced' ? 'forced' : 'auto-detected'})`)
  body.push(`Findings: ${report.summary.total} (${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s))`)
  body.push('')

  for (const f of report.findings) {
    const icon = f.severity === 'error' ? pc.red('✖') : pc.yellow('▲')
    const loc = f.line ? ` (log line ${f.line})` : ''
    body.push(`  ${icon} [${f.severity}] ${f.id}${loc}`)
    body.push(`    ${parchment(f.message)}`)
    body.push(`    ${dim(f.fix)}`)
  }
  body.push('')
  body.push(pc.bold('Fix plan'))
  report.summary.fixPlan.forEach((step, i) => body.push(`  ${i + 1}. ${step}`))

  printCarbonReport({
    title: 'vectalon test-repair — Test Repair Agent (065)',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
    done: 'Test fix diagnosis complete — apply the fix plan and re-run the suite.',
  })
}

/** Parse --jest/--detox/--maestro into a forced kind (undefined when absent). */
export function forcedKind(flags: { jest?: boolean; detox?: boolean; maestro?: boolean }): TestKind | undefined {
  if (flags.jest) return 'jest'
  if (flags.detox) return 'detox'
  if (flags.maestro) return 'maestro'
  return undefined
}
