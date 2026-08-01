import type { ModelRequest, ModelResponse } from '../types'
import { getDefaultPreset } from '../local/presets'
import { runInference } from '../local/inference'
import { hasDownloadedModel } from '../local/ModelStore'

export class LocalProvider {
  private initialized = false
  private fallback = false

  async initialize(): Promise<void> {
    this.initialized = true
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (!this.initialized) await this.initialize()

    const preset = getDefaultPreset()
    if (hasDownloadedModel(preset.id)) {
      try {
        const result = await runInference(preset.id, {
          systemPrompt: request.systemPrompt,
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
        return this.fallbackResponse(request, err instanceof Error ? err : undefined)
      }
    }

    this.fallback = true
    return this.fallbackResponse(request)
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
