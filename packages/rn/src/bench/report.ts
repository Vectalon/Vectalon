import { BenchScenarioRun, BenchSummary } from './types'

export const REFERENCE_COMPARISON_NOTICE = 'Reference authorship and independent review are unverified. Ratios compare rubric scores, not human performance or launch readiness.'

function axisLine(axes: BenchScenarioRun['axes']): string {
  const parts: string[] = []
  parts.push(axes.correctness === null ? 'correctness not scored' : `correctness ${(axes.correctness * 100).toFixed(0)}%`)
  parts.push(axes.adherence === null ? 'adherence not scored' : `adherence ${(axes.adherence * 100).toFixed(0)}%`)
  parts.push(axes.guardrails === null ? 'guardrails not scored' : `guardrails ${(axes.guardrails * 100).toFixed(0)}%`)
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
  for (const detail of run.correctnessDetails || []) lines.push(detail)
  if (run.attempts) {
    lines.push(`Router calls: ${run.attempts.length}. Provider invocation traces include router retries/fallbacks when available; they do not measure tokens, cost or provider-internal work. Attempt scores are offline checks, not verified task completion.`)
    lines.push('Model artifact identity is unverified. Request fingerprints cover benchmark input before provider enrichment, not the final inference payload.')
    for (const attempt of run.attempts) {
      lines.push(`- Attempt ${attempt.index} (${attempt.kind}): ${attempt.status}${attempt.selected ? ' · selected' : ''} · ${attempt.durationMs}ms · ${axisLine({ correctness: null, adherence: attempt.adherence, guardrails: attempt.guardrails })}`)
      lines.push(`  Provider: ${attempt.provider || 'unknown'} · configured model: ${attempt.model?.id || 'unknown'}`)
      lines.push(`  Prompt condition: ${attempt.promptMode ?? 'unrecorded'}; condition labels alone do not establish a controlled comparison.`)
      if (attempt.verification) lines.push(`  Supplied verifier: ${attempt.verification.status} · ${attempt.verification.durationMs}ms (included in attempt duration); not native qualification.`)
      lines.push(`  Caps: ${attempt.maxAttempts ?? 'unrecorded'} generation attempts · ${attempt.providerCallLimit ?? 'router default'} provider calls per attempt; not measured tokens or cost.`)
      if (attempt.artifact) lines.push(`  Observed local file SHA-256: ${attempt.artifact.sha256} · ${attempt.artifact.sizeBytes} bytes; not backend attestation.`)
      lines.push(attempt.providerCalls
        ? `  Provider invocations: ${attempt.providerCalls.length}; circuit-skipped providers and router-generated stubs are not invocations.`
        : '  Provider invocations: unrecorded.')
      for (const call of attempt.providerCalls || []) {
        lines.push(`    - ${call.provider}: ${call.status} · ${call.durationMs}ms`)
      }
    }
  }
  if (run.reference) {
    if (run.reference.missingRequiredFiles?.length) {
      lines.push(`Reference incomplete; relative comparison unavailable. Missing: ${run.reference.missingRequiredFiles.join(', ')}`)
    }
    const refComposite = run.reference.composite !== null ? `${(run.reference.composite * 100).toFixed(0)}%` : 'n/a'
    const relComposite =
      run.reference.relative.composite !== null
        ? `${(run.reference.relative.composite * 100).toFixed(0)}%`
        : 'n/a'
    lines.push(`Relative to reference: **${relComposite}** (reference composite: ${refComposite})`)
    lines.push(REFERENCE_COMPARISON_NOTICE)
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
      for (const rule of g.failedRules || []) lines.push(`  - ${rule}`)
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
  const p = summary.provenance
  if (p) {
    lines.push(`Run: ${p.runId} · started ${p.startedAt} · ${p.durationMs}ms`)
    lines.push(`Task set: ${p.taskSetDigest}`)
    lines.push(`Runtime: ${p.runtime.node} · ${p.runtime.platform}/${p.runtime.arch}`)
    lines.push(`Execution: ${p.execution.generation} generator · live requested: ${p.execution.liveRequested} · install requested: ${p.execution.installRequested} · executor: ${p.execution.executor} · rubric: ${p.execution.rubric}`)
    lines.push('Observed metadata only: toolchain/dependency pinning, equal budgets and independent task success are not established by matching fingerprints.')
  } else lines.push('Run provenance: unrecorded.')
  lines.push(
    `Overall composite: ${summary.overallComposite !== null ? `${(summary.overallComposite * 100).toFixed(0)}%` : 'n/a'}` +
      ` · Overall guardrails: ${summary.overallGuardrails !== null ? `${(summary.overallGuardrails * 100).toFixed(0)}%` : 'n/a'}`
  )
  if (summary.overallReferenceComposite !== null || summary.overallRelativeComposite !== null) {
    const compared = summary.runs.filter(run => run.reference?.relative.composite != null).length
    lines.push(`Reference comparisons available: ${compared}/${summary.runs.length} scenarios`)
    lines.push(
      `Overall reference composite: ${summary.overallReferenceComposite !== null ? `${(summary.overallReferenceComposite * 100).toFixed(0)}%` : 'n/a'}` +
        ` · Overall relative to reference: ${summary.overallRelativeComposite !== null ? `${(summary.overallRelativeComposite * 100).toFixed(0)}%` : 'n/a'}`
    )
    lines.push(REFERENCE_COMPARISON_NOTICE)
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
