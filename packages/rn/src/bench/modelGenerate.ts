/**
 * Phase V-5 benchmark — ModelRouter generate seam (M5).
 *
 * A `generate` seam for runBenchmark backed by the real ModelRouter. It reuses
 * the implementation phase's prompt builder and model-output parser so the
 * benchmark measures exactly what the harness would produce for a scenario —
 * not a second, drifting prompt. With no model or a failed/fallback response it
 * returns no files (the run scores as N/A rather than poisoning the leaderboard
 * with scaffold output).
 */

import type { ModelRouter } from '../model'
import { buildImplementationPrompt, parseModelOutput } from '../workflows/phases/implementationPhase'
import { isFixScenario } from './fix'
import { benchmarkSnapshot } from './snapshot'
import { guardrailPassRate } from './scoring'
import { runRubric } from './rubric'
import { runGuardrails } from '../guardrails'
import type { BenchGeneratedFile, BenchScenario } from './types'

export interface ModelGenerateOptions {
  modelRouter: ModelRouter
  /** Override generation temperature (default 0.2, matching the harness). */
  temperature?: number
  /**
   * Override max tokens (default 8192). Small local models (Qwen2.5-Coder)
   * need the headroom to finish a multi-file JSON envelope — at 4096 they
   * truncate mid-JSON and the run scores zero files.
   */
  maxTokens?: number
  /**
   * Live streaming hook forwarded to ModelRouter.generate → the local
   * provider's onTextChunk. The CLI wires a TTY-only token preview here so a
   * long leaderboard pass shows the model generating instead of a frozen
   * "generating…" line.
   */
  onTextChunk?: (text: string) => void
}

function quality(files: BenchGeneratedFile[], scenario: BenchScenario): { adherence: number | null; guardrails: number | null; score: number } {
  const adherence = runRubric(files, {
    removedDependencies: scenario.removedDependencies,
    fixEdits: scenario.fixEdits,
  }).overall
  const guardrails = guardrailPassRate(files)
  const values = [adherence, guardrails].filter((value): value is number => value !== null)
  return { adherence, guardrails, score: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 }
}

function repairFeedback(files: BenchGeneratedFile[], scenario: BenchScenario): string {
  const rubric = runRubric(files, {
    removedDependencies: scenario.removedDependencies,
    fixEdits: scenario.fixEdits,
  })
  const failures = rubric.files.flatMap(file => file.checks
    .filter(check => !check.passed)
    .map(check => `- ${file.filePath}: ${check.message || check.name}`))
  for (const file of files) {
    const result = runGuardrails({
      filePath: file.path,
      content: file.content,
      conventions: { hasTypeScript: true, usesStyleSheet: true, hasNavigation: false },
    })
    failures.push(...result.findings
      .filter(finding => !finding.passed)
      .map(finding => `- ${file.path}: ${finding.message || finding.rule}`))
  }
  return [...new Set(failures)].join('\n') || '- Apply every acceptance criterion.'
}

/** Build a generate seam that drives the real model for a scenario. */
export function createModelGenerate(options: ModelGenerateOptions): (scenario: BenchScenario) => Promise<BenchGeneratedFile[]> {
  const { modelRouter, temperature = 0.2, maxTokens = 8192, onTextChunk } = options

  return async (scenario: BenchScenario): Promise<BenchGeneratedFile[]> => {
    const snapshot = benchmarkSnapshot()
    // Removal scenarios (rn-11/34/35) invert the scaffold: the model must
    // DELETE a package and its native traces, so it gets a remove-dependency
    // intent — and the current fixture files, which it must return changed
    // with complete new content. Upgrade/debugging fix scenarios (rn-36..43)
    // do the same: the model gets the broken fixtures and must return them
    // repaired.
    const isRemoval = (scenario.removedDependencies?.length ?? 0) > 0
    const isFix = isFixScenario(scenario)
    const needsFixtures = isRemoval || isFix
    const intent = isRemoval
      ? { type: 'remove-dependency' as const, dependency: (scenario.removedDependencies || []).join(', '), description: scenario.prompt }
      : isFix
        ? { type: 'fix' as const, area: scenario.suite, description: scenario.prompt }
        : { type: 'add-feature' as const, feature: scenario.id, description: scenario.prompt }
    const { systemPrompt, prompt } = buildImplementationPrompt({
      snapshot,
      prompt: scenario.prompt,
      intent,
    })

    const fixtureBlock = needsFixtures
      ? Object.entries(scenario.fixtures || {})
          .map(([path, content]) => `--- ${path} ---\n${content}`)
          .join('\n\n')
      : ''
    const requiredEdits = (scenario.fixEdits || [])
      .map(edit => `- ${edit.file}: replace ${JSON.stringify(edit.find)} with ${JSON.stringify(edit.replace)}`)
      .join('\n')
    const context = [
      'Project: rn-bench-app, React Native 0.74.0',
      '',
      'Acceptance criteria for the final files (apply each item that is relevant):',
      '- Full screens use SafeAreaView/useSafeAreaInsets; input screens also use KeyboardAvoidingView.',
      '- Interactive controls have accessibility labels/roles; long collections use FlatList/SectionList.',
      '- Styles use StyleSheet.create and theme/design tokens, without inline objects or hardcoded colors.',
      '- Async and fetched data expose loading, empty, and user-visible error states and use try/catch.',
      '- Hooks have correct dependency arrays; state updates are immutable; expensive work is memoized.',
      '- Navigation params are typed and deep links use a routing table.',
      '- Return complete runnable files, not explanations, snippets, TODOs, or placeholders.',
      ...(requiredEdits ? ['', 'Required repairs (all are mandatory and exact):', requiredEdits] : []),
      ...(fixtureBlock ? ['', 'Current project files (return each changed file with its complete new content):', fixtureBlock] : []),
      '',
      'Output only one valid JSON object: {"files":[{"path":"...","content":"..."}]}',
    ].join('\n')

    const request = {
      systemPrompt,
      prompt,
      context,
      maxTokens,
      temperature,
      ...(onTextChunk ? { onTextChunk } : {}),
    }
    const response = await modelRouter.generate(request)

    const content = response?.content || ''
    if (!content || content.includes('[Local model fallback') || content.includes('no downloaded model')) {
      return []
    }

    // Small local models occasionally answer with prose or truncated JSON.
    // One clean regeneration is cheaper and more useful than scoring the
    // scenario N/A; never substitute deterministic output for model evidence.
    const parsed = parseModelOutput(content) || parseModelOutput((await modelRouter.generate({
      ...request,
      prompt: `${prompt}\n\nYour previous response was not parseable. Regenerate the complete answer as one valid JSON object only.`,
      temperature: 0,
    })).content || '')
    if (!parsed || parsed.files.length === 0) return []

    const files = parsed.files
      .filter(f => typeof f.path === 'string' && f.path.length > 0 && typeof f.content === 'string')
      .map(f => ({ path: f.path as string, content: f.content }))
    const firstQuality = quality(files, scenario)
    if (firstQuality.guardrails === 1 && (firstQuality.adherence === null || firstQuality.adherence >= 0.8)) return files

    const repaired = parseModelOutput((await modelRouter.generate({
      ...request,
      prompt: [
        prompt,
        '',
        'Repair the generated files below. Return every final file with complete content as valid JSON only.',
        'The deterministic review found these specific failures:',
        repairFeedback(files, scenario),
        '',
        JSON.stringify({ files }),
      ].join('\n'),
      temperature: 0,
    })).content || '')
    if (!repaired) return files
    const repairedFiles = repaired.files
      .filter(f => typeof f.path === 'string' && f.path.length > 0 && typeof f.content === 'string')
      .map(f => ({ path: f.path as string, content: f.content }))
    return quality(repairedFiles, scenario).score > firstQuality.score ? repairedFiles : files
  }
}
