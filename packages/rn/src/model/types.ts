export type ModelProviderType =
  | 'local'
  | 'wasm'
  | 'openai'
  | 'anthropic'
  | 'azure-openai'
  | 'ollama'
  | 'vllm'
  | 'groq'
  | 'custom'

/** A tool the model may call (OpenAI-style function shape). */
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

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
  /**
   * Tools the model may call. When present, the local provider runs the
   * request in JSON-mode (LlamaJsonSchemaGrammar) so the model replies with a
   * structured `{ tool, arguments }` / `{ answer }` envelope — the caller
   * drives the loop and feeds results back (see src/model/toolCalling.ts).
   */
  tools?: ToolDefinition[]
  /**
   * Called with each decoded text chunk as the model streams. Currently
   * honored by the local (node-llama-cpp) provider only — remote providers
   * ignore it (remote streaming is a separate, larger change). MCP/agent
   * paths never set it, so their behavior is byte-for-byte unchanged.
   */
  onTextChunk?: (text: string) => void
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
