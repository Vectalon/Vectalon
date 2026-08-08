import { getDefaultPreset } from './local/presets'
import { hasDownloadedModel } from './local/ModelStore'
import { getWasmPreset, wasmCacheReady } from './local/wasmPresets'

export const MODEL_PROVIDERS = [
  'local',
  'wasm',
  'openai',
  'anthropic',
  'azure-openai',
  'ollama',
  'vllm',
  'groq',
] as const
export type ModelSetupProvider = (typeof MODEL_PROVIDERS)[number]

/**
 * Metadata for a remote (HTTP) model provider. This registry is the single
 * source of truth shared by the RemoteProvider wire implementation, the CLI
 * (init picker, --model validation, key warnings), the doctor, and the
 * self-test suite.
 */
export interface RemoteProviderInfo {
  /** Stable provider id used across config, CLI, manifests, and env vars. */
  id: string
  /** Human-readable label for prompts / error messages. */
  label: string
  /** Default model id (the provider's own naming). */
  defaultModel: string
  /**
   * Environment variable that carries the API key; `null` for providers that
   * need no key (local Ollama/vLLM servers).
   */
  apiKeyEnv: string | null
  /** Default base URL (no trailing slash). */
  baseUrl: string
  /**
   * Wire format: `openai` = POST {baseUrl}/chat/completions with Bearer auth
   * (OpenAI, Groq, Ollama and vLLM all expose it), `anthropic` = messages API
   * with x-api-key, `azure` = deployments path with api-key + api-version.
   */
  kind: 'openai' | 'anthropic' | 'azure'
  /** Azure-only: API version query parameter. */
  apiVersion?: string
  /** One-line hint for pickers / doctor output. */
  hint: string
}

export const REMOTE_PROVIDERS: RemoteProviderInfo[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    kind: 'openai',
    hint: 'OpenAI chat models',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com/v1',
    kind: 'anthropic',
    hint: 'Anthropic Claude models',
  },
  {
    id: 'azure-openai',
    label: 'Azure OpenAI',
    defaultModel: 'gpt-4o',
    apiKeyEnv: 'AZURE_OPENAI_API_KEY',
    baseUrl: 'https://<resource>.openai.azure.com/openai/deployments/<deployment>',
    kind: 'azure',
    apiVersion: '2024-06-01',
    hint: 'Azure OpenAI deployments — set the endpoint to your resource + deployment',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    defaultModel: 'llama3.1',
    apiKeyEnv: null,
    baseUrl: 'http://localhost:11434/v1',
    kind: 'openai',
    hint: 'Local Ollama server (OpenAI-compatible /v1) — no API key',
  },
  {
    id: 'vllm',
    label: 'vLLM',
    defaultModel: 'qwen2.5-coder-7b-instruct',
    apiKeyEnv: null,
    baseUrl: 'http://localhost:8000/v1',
    kind: 'openai',
    hint: 'Local vLLM server (OpenAI-compatible /v1) — no API key',
  },
  {
    id: 'groq',
    label: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    apiKeyEnv: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    kind: 'openai',
    hint: 'Groq fast inference',
  },
]

const REMOTE_PROVIDER_MAP = new Map(REMOTE_PROVIDERS.map(p => [p.id, p]))

/** Look up a remote provider's registry entry; undefined for unknown ids. */
export function getRemoteProviderInfo(provider: string): RemoteProviderInfo | undefined {
  return REMOTE_PROVIDER_MAP.get(provider)
}

/** Default model per remote provider — derived from the registry. */
export const REMOTE_MODEL_DEFAULTS: Record<string, string> = Object.fromEntries(
  REMOTE_PROVIDERS.map(p => [p.id, p.defaultModel])
)

/** The environment variable a remote provider reads its API key from. */
export function apiKeyEnvFor(provider: string): string | undefined {
  return getRemoteProviderInfo(provider)?.apiKeyEnv ?? undefined
}

export interface ModelAvailability {
  /** The default local preset id (e.g. qwen2.5-coder-1.5b). */
  localPresetId: string
  /** Whether the default local model is already downloaded. */
  localDownloaded: boolean
  /** Whether the zero-config WASM weights are already cached. */
  wasmReady: boolean
  openaiKeySet: boolean
  anthropicKeySet: boolean
  azureOpenaiKeySet: boolean
  groqKeySet: boolean
}

/** Snapshot of what the environment can already provide. */
export function detectModelAvailability(): ModelAvailability {
  return {
    localPresetId: getDefaultPreset().id,
    localDownloaded: hasDownloadedModel(getDefaultPreset().id),
    wasmReady: wasmCacheReady(),
    openaiKeySet: !!process.env.OPENAI_API_KEY,
    anthropicKeySet: !!process.env.ANTHROPIC_API_KEY,
    azureOpenaiKeySet: !!process.env.AZURE_OPENAI_API_KEY,
    groqKeySet: !!process.env.GROQ_API_KEY,
  }
}

export interface ProjectModelConfig {
  modelName?: string
  apiKeyEnv?: string
  /** Optional custom endpoint override (Azure resource/deployment, custom vLLM/Ollama URLs). */
  endpoint?: string
}

/**
 * Build the project-level model config for a provider. `local`/`wasm` have no
 * config; remote providers persist which model to use and which env var carries
 * the key (the key itself is never written to disk — it stays in the
 * environment). Keyless providers (ollama/vllm) persist only the model name.
 */
export function buildModelConfig(provider: ModelSetupProvider): ProjectModelConfig | undefined {
  const info = getRemoteProviderInfo(provider)
  if (!info) return undefined
  if (!info.apiKeyEnv) return { modelName: info.defaultModel }
  return { modelName: info.defaultModel, apiKeyEnv: info.apiKeyEnv }
}

export function isModelSetupProvider(value: string): value is ModelSetupProvider {
  return (MODEL_PROVIDERS as readonly string[]).includes(value)
}

/**
 * Human-readable label for the active model — e.g. `openai (gpt-4o)`,
 * `azure-openai (gpt-4o)`, or `local (qwen2.5-coder-1.5b)`. Used in the
 * feature summary and serve logs so users can see which model actually
 * generated code.
 */
export function activeModelLabel(provider: string, config?: ProjectModelConfig): string {
  if (provider === 'local') {
    return `local (${getDefaultPreset().id})`
  }
  if (provider === 'wasm') {
    return `wasm (${getWasmPreset().modelId})`
  }
  if (getRemoteProviderInfo(provider)) {
    const model = config?.modelName || REMOTE_MODEL_DEFAULTS[provider]
    return `${provider} (${model})`
  }
  return provider
}

/**
 * Whether a remote provider is missing its API key in the environment.
 * Returns false for local, unknown providers, and keyless providers
 * (ollama/vllm — they need a local server, not a key).
 */
export function isRemoteKeyMissing(provider: string, config?: ProjectModelConfig): boolean {
  const info = getRemoteProviderInfo(provider)
  if (!info?.apiKeyEnv) return false
  const env = config?.apiKeyEnv || info.apiKeyEnv
  return !process.env[env]
}
