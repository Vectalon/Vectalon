import { ModelRouter } from '../../src/model/ModelRouter'
import { WasmProvider } from '../../src/model/providers/WasmProvider'
import { setConfig, resetConfig } from '../../src/config'
import { useTempConfig, cleanup } from '../helpers/tmp'

describe('ModelRouter', () => {
  const originalFetch = global.fetch
  let configDir: string

  beforeEach(() => {
    configDir = useTempConfig()
    resetConfig()
    setConfig('modelConfig', { apiKey: 'sk-test' })
  })

  afterEach(() => {
    global.fetch = originalFetch
    resetConfig()
    cleanup(configDir)
  })

  it('throws when generating before initialize', async () => {
    const router = new ModelRouter()
    await expect(router.generate({ prompt: 'hi' })).rejects.toThrow(/No provider available/)
  })

  it('routes to the provider chosen at initialize, ignoring global config', async () => {
    setConfig('modelProvider', 'openai')
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })

    const response = await router.generate({ prompt: 'hi' })
    expect(response.provider).toBe('local')
    expect(response.content).toContain('hi')
  })

  it('routes to a remote provider configured globally', async () => {
    setConfig('modelProvider', 'openai')
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'remote reply' } }] }),
    }) as unknown as typeof fetch

    const router = new ModelRouter()
    router.initialize()
    const response = await router.generate({ prompt: 'hi' })
    expect(response.provider).toBe('openai')
    expect(response.content).toBe('remote reply')
  })

  it('reports provider status for local, wasm, and every remote provider', async () => {
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    await expect(router.getProviderStatus()).resolves.toEqual({
      local: true,
      wasm: false,
      openai: false,
      anthropic: false,
      'azure-openai': false,
      ollama: false,
      vllm: false,
      groq: false,
    })
  })

  it('reports a custom remote provider as ready when initialized', async () => {
    const router = new ModelRouter()
    router.initialize({ provider: 'groq' })
    const status = await router.getProviderStatus()
    expect(status.groq).toBe(true)
    expect(status.openai).toBe(false)
  })

  it('routes to a custom provider (groq) with its own base URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'groq via router' } }] }),
    }) as unknown as typeof fetch

    const router = new ModelRouter()
    router.initialize({ provider: 'groq' })
    const response = await router.generate({ prompt: 'hi' })
    expect(response.provider).toBe('groq')
    expect(response.content).toBe('groq via router')
    const [url] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
  })

  it('threads an endpoint override through to the remote provider', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    }) as unknown as typeof fetch

    const router = new ModelRouter()
    router.initialize({ provider: 'vllm', endpoint: 'http://localhost:9000/v1' })
    await router.generate({ prompt: 'hi' })
    const [url] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('http://localhost:9000/v1/chat/completions')
  })

  it('routes to the wasm provider when chosen explicitly', async () => {
    const mod = { env: {}, pipeline: jest.fn(async () => jest.fn(async () => [{ generated_text: 'wasm reply' }])) }
    const router = new ModelRouter({ wasmProvider: new WasmProvider({ loadTransformers: async () => mod }) })
    router.initialize({ provider: 'wasm' })

    const response = await router.generate({ prompt: 'hi' })
    expect(response.provider).toBe('wasm')
    expect(response.content).toBe('wasm reply')
  })

  it('auto-tiers local to wasm when no GGUF model is downloaded (zero-config)', async () => {
    const mod = { env: {}, pipeline: jest.fn(async () => jest.fn(async () => [{ generated_text: 'zero-config reply' }])) }
    const router = new ModelRouter({
      wasmProvider: new WasmProvider({ loadTransformers: async () => mod }),
      zeroConfigEnabled: true,
    })
    router.initialize({ provider: 'local' })

    const response = await router.generate({ prompt: 'hi' })
    expect(response.provider).toBe('wasm')
    expect(response.content).toBe('zero-config reply')
    expect(router.isZeroConfigActive()).toBe(true)
    expect(router.getActiveLabel()).toContain('wasm')
  })

  it('does not auto-tier when the zero-config tier is disabled (e.g. tests)', async () => {
    const loader = jest.fn(async () => {
      throw new Error('the wasm loader must not be invoked when the tier is disabled')
    })
    const wasmProvider = new WasmProvider({ loadTransformers: loader })
    const router = new ModelRouter({ wasmProvider })
    router.initialize({ provider: 'local' })

    const response = await router.generate({ prompt: 'hi' })
    expect(response.provider).toBe('local')
    expect(response.content).toContain('Local model fallback')
    expect(loader).not.toHaveBeenCalled()
    expect(router.isZeroConfigActive()).toBe(false)
  })
})
