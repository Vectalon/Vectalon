/**
 * vc score — the Vectalon Engineering Health Score.
 * Business Source License 1.1 (BSL-1.1)
 *
 * One number an engineering manager immediately understands: overall 0-100
 * from eight deterministic dimensions (Architecture, Dependencies, Build
 * Health, Testing, Performance, Security, Accessibility, RN Upgrade Risk),
 * the delta vs the previous run, the newly-arrived problems, and P0/P1/P2
 * recommended actions. Reports to docs/vectalon/score/.
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim, visibleWidth } from '../carbon'
import { runScore, writeScoreReport, renderTrendChart } from '../../score'
import type { ScoreOptions, ScoreReport } from '../../score'

export interface ScoreCommandOptions extends ScoreOptions {
  /** Print machine-readable output. */
  json?: boolean
}

function bar(score: number, width: number): string {
  const filled = Math.round((score / 100) * width)
  const empty = Math.max(0, width - filled)
  const color = score >= 85 ? pc.green : score >= 60 ? pc.yellow : pc.red
  return color('█'.repeat(filled) + '░'.repeat(empty))
}

/** Render the scorecard body — one line per dimension with a bar. */
export function renderScoreBody(report: ScoreReport): string[] {
  const lines: string[] = []
  const maxLabel = Math.max(...report.dimensions.map(d => visibleWidth(d.label)))
  for (const d of report.dimensions) {
    const label = d.label.padEnd(maxLabel)
    const num = String(d.score).padStart(3)
    const color = d.score >= 85 ? pc.green : d.score >= 60 ? pc.yellow : pc.red
    lines.push(`  ${parchment(label)} ${color(num)} ${bar(d.score, 24)}  ${dim(d.detail)}`)
  }
  return lines
}

export async function scoreCommand(options: ScoreCommandOptions): Promise<void> {
  const root = resolve(process.cwd())
  const report = await runScore(root, options)
  const { jsonPath } = writeScoreReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const body: string[] = []
  // Headline — "Current: 86 · +9 this month".
  const overall = report.overall
  const overallColor = overall >= 85 ? pc.green : overall >= 60 ? pc.yellow : pc.red
  let headline = `  ${parchment('Current')}  ${pc.bold(overallColor(String(overall) + '/100'))}  ${bar(overall, 30)}  ${dim(`grade ${report.grade}`)}`
  if (report.monthDelta !== null) {
    const m = report.monthDelta
    const chip = m > 0 ? pc.green(`+${m} this month`) : m < 0 ? pc.red(`${m} this month`) : dim('0 this month')
    headline += `  ${chip}`
  }
  body.push(headline)
  // Run-to-run delta — the "↓ 8 points this week" line.
  if (report.delta !== null) {
    const arrow = report.delta >= 0 ? pc.green('↑') : pc.red('↓')
    body.push(`  ${arrow} ${Math.abs(report.delta)} points ${dim(report.historyNote)}`)
  } else {
    body.push(`  ${dim(report.historyNote)}`)
  }
  // The trend — "make the score change over time".
  if (report.trend.length >= 2) {
    body.push('')
    body.push(`  ${parchment('Overall trend — last ' + report.trend.length + ' runs')}  ${dim('run vc score to add a point')}`)
    body.push(...renderTrendChart(report.trend).map(l => `  ${l}`))
  } else {
    body.push(`  ${dim(report.monthNote)}`)
  }
  // Dimension deltas — "+6 Architecture · +4 Testing · -2 Dependencies".
  if (report.dimensionDeltas.length > 0) {
    const parts = report.dimensionDeltas.map(dd => {
      const sign = dd.delta > 0 ? `+${dd.delta}` : String(dd.delta)
      const color = dd.delta > 0 ? pc.green : dd.delta < 0 ? pc.red : pc.dim
      return `${color(sign)} ${dd.label}`
    })
    body.push(`  ${dim('Dimension deltas:')} ${parts.join(' · ')}`)
  }
  body.push('')
  body.push(...renderScoreBody(report))
  body.push('')
  // New problems.
  if (report.newProblems.length > 0) {
    body.push('')
    body.push(pc.bold('New problems:'))
    const byDim = new Map<string, number>()
    for (const f of report.newProblems) byDim.set(f.dimension, (byDim.get(f.dimension) ?? 0) + 1)
    const parts = [...byDim.entries()].map(([dim, n]) => `${n} ${dim.replace(/-/g, ' ')}`)
    body.push(`  ${parts.join(' · ')}`)
  }
  // Recommended actions — the P0/P1/P2 list.
  if (report.recommendations.length > 0) {
    body.push('')
    body.push(pc.bold('Recommended actions'))
    for (const r of report.recommendations.slice(0, 5)) {
      const pri = r.priority === 'P0' ? pc.bold(pc.red(r.priority)) : r.priority === 'P1' ? pc.bold(pc.yellow(r.priority)) : pc.dim(r.priority)
      body.push(`  ${pri}  ${r.message}`)
      body.push(`      ${dim(r.action)}`)
    }
  }

  printCarbonReport({
    title: 'vectalon score — Engineering Health Score',
    verdict: report.verdict,
    lines: body,
    reportPath: jsonPath,
    root: report.root,
    done: `Score ${report.overall}/100 (${report.grade}) — report: ${jsonPath}`,
  })
}
