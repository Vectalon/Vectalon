export type ModelProviderType = 'local' | 'openai' | 'anthropic' | 'custom'

export interface ModelConfig {
  provider: ModelProviderType
  apiKey?: string
  modelName?: string
  endpoint?: string
  maxTokens?: number
  temperature?: number
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
  }
  provider: string
}
