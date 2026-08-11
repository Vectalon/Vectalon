import { BenchScenarioRun, BenchSummary } from './types'

function axisLine(axes: BenchScenarioRun['axes']): string {
  const parts: string[] = []
  if (axes.correctness !== null) parts.push(`correctness ${(axes.correctness * 100).toFixed(0)}%`)
  if (axes.adherence !== null) parts.push(`adherence ${(axes.adherence * 100).toFixed(0)}%`)
  if (axes.guardrails !== null) parts.push(`guardrails ${(axes.guardrails * 100).toFixed(0)}%`)
  return parts.length > 0 ? parts.join(' · ') : 'no axes scored'
}

/**
 * One scenario's markdown section (title, composite, axes, correctness
 * details, relative-to-human). Extracted so `vectalon bench` can stream each
 * section to stdout the moment the scenario finishes (live report) while the
 * final summary keeps only the Overall block — no trailing blank line; the
 * caller adds the separator.
 */
export function formatScenarioSection(run: BenchScenarioRun): string {
  const lines: string[] = []
  const composite = run.composite !== null ? `${(run.composite * 100).toFixed(0)}%` : 'n/a'
  lines.push(`### ${run.id} — ${run.title}`)
  lines.push('')
  lines.push(`Composite: **${composite}** · ${axisLine(run.axes)}`)
  if (run.reference) {
    const refComposite = run.reference.composite !== null ? `${(run.reference.composite * 100).toFixed(0)}%` : 'n/a'
    const relComposite =
      run.reference.relative.composite !== null
        ? `${(run.reference.relative.composite * 100).toFixed(0)}%`
        : 'n/a'
    lines.push(`Relative to human reference: **${relComposite}** (reference composite: ${refComposite})`)
  }
  if (run.generatedFiles.length > 0) {
    lines.push('')
    lines.push(`Generated files: ${run.generatedFiles.map(f => `\`${f}\``).join(', ')}`)
  }
  const failures = run.guardrail.filter(g => !g.ok)
  if (failures.length > 0) {
    lines.push('')
    lines.push('Guardrail failures:')
    for (const g of failures) {
      lines.push(`- \`${g.path}\`: ${g.failed} failed, ${g.passed} passed, ${g.skipped} skipped`)
    }
  }
  return lines.join('\n')
}

/** Report title + spec line (no trailing blank; composer adds separators). */
export function formatBenchmarkHeader(summary: BenchSummary): string {
  return `# RN Coding Tests — Benchmark report\n\nSpec version: ${summary.specVersion} · ${summary.runs.length} scenario(s) run`
}

/** The `---` + Overall block that closes the report (no trailing blank). */
export function formatBenchmarkOverall(summary: BenchSummary): string {
  const lines: string[] = ['---', '']
  lines.push(
    `Overall composite: ${summary.overallComposite !== null ? `${(summary.overallComposite * 100).toFixed(0)}%` : 'n/a'}` +
      ` · Overall guardrails: ${summary.overallGuardrails !== null ? `${(summary.overallGuardrails * 100).toFixed(0)}%` : 'n/a'}`
  )
  if (summary.overallReferenceComposite !== null || summary.overallRelativeComposite !== null) {
    lines.push(
      `Overall reference composite: ${summary.overallReferenceComposite !== null ? `${(summary.overallReferenceComposite * 100).toFixed(0)}%` : 'n/a'}` +
        ` · Overall relative to human: ${summary.overallRelativeComposite !== null ? `${(summary.overallRelativeComposite * 100).toFixed(0)}%` : 'n/a'}`
    )
  }
  return lines.join('\n')
}

export function formatBenchmarkReport(summary: BenchSummary): string {
  const parts: string[] = [formatBenchmarkHeader(summary), '']

  for (const suite of summary.suites) {
    parts.push(`## ${suite.suite}`, '')
    for (const run of summary.runs.filter(r => r.suite === suite.suite)) {
      parts.push(formatScenarioSection(run), '')
    }
  }

  parts.push(formatBenchmarkOverall(summary), '')
  return parts.join('\n')
}
