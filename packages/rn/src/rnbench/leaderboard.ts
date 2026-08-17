/**
 * vectalon rnbench — markdown leaderboard renderer.
 * Business Source License 1.1 (BSL-1.1)
 */
import type { RnnBenchmark, RnnCell } from './index'

const METRIC_HINT: Record<RnnCell['metric'], string> = {
  'rubric-composite': 'rubric composite',
  'rubric-adherence': 'adherence (deterministic scaffold floor)',
  'removal-composite': 'removal seam composite',
  'diagnosis-rate': 'fix-bench diagnosis rate',
  'fix-rate': 'auto-fix rate',
  pending: 'run the protocol',
}

export function cellText(cell: RnnCell): string {
  if (cell.value === null) return '—'
  return `${cell.value}%`
}

/** The matrix as a markdown table: rows = tools, columns = dimensions. */
export function renderRnnMarkdown(bench: RnnBenchmark): string {
  const lines: string[] = []
  lines.push('# Vectalon RN Engineering Benchmark', '')
  lines.push(`- Version: ${bench.version}`)
  lines.push(`- Generated: ${bench.generatedAt} · Root: ${bench.root}`)
  lines.push('')
  lines.push(
    'Every number is computed from the **committed** artifacts — `bench/results/local*.json` (the live model passes), `bench/baseline.json` (the deterministic gate), and the 35 scenario/reference pairs. Nothing is edited by hand; the scenario→dimension mapping is published so it is auditable.'
  )
  lines.push('', '## The matrix', '')

  const dims = bench.dimensions
  const header = `| Tool | ${dims.map(d => d.label).join(' | ')} |`
  lines.push(header)
  lines.push(`|---|${dims.map(() => '---').join('|')}|`)
  for (const tool of bench.tools) {
    const cells = dims.map(d => {
      const cell = bench.matrix[tool.id]?.[d.id]
      return cell ? cellText(cell) : '—'
    })
    lines.push(`| **${tool.label}**${tool.status === 'pending' ? ' *(pending)*' : ''} | ${cells.join(' | ')} |`)
  }
  lines.push('', '## What each number measures', '')
  for (const d of dims) {
    const cells = bench.tools.map(t => bench.matrix[t.id]?.[d.id]).filter((c): c is RnnCell => !!c && c.value !== null)
    const metrics = [...new Set(cells.map(c => c.metric))].map(m => METRIC_HINT[m]).join('; ')
    lines.push(`- **${d.label}** (${d.scenarios.length} scenarios: ${d.scenarios.join(', ')}) — ${metrics}`)
  }
  lines.push('', '## Tools', '')
  for (const t of bench.tools) {
    const status = t.status === 'pending' ? `— pending · run \`vc rnbench --export\` to score` : `— measured (${t.note ?? 'see methodology'})`
    lines.push(`- **${t.label}**${t.model ? ` (${t.model})` : ''} ${status}`)
  }
  lines.push('', '## Anti-cherry-picking rules', '')
  lines.push(
    '- The scenario→dimension mapping is **fixed and published** — no scenario moves after the fact.',
    '- Every row is scored by the **same rubric** on the **same fixtures** against the **same references**.',
    '- Model rows are scored **live** (typecheck + lint + tests run against the generated code); correctness is never assumed.',
    '- The human row is the human reference scored by that same rubric — it is not automatically 100%.',
    '- Pending cells are shown as pending; a benchmark that has not run a tool does not invent a score.',
  )
  return lines.join('\n')
}
