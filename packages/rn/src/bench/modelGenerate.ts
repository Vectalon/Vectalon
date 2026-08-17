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
    const context =
      `Project: rn-bench-app, React Native 0.74.0` +
      (fixtureBlock ? `\n\nCurrent project files (return each changed file with its complete new content):\n${fixtureBlock}` : '')

    const response = await modelRouter.generate({
      systemPrompt,
      prompt,
      context,
      maxTokens,
      temperature,
      ...(onTextChunk ? { onTextChunk } : {}),
    })

    const content = response?.content || ''
    if (!content || content.includes('[Local model fallback') || content.includes('no downloaded model')) {
      return []
    }

    const parsed = parseModelOutput(content)
    if (!parsed || parsed.files.length === 0) return []

    return parsed.files
      .filter(f => typeof f.path === 'string' && f.path.length > 0 && typeof f.content === 'string')
      .map(f => ({ path: f.path as string, content: f.content }))
  }
}
