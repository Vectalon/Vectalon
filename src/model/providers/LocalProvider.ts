import type { ModelRequest, ModelResponse } from '../types'
import { getDefaultPreset } from '../local/presets'
import { runInference } from '../local/inference'
import { hasDownloadedModel } from '../local/ModelStore'
import { buildSkillsSystemPrompt } from '../../ecosystem/skills'

export interface LocalProviderOptions {
  /**
   * Project root — when set, enabled ecosystem skills
   * (.vectalon/skills/<id>/SKILL.md) are inlined into the system prompt of
   * every local generation so the model follows the project's best practices.
   */
  projectRoot?: string
  /** Injectable skills-to-system-prompt builder (defaults to the ecosystem
   * loader). Tests inject a stub to verify the wiring without touching disk. */
  skillsLoader?: (root: string, systemPrompt?: string) => string | undefined
}

export class LocalProvider {
  private initialized = false
  private fallback = false
  private readonly projectRoot?: string
  private readonly skillsLoader: (root: string, systemPrompt?: string) => string | undefined

  constructor(options: LocalProviderOptions = {}) {
    this.projectRoot = options.projectRoot
    this.skillsLoader = options.skillsLoader || buildSkillsSystemPrompt
  }

  async initialize(): Promise<void> {
    this.initialized = true
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (!this.initialized) await this.initialize()

    // Enrich the system prompt with the project's enabled skills when we know
    // the project root. The enriched prompt flows to both the real inference
    // path and the no-model fallback so the skills are always visible.
    const systemPrompt = this.projectRoot
      ? this.skillsLoader(this.projectRoot, request.systemPrompt)
      : request.systemPrompt

    const preset = getDefaultPreset()
    if (hasDownloadedModel(preset.id)) {
      try {
        const result = await runInference(preset.id, {
          systemPrompt,
          prompt: request.prompt,
          temperature: request.temperature ?? 0.2,
          maxTokens: request.maxTokens || 2048,
        })
        return {
          content: result.content,
          provider: 'local',
        }
      } catch (err) {
        this.fallback = true
        return this.fallbackResponse({ ...request, systemPrompt }, err instanceof Error ? err : undefined)
      }
    }

    this.fallback = true
    return this.fallbackResponse({ ...request, systemPrompt })
  }

  isReady(): boolean {
    return this.initialized
  }

  isFallback(): boolean {
    return this.fallback
  }

  private fallbackResponse(request: ModelRequest, err?: Error): ModelResponse {
    const context = request.context ? `\nContext:\n${request.context}\n` : ''
    const system = request.systemPrompt ? `System: ${request.systemPrompt}\n` : ''
    const fullPrompt = `${system}${context}${request.prompt}`

    let warning = '[Local model fallback: no downloaded model or inference failed.]'
    if (err) {
      warning += `\nError: ${err.message}`
    }

    return {
      content: `${warning}\n\n${fullPrompt}`,
      provider: 'local',
    }
  }
}
