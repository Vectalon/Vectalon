import { getConfig } from '../config'

/**
 * Async embedding provider backed by a real HTTP API. The sync
 * `EmbeddingProvider` seam (hash) stays for deterministic offline use; remote
 * providers plug into `KnowledgeIndex.searchRemote` / `TeamStore.searchRemote`
 * so semantic search works with real model embeddings when configured.
 */
export interface RemoteEmbeddingProvider {
  readonly name: string
  embed(text: string): Promise<number[]>
}

export interface OpenAIEmbeddingOptions {
  apiKey: string
  model?: string
  baseUrl?: string
}

/** OpenAI `text-embedding-*` provider (any `/v1/embeddings` compatible endpoint). */
export class OpenAIEmbeddingProvider implements RemoteEmbeddingProvider {
  name: string
  private model: string
  private baseUrl: string
  private apiKey: string

  constructor(options: OpenAIEmbeddingOptions) {
    this.name = 'openai'
    this.apiKey = options.apiKey
    this.model = options.model || 'text-embedding-3-small'
    this.baseUrl = (options.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
  }

  async embed(text: string): Promise<number[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    // Local compatible endpoints (Ollama/vLLM) may not need a key; skip the
    // empty bearer header so strict gateways don't reject the request.
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`
    }
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: this.model, input: text }),
    })
    if (!response.ok) {
      throw new Error(`Embedding API ${response.status}: ${(await response.text()).slice(0, 200)}`)
    }
    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>
      error?: { message?: string }
    }
    if (payload.error?.message) {
      throw new Error(payload.error.message)
    }
    const embedding = payload.data?.[0]?.embedding
    if (!embedding) {
      throw new Error('Embedding API returned no data')
    }
    return embedding
  }
}

/**
 * Any OpenAI-compatible embeddings endpoint with a custom base URL + model
 * (Azure OpenAI, local vLLM/Ollama, OpenRouter-compatible gateways, …).
 */
export class OpenAICompatibleEmbeddingProvider extends OpenAIEmbeddingProvider {
  constructor(options: OpenAIEmbeddingOptions & { name?: string }) {
    super(options)
    this.name = options.name || 'openai-compatible'
  }
}

/**
 * Build a remote embedding provider from config/env, or return null when no
 * provider is configured so callers fall back to the deterministic hash seam.
 * Resolution order: explicit options > config (`embeddingProvider`) > env.
 */
export function createRemoteEmbeddingProvider(
  opts: {
    provider?: string
    apiKey?: string
    model?: string
    baseUrl?: string
  } = {}
): RemoteEmbeddingProvider | null {
  const provider = opts.provider || (getConfig('embeddingProvider') as string) || ''
  if (provider === 'hash' || provider === '') return null

  const apiKey =
    opts.apiKey ||
    (getConfig('openaiApiKey') as string) ||
    process.env.OPENAI_API_KEY ||
    process.env.RN_VECTALON_OPENAI_API_KEY

  if (provider === 'openai' || provider === 'openai-compatible') {
    if (!apiKey && provider === 'openai') return null
    const baseUrl = opts.baseUrl || (getConfig('openaiBaseUrl') as string) || undefined
    if (provider === 'openai-compatible' && !baseUrl && !apiKey) return null
    return new OpenAICompatibleEmbeddingProvider({
      apiKey: apiKey || '',
      model: opts.model || (getConfig('embeddingModel') as string) || 'text-embedding-3-small',
      baseUrl,
      name: provider === 'openai' ? 'openai' : 'openai-compatible',
    })
  }

  return null
}
