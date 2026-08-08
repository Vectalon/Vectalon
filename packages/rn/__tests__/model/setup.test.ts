import {
  buildModelConfig,
  apiKeyEnvFor,
  isModelSetupProvider,
  detectModelAvailability,
  activeModelLabel,
  isRemoteKeyMissing,
  REMOTE_MODEL_DEFAULTS,
  MODEL_PROVIDERS,
  getRemoteProviderInfo,
} from '../../src/model/setup'

describe('model setup helpers', () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.GROQ_API_KEY
  })

  it('lists exactly the supported providers', () => {
    expect(MODEL_PROVIDERS).toEqual([
      'local',
      'wasm',
      'openai',
      'anthropic',
      'azure-openai',
      'ollama',
      'vllm',
      'groq',
    ])
  })

  it('derives the API-key env var per provider (none for keyless servers)', () => {
    expect(apiKeyEnvFor('openai')).toBe('OPENAI_API_KEY')
    expect(apiKeyEnvFor('anthropic')).toBe('ANTHROPIC_API_KEY')
    expect(apiKeyEnvFor('azure-openai')).toBe('AZURE_OPENAI_API_KEY')
    expect(apiKeyEnvFor('groq')).toBe('GROQ_API_KEY')
    expect(apiKeyEnvFor('ollama')).toBeUndefined()
    expect(apiKeyEnvFor('vllm')).toBeUndefined()
  })

  it('registers every remote provider with defaults and a wire kind', () => {
    expect(getRemoteProviderInfo('azure-openai')).toMatchObject({ defaultModel: 'gpt-4o', apiKeyEnv: 'AZURE_OPENAI_API_KEY', kind: 'azure' })
    expect(getRemoteProviderInfo('ollama')).toMatchObject({ defaultModel: 'llama3.1', apiKeyEnv: null, kind: 'openai' })
    expect(getRemoteProviderInfo('vllm')).toMatchObject({ defaultModel: 'qwen2.5-coder-7b-instruct', apiKeyEnv: null, kind: 'openai' })
    expect(getRemoteProviderInfo('groq')).toMatchObject({ defaultModel: 'llama-3.3-70b-versatile', apiKeyEnv: 'GROQ_API_KEY', kind: 'openai' })
    expect(getRemoteProviderInfo('gemini')).toBeUndefined()
  })

  it('builds no model config for local/wasm and env-based config for remote providers', () => {
    expect(buildModelConfig('local')).toBeUndefined()
    expect(buildModelConfig('wasm')).toBeUndefined()

    const openai = buildModelConfig('openai')
    expect(openai).toEqual({ modelName: REMOTE_MODEL_DEFAULTS.openai, apiKeyEnv: 'OPENAI_API_KEY' })
    expect(openai?.modelName).toBe('gpt-4o')

    const anthropic = buildModelConfig('anthropic')
    expect(anthropic).toEqual({ modelName: REMOTE_MODEL_DEFAULTS.anthropic, apiKeyEnv: 'ANTHROPIC_API_KEY' })

    const azure = buildModelConfig('azure-openai')
    expect(azure).toEqual({ modelName: 'gpt-4o', apiKeyEnv: 'AZURE_OPENAI_API_KEY' })

    const groq = buildModelConfig('groq')
    expect(groq).toEqual({ modelName: 'llama-3.3-70b-versatile', apiKeyEnv: 'GROQ_API_KEY' })

    // Keyless local servers persist only the model name — no apiKeyEnv.
    const ollama = buildModelConfig('ollama')
    expect(ollama).toEqual({ modelName: 'llama3.1' })
    expect(ollama?.apiKeyEnv).toBeUndefined()
  })

  it('validates provider strings', () => {
    expect(isModelSetupProvider('local')).toBe(true)
    expect(isModelSetupProvider('wasm')).toBe(true)
    expect(isModelSetupProvider('openai')).toBe(true)
    expect(isModelSetupProvider('anthropic')).toBe(true)
    expect(isModelSetupProvider('azure-openai')).toBe(true)
    expect(isModelSetupProvider('ollama')).toBe(true)
    expect(isModelSetupProvider('vllm')).toBe(true)
    expect(isModelSetupProvider('groq')).toBe(true)
    expect(isModelSetupProvider('custom')).toBe(false)
    expect(isModelSetupProvider('gemini')).toBe(false)
  })

  it('detects which env keys are set', () => {
    expect(detectModelAvailability().openaiKeySet).toBe(false)
    expect(detectModelAvailability().anthropicKeySet).toBe(false)
    expect(detectModelAvailability().azureOpenaiKeySet).toBe(false)
    expect(detectModelAvailability().groqKeySet).toBe(false)

    process.env.OPENAI_API_KEY = 'sk-test'
    expect(detectModelAvailability().openaiKeySet).toBe(true)
    expect(detectModelAvailability().anthropicKeySet).toBe(false)

    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    expect(detectModelAvailability().anthropicKeySet).toBe(true)

    process.env.AZURE_OPENAI_API_KEY = 'az-test'
    process.env.GROQ_API_KEY = 'gr-test'
    const availability = detectModelAvailability()
    expect(availability.azureOpenaiKeySet).toBe(true)
    expect(availability.groqKeySet).toBe(true)
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
    expect(activeModelLabel('azure-openai')).toBe('azure-openai (gpt-4o)')
    expect(activeModelLabel('groq')).toBe('groq (llama-3.3-70b-versatile)')
    expect(activeModelLabel('ollama')).toBe('ollama (llama3.1)')
    expect(activeModelLabel('vllm')).toBe('vllm (qwen2.5-coder-7b-instruct)')
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

  it('never flags keyless providers (ollama/vllm) as key-missing', () => {
    expect(isRemoteKeyMissing('ollama')).toBe(false)
    expect(isRemoteKeyMissing('vllm')).toBe(false)
    expect(isRemoteKeyMissing('ollama', { modelName: 'llama3.1' })).toBe(false)
  })

  it('flags azure-openai / groq as key-missing when their env vars are unset', () => {
    expect(isRemoteKeyMissing('azure-openai')).toBe(true)
    expect(isRemoteKeyMissing('groq')).toBe(true)
    process.env.AZURE_OPENAI_API_KEY = 'az-key'
    process.env.GROQ_API_KEY = 'gr-key'
    expect(isRemoteKeyMissing('azure-openai')).toBe(false)
    expect(isRemoteKeyMissing('groq')).toBe(false)
  })
})
