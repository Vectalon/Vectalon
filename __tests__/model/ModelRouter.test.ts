import { ModelRouter } from '../../src/model/ModelRouter'
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

  it('reports provider status', async () => {
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    await expect(router.getProviderStatus()).resolves.toEqual({
      local: true,
      openai: false,
      anthropic: false,
    })
  })
})
