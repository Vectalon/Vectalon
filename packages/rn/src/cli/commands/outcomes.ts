/**
 * vc outcomes — engineering outcomes, not feature counts.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Directive #10: the sales material is outcomes. Aggregates every committed
 * deterministic report into the ledger an EM actually reads — issues
 * detected, automatically fixed, PRs reviewed, build failures resolved, hours
 * saved on RN upgrade, regressions prevented — and the estimated engineering
 * savings in dollars.
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

/** The ledger lines — one per outcome the directive names, Acme-style. */
export function renderOutcomeLines(counts: OutcomeCounts, hours: number, savings: number, rate: number): string[] {
  const lines: string[] = []
  lines.push(`  ${pc.bold(counts.issuesDetected)} issues detected`)
  lines.push(`  ${pc.bold(counts.buildFailuresFixed + counts.issuesPrevented)} automatically fixed or prevented`)
  lines.push(`  ${pc.bold(counts.prIssuesCaught)} issues caught in PR review`)
  lines.push(`  ${pc.bold(counts.buildFailuresDiagnosed)} build failures diagnosed`)
  lines.push(`  ${pc.bold(counts.buildFailuresFixed)} build failures resolved`)
  lines.push(`  ${pc.bold(counts.rnUpgradesCompleted)} RN upgrades completed`)
  lines.push(`  ${pc.bold(counts.testsGenerated)} tests generated`)
  lines.push(`  ${pc.bold(counts.perfRegressionsDetected)} performance regressions detected`)
  lines.push(`  ${pc.bold(counts.issuesPrevented)} regressions prevented`)
  lines.push('')
  lines.push(`  ${parchment('Estimated engineering savings:')} ${pc.bold(pc.green(`$${savings.toLocaleString()}`))}`)
  lines.push(`  ${dim(`${hours.toFixed(1)} developer-hours at $${rate}/hr blended rate`)}`)
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
      ? 'No outcome reports yet — run the deterministic agents (fix, review, build-fix, score, sec, upgrade) and re-run vc outcomes. The ledger only counts committed reports.'
      : `Ledger derived from committed reports under docs/vectalon/ + .vectalon/upgrades/ — zero model calls, fully deterministic.`,
  })
}

export { EMPTY_COUNTS }
