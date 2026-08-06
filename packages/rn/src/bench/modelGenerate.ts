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
import { benchmarkSnapshot } from './snapshot'
import type { BenchGeneratedFile, BenchScenario } from './types'

export interface ModelGenerateOptions {
  modelRouter: ModelRouter
  /** Override generation temperature (default 0.2, matching the harness). */
  temperature?: number
  /** Override max tokens (default 4096, matching the harness). */
  maxTokens?: number
}

/** Build a generate seam that drives the real model for a scenario. */
export function createModelGenerate(options: ModelGenerateOptions): (scenario: BenchScenario) => Promise<BenchGeneratedFile[]> {
  const { modelRouter, temperature = 0.2, maxTokens = 4096 } = options

  return async (scenario: BenchScenario): Promise<BenchGeneratedFile[]> => {
    const snapshot = benchmarkSnapshot()
    const { systemPrompt, prompt } = buildImplementationPrompt({
      snapshot,
      prompt: scenario.prompt,
      intent: { type: 'add-feature', feature: scenario.id, description: scenario.prompt },
    })

    const response = await modelRouter.generate({
      systemPrompt,
      prompt,
      context: `Project: rn-bench-app, React Native 0.74.0`,
      maxTokens,
      temperature,
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
