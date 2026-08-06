import {
  buildModelConfig,
  apiKeyEnvFor,
  isModelSetupProvider,
  detectModelAvailability,
  activeModelLabel,
  isRemoteKeyMissing,
  REMOTE_MODEL_DEFAULTS,
  MODEL_PROVIDERS,
} from '../../src/model/setup'

describe('model setup helpers', () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
  })

  it('lists exactly the supported providers', () => {
    expect(MODEL_PROVIDERS).toEqual(['local', 'wasm', 'openai', 'anthropic'])
  })

  it('derives the API-key env var per provider', () => {
    expect(apiKeyEnvFor('openai')).toBe('OPENAI_API_KEY')
    expect(apiKeyEnvFor('anthropic')).toBe('ANTHROPIC_API_KEY')
  })

  it('builds no model config for local/wasm and env-based config for remote providers', () => {
    expect(buildModelConfig('local')).toBeUndefined()
    expect(buildModelConfig('wasm')).toBeUndefined()

    const openai = buildModelConfig('openai')
    expect(openai).toEqual({ modelName: REMOTE_MODEL_DEFAULTS.openai, apiKeyEnv: 'OPENAI_API_KEY' })
    expect(openai?.modelName).toBe('gpt-4o')

    const anthropic = buildModelConfig('anthropic')
    expect(anthropic).toEqual({ modelName: REMOTE_MODEL_DEFAULTS.anthropic, apiKeyEnv: 'ANTHROPIC_API_KEY' })
  })

  it('validates provider strings', () => {
    expect(isModelSetupProvider('local')).toBe(true)
    expect(isModelSetupProvider('wasm')).toBe(true)
    expect(isModelSetupProvider('openai')).toBe(true)
    expect(isModelSetupProvider('anthropic')).toBe(true)
    expect(isModelSetupProvider('custom')).toBe(false)
    expect(isModelSetupProvider('gemini')).toBe(false)
  })

  it('detects which env keys are set', () => {
    expect(detectModelAvailability().openaiKeySet).toBe(false)
    expect(detectModelAvailability().anthropicKeySet).toBe(false)

    process.env.OPENAI_API_KEY = 'sk-test'
    expect(detectModelAvailability().openaiKeySet).toBe(true)
    expect(detectModelAvailability().anthropicKeySet).toBe(false)

    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    expect(detectModelAvailability().anthropicKeySet).toBe(true)
  })

  it('always reports the default local preset id', () => {
    const availability = detectModelAvailability()
    expect(availability.localPresetId).toBe('qwen2.5-coder-1.5b')
    expect(typeof availability.localDownloaded).toBe('boolean')
    expect(typeof availability.wasmReady).toBe('boolean')
  })

  it('labels the active model with provider and model name', () => {
    expect(activeModelLabel('local')).toBe('local (qwen2.5-coder-1.5b)')
    expect(activeModelLabel('wasm')).toBe('wasm (onnx-community/Qwen2.5-Coder-0.5B-Instruct)')
    expect(activeModelLabel('openai', { modelName: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' })).toBe('openai (gpt-4o)')
    expect(activeModelLabel('anthropic')).toBe('anthropic (claude-sonnet-4-20250514)')
    expect(activeModelLabel('custom')).toBe('custom')
  })

  it('flags missing remote keys, honoring a custom apiKeyEnv', () => {
    expect(isRemoteKeyMissing('local')).toBe(false)
    expect(isRemoteKeyMissing('openai', { modelName: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' })).toBe(true)

    process.env.OPENAI_API_KEY = 'sk-test'
    expect(isRemoteKeyMissing('openai', { modelName: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' })).toBe(false)
    delete process.env.OPENAI_API_KEY

    process.env.MY_OPENAI_KEY = 'sk-custom'
    expect(isRemoteKeyMissing('openai', { modelName: 'gpt-4o', apiKeyEnv: 'MY_OPENAI_KEY' })).toBe(false)
    delete process.env.MY_OPENAI_KEY
  })
})
