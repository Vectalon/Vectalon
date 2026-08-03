import { getDefaultPreset } from './local/presets'
import { hasDownloadedModel } from './local/ModelStore'

export const MODEL_PROVIDERS = ['local', 'openai', 'anthropic'] as const
export type ModelSetupProvider = (typeof MODEL_PROVIDERS)[number]

/** Default model per remote provider — must match RemoteProvider's defaults. */
export const REMOTE_MODEL_DEFAULTS: Record<'openai' | 'anthropic', string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
}

/** The environment variable a remote provider reads its API key from. */
export function apiKeyEnvFor(provider: 'openai' | 'anthropic'): string {
  return `${provider.toUpperCase()}_API_KEY`
}

export interface ModelAvailability {
  /** The default local preset id (e.g. qwen2.5-coder-1.5b). */
  localPresetId: string
  /** Whether the default local model is already downloaded. */
  localDownloaded: boolean
  openaiKeySet: boolean
  anthropicKeySet: boolean
}

/** Snapshot of what the environment can already provide. */
export function detectModelAvailability(): ModelAvailability {
  return {
    localPresetId: getDefaultPreset().id,
    localDownloaded: hasDownloadedModel(getDefaultPreset().id),
    openaiKeySet: !!process.env.OPENAI_API_KEY,
    anthropicKeySet: !!process.env.ANTHROPIC_API_KEY,
  }
}

export interface ProjectModelConfig {
  modelName?: string
  apiKeyEnv?: string
}

/**
 * Build the project-level model config for a provider. `local` has no config;
 * remote providers persist which model to use and which env var carries the key
 * (the key itself is never written to disk — it stays in the environment).
 */
export function buildModelConfig(provider: ModelSetupProvider): ProjectModelConfig | undefined {
  if (provider === 'openai' || provider === 'anthropic') {
    return { modelName: REMOTE_MODEL_DEFAULTS[provider], apiKeyEnv: apiKeyEnvFor(provider) }
  }
  return undefined
}

export function isModelSetupProvider(value: string): value is ModelSetupProvider {
  return (MODEL_PROVIDERS as readonly string[]).includes(value)
}
