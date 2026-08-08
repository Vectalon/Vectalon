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
 * (local vLLM/Ollama, OpenRouter-compatible gateways, …).
 */
export class OpenAICompatibleEmbeddingProvider extends OpenAIEmbeddingProvider {
  constructor(options: OpenAIEmbeddingOptions & { name?: string }) {
    super(options)
    this.name = options.name || 'openai-compatible'
  }
}

/**
 * Azure OpenAI embeddings: the deployment lives in the base URL
 * (`https://<resource>.openai.azure.com/openai/deployments/<deployment>`),
 * auth is the `api-key` header, and every call needs `api-version`.
 */
export class AzureOpenAIEmbeddingProvider implements RemoteEmbeddingProvider {
  name = 'azure-openai'
  private model: string
  private baseUrl: string
  private apiKey: string
  private apiVersion: string

  constructor(options: OpenAIEmbeddingOptions & { apiVersion?: string }) {
    this.apiKey = options.apiKey
    this.model = options.model || 'text-embedding-3-small'
    this.baseUrl = (options.baseUrl || 'https://<resource>.openai.azure.com/openai/deployments/<deployment>').replace(/\/$/, '')
    this.apiVersion = options.apiVersion || '2024-06-01'
  }

  async embed(text: string): Promise<number[]> {
    // The deployment lives in the URL; don't append a second api-version when
    // the endpoint already carries one.
    const url = /[?&]api-version=/.test(this.baseUrl)
      ? `${this.baseUrl}/embeddings`
      : `${this.baseUrl}/embeddings?api-version=${this.apiVersion}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
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

/** Registry of embedding backends (URL + default model + optional key env). */
const EMBEDDING_PROVIDERS: Record<
  string,
  { baseUrl: string; defaultModel: string; apiKeyEnv?: string }
> = {
  openai: { baseUrl: 'https://api.openai.com/v1', defaultModel: 'text-embedding-3-small', apiKeyEnv: 'OPENAI_API_KEY' },
  'openai-compatible': { baseUrl: 'https://api.openai.com/v1', defaultModel: 'text-embedding-3-small' },
  'azure-openai': {
    baseUrl: 'https://<resource>.openai.azure.com/openai/deployments/<deployment>',
    defaultModel: 'text-embedding-3-small',
    apiKeyEnv: 'AZURE_OPENAI_API_KEY',
  },
  ollama: { baseUrl: 'http://localhost:11434/v1', defaultModel: 'nomic-embed-text' },
  vllm: { baseUrl: 'http://localhost:8000/v1', defaultModel: 'BAAI/bge-m3' },
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
  const info = EMBEDDING_PROVIDERS[provider]
  if (!info) return null

  // Key source: explicit options > the provider's own env var (with the
  // RN_VECTALON_ prefixed variant as an escape hatch) > the generic openaiApiKey
  // config fallback. Keyless local servers (ollama/vllm) never consult the
  // generic config — they pass '' and skip the auth header.
  const apiKey =
    opts.apiKey ||
    (info.apiKeyEnv ? process.env[info.apiKeyEnv] : '') ||
    (info.apiKeyEnv ? process.env[`RN_VECTALON_${info.apiKeyEnv}`] : '') ||
    (info.apiKeyEnv ? (getConfig('openaiApiKey') as string) : '') ||
    ''

  if (provider === 'openai' || provider === 'azure-openai') {
    if (!apiKey) return null
  }
  // A bare 'openai-compatible' needs an explicit base URL or key — never hit
  // api.openai.com silently.
  if (provider === 'openai-compatible') {
    const explicitBase = opts.baseUrl || (getConfig('openaiBaseUrl') as string)
    if (!explicitBase && !apiKey) return null
  }

  const baseUrl = opts.baseUrl || (getConfig('openaiBaseUrl') as string) || info.baseUrl
  const model = opts.model || (getConfig('embeddingModel') as string) || info.defaultModel

  if (provider === 'azure-openai') {
    return new AzureOpenAIEmbeddingProvider({ apiKey, model, baseUrl })
  }
  if (provider === 'openai') {
    return new OpenAIEmbeddingProvider({ apiKey, model, baseUrl })
  }
  return new OpenAICompatibleEmbeddingProvider({ apiKey, model, baseUrl, name: provider })
}
