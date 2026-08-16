/**
 * vc init — the 15-minute proof of value.
 * Business Source License 1.1 (BSL-1.1)
 *
 * The commercial experience: `npx @vectalon-dev/rn init` ends with the
 * payoff — "Scanning React Native project…" counts (files, components,
 * screens, native modules, dependencies, navigation stacks, tests,
 * architecture risks), the Vectalon Health Score, and the Top 5 problems
 * Vectalon found, each with its P0/P1/P2 severity. Zero model calls, zero
 * configuration asked of the user — the model router's local auto-select
 * runs silently underneath.
 */
import pc from 'picocolors'
import { renderCarbonWindow, parchment, dim } from '../cli/carbon'
import { collectSourceAndTests } from './index'
import type { ScoreReport } from './types'
import type { IntelReport } from '../intel/types'

/** The scan-summary counts the mock shows ("✓ 1,842 files · 127 components …"). */
export interface PovCounts {
  files: number
  components: number
  screens: number
  nativeModules: number
  dependencies: number
  navigationStacks: number
  tests: number
  architectureRisks: number
}

/** Derive the counts from the shared intel report + a light test walk. */
export function buildPovCounts(root: string, intel: IntelReport | null, score: ScoreReport): PovCounts {
  const { testFiles } = collectSourceAndTests(root)
  let components = 0
  let screens = 0
  let nativeModules = 0
  let dependencies = 0
  let navigationStacks = 0
  let files = 0
  if (intel) {
    components = intel.knowledge.components.length
    screens = new Set([
      ...intel.navigation.navigators.flatMap(n => n.screens.map(s => `${n.name}:${s.name}`)),
      ...intel.navigation.expoRoutes.map(r => r.route),
    ]).size
    nativeModules = intel.nativeRegistry.entries.length
    dependencies = Object.keys(intel.manifest.dependencies ?? {}).length
    navigationStacks = intel.navigation.navigators.length
    files = intel.index.scanned
  }
  // Architecture risks: the arch-score findings (cycles + layering) — the
  // deterministic evidence the score aggregated.
  const archDim = score.dimensions.find(d => d.id === 'architecture')
  const architectureRisks = archDim ? archDim.findings.length : 0
  return { files, components, screens, nativeModules, dependencies, navigationStacks, tests: testFiles.length, architectureRisks }
}

/** The "Scanning React Native project…" block — the mock's ✓ lines. */
export function renderScanSummary(counts: PovCounts): string[] {
  const lines: string[] = []
  lines.push(parchment('Scanning React Native project…'))
  lines.push('')
  const rows: Array<[number, string]> = [
    [counts.files, 'files'],
    [counts.components, 'components'],
    [counts.screens, 'screens'],
    [counts.nativeModules, 'native modules'],
    [counts.dependencies, 'dependencies'],
    [counts.navigationStacks, 'navigation stack' + (counts.navigationStacks === 1 ? '' : 's')],
    [counts.tests, 'tests'],
  ]
  for (const [n, label] of rows) {
    lines.push(`  ${pc.green('✓')} ${String(n).padStart(5)} ${label}`)
  }
  lines.push(`  ${counts.architectureRisks > 0 ? pc.yellow('!') : pc.green('✓')} ${String(counts.architectureRisks).padStart(5)} architecture risk${counts.architectureRisks === 1 ? '' : 's'}`)
  return lines
}

/** The "Top 5 problems" block with severity dots. */
function renderTopProblems(score: ScoreReport, top = 5): string[] {
  const lines: string[] = []
  const dot: Record<string, string> = { P0: pc.red('●'), P1: pc.yellow('●'), P2: pc.dim('○') }
  const recs = score.recommendations.slice(0, top)
  if (recs.length === 0) {
    lines.push(parchment('No problems found — the project is in great shape.'))
    return lines
  }
  lines.push(pc.bold('Top problems Vectalon found:'))
  lines.push('')
  recs.forEach((r, i) => {
    lines.push(`  ${i + 1}. ${dot[r.priority]} ${r.message}`)
  })
  return lines
}

/** The full proof-of-value window: scan summary + score + top problems. */
export function renderPovWindow(root: string, score: ScoreReport, intel: IntelReport | null): string {
  const counts = buildPovCounts(root, intel, score)
  const overall = score.overall
  const color = overall >= 85 ? pc.green : overall >= 60 ? pc.yellow : pc.red
  const body: string[] = []
  body.push(...renderScanSummary(counts))
  body.push('')
  body.push(`${parchment('Vectalon Health Score:')} ${pc.bold(color(String(overall) + '/100'))}  ${dim(`grade ${score.grade} · ${score.historyNote}`)}`)
  body.push('')
  body.push(...renderTopProblems(score))
  if (score.recommendations.length > 5) {
    body.push(`  ${dim(`… and ${score.recommendations.length - 5} more — run \`vc score\` for the full scorecard.`)}`)
  }
  return renderCarbonWindow({
    title: 'vectalon init — proof of value',
    verdict: score.verdict,
    lines: body,
    footer: 'zero model calls · no configuration required',
  })
}
