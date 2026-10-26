/**
 * vc outcomes — engineering outcomes, not feature counts.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Reads local report evidence and labels the fixed-hour cost model as an
 * illustrative estimate, not measured customer savings.
 */
import { resolve, join } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import {
  collectOutcomes,
  hoursSaved,
  savingsEstimate,
  blendedRate,
  OUTCOME_HOURS,
  EMPTY_COUNTS,
} from '../../outcomes/ledger'
import type { OutcomeCounts } from '../../outcomes/ledger'

export interface OutcomesCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
  /** Blended rate override ($/hour) for the savings estimate. */
  rate?: string
}

/** User-facing labels must not turn findings or plans into verified outcomes. */
export function renderOutcomeLines(counts: OutcomeCounts, hours: number, savings: number, rate: number): string[] {
  const lines: string[] = []
  lines.push(`  ${pc.bold(counts.issuesDetected)} scan findings`)
  lines.push(`  ${pc.bold(counts.prIssuesCaught)} PR review findings`)
  lines.push(`  ${pc.bold(counts.buildFailuresDiagnosed)} build-log findings`)
  lines.push(`  ${pc.bold(counts.buildFailuresFixed)} real-tree fixes with passing available checks (build recovery unverified)`)
  lines.push(`  ${pc.bold(counts.rnUpgradesCompleted)} RN upgrade provenance records`)
  lines.push(`  ${pc.bold(counts.testsGenerated)} test files generated`)
  lines.push(`  ${pc.bold(counts.perfRegressionsDetected)} performance findings`)
  lines.push('')
  lines.push(`  ${parchment('Illustrative effort-equivalent, not measured savings:')} ${pc.bold(pc.green(`$${savings.toLocaleString()}`))}`)
  lines.push(`  ${dim(`${hours.toFixed(1)} assumed developer-hours at $${rate}/hr blended rate`)}`)
  return lines
}

export async function outcomesCommand(options: OutcomesCommandOptions): Promise<void> {
  const root = resolve(process.cwd())
  const counts = collectOutcomes(root)
  const rate = options.rate ? Number(options.rate) : blendedRate()
  const hours = hoursSaved(counts)
  const savings = savingsEstimate(counts, rate)

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          counts,
          hoursSaved: Number(hours.toFixed(2)),
          savingsUsd: savings,
          estimateOnly: true,
          blendedRateUsd: rate,
          perOutcomeHours: OUTCOME_HOURS,
        },
        null,
        2
      ) + '\n'
    )
    return
  }

  const body = renderOutcomeLines(counts, hours, savings, rate)
  const isZero = hours === 0
  printCarbonReport({
    title: 'vectalon outcomes — engineering outcomes, not feature counts',
    verdict: isZero ? 'info' : 'approved',
    lines: body,
    reportPath: join(root, 'docs', 'vectalon', 'outcomes', 'report.txt'),
    root,
    done: isZero
      ? 'No report-derived outcomes yet — run an agent and re-run vc outcomes. This ledger reads local reports, whether committed or not.'
      : `Ledger derived from local reports under docs/vectalon/ + .vectalon/upgrades/ — counts are observations; savings are assumed, not measured.`,
  })
}

export { EMPTY_COUNTS }
