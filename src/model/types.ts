export type ModelProviderType = 'local' | 'openai' | 'anthropic' | 'custom'

export interface ModelConfig {
  provider: ModelProviderType
  apiKey?: string
  modelName?: string
  /** Environment variable that carries the API key (set by `vectalon init`). */
  apiKeyEnv?: string
  endpoint?: string
  maxTokens?: number
  temperature?: number
  /**
   * Project root used to enrich local generations with the project's enabled
   * ecosystem skills (.vectalon/skills/<id>/SKILL.md) inlined into the system
   * prompt, so the local model follows the same best practices as agents.
   */
  projectRoot?: string
}

export interface ModelRequest {
  prompt: string
  systemPrompt?: string
  context?: string
  maxTokens?: number
  temperature?: number
}

export interface ModelResponse {
  content: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
    inputTokens?: number
    outputTokens?: number
  }
  provider: string
}
