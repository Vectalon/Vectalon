import { ModelRouter } from '../../src/model/ModelRouter'
import { WasmProvider } from '../../src/model/providers/WasmProvider'
import { CircuitBreaker } from '../../src/model/circuitBreaker'
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

  it('never throws when generating before initialize — returns a clear stub instead (P0-7)', async () => {
    const router = new ModelRouter()
    const response = await router.generate({ prompt: 'hi' })
    expect(response.provider).toBe('local')
    expect(response.content).toContain('hi')
    expect(response.content).toMatch(/No provider available|Model fallback/)
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

  it('honors a local preset override from modelConfig.modelName (e.g. qwen2.5-coder-3b)', async () => {
    const router = new ModelRouter()
    router.initialize({ provider: 'local', modelName: 'qwen2.5-coder-3b' })
    // No 3B model downloaded in the test env -> the zero-config tier is off and
    // the fallback stub answers, but the active label must name the 3B preset.
    const response = await router.generate({ prompt: 'hi' })
    expect(response.provider).toBe('local')
    expect(router.getActiveLabel()).toBe('local (qwen2.5-coder-3b)')
  })

  it('ignores a local preset override that is not a known preset id', async () => {
    const router = new ModelRouter()
    router.initialize({ provider: 'local', modelName: 'gpt-4o' })
    expect(router.getActiveLabel()).toBe('local (qwen2.5-coder-1.5b)')
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

  it('falls back to a deterministic stub with a clear message when the remote is down (P0-7)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connection refused')) as unknown as typeof fetch
    const router = new ModelRouter()
    router.initialize({ provider: 'openai' })

    const response = await router.generate({ prompt: 'hi', systemPrompt: 'sys' })
    // Never throws: the last rung of the chain is the stub, labeled with the
    // configured provider so callers know what was attempted.
    expect(response.provider).toBe('openai')
    expect(response.content).toContain('hi')
    expect(response.content).toContain('openai failed: connection refused')
  })

  it('short-circuits a failing remote after 3 failures in 60s and recovers after the cooldown (P0-7)', async () => {
    let now = 0
    const circuit = new CircuitBreaker({ maxFailures: 3, windowMs: 60_000, cooldownMs: 300_000, now: () => now })
    const fetchMock = jest.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch
    global.fetch = fetchMock
    const router = new ModelRouter({ circuitBreaker: circuit })
    router.initialize({ provider: 'openai' })

    // Call 1: unknown provider → 2 attempts (retry). Call 2: 1 attempt (3rd
    // failure inside the window) → circuit opens. Call 3: short-circuited.
    await router.generate({ prompt: 'x' })
    await router.generate({ prompt: 'x' })
    const short = await router.generate({ prompt: 'x' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(short.content).toContain('short-circuited')
    expect(circuit.snapshot('openai').state).toBe('open')

    // After the cooldown the circuit goes half-open and the remote is tried again.
    now = 300_001
    await router.generate({ prompt: 'x' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
