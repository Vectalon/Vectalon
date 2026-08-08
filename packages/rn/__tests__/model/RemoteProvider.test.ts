import { RemoteProvider } from '../../src/model/providers/RemoteProvider'
import { setConfig, resetConfig } from '../../src/config'
import { createTempProject, useTempConfig, cleanup } from '../helpers/tmp'

describe('RemoteProvider', () => {
  const originalFetch = global.fetch
  let configDir: string

  beforeEach(() => {
    configDir = useTempConfig()
    resetConfig()
    setConfig('modelConfig', { apiKey: 'sk-test', modelName: 'gpt-4o' })
  })

  afterEach(() => {
    global.fetch = originalFetch
    resetConfig()
    cleanup(configDir)
  })

  function mockFetchResponse(body: Record<string, unknown>, ok = true, status = 200, statusText = 'OK') {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      statusText,
      json: async () => body,
    }) as unknown as typeof fetch
  }

  it('throws for an unknown provider', () => {
    expect(() => new RemoteProvider('gemini')).toThrow('Unknown provider')
  })

  it('calls the OpenAI chat completions endpoint', async () => {
    mockFetchResponse({
      choices: [{ message: { content: 'hello from openai' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })

    const provider = new RemoteProvider('openai')
    const response = await provider.generate({ prompt: 'hi', temperature: 0.1 })

    expect(response.content).toBe('hello from openai')
    expect(response.provider).toBe('openai')
    expect(response.usage?.promptTokens).toBe(10)
    expect(response.usage?.totalTokens).toBe(15)

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('gpt-4o')
    expect(body.temperature).toBe(0.1)
    expect(body.messages).toContainEqual({ role: 'system', content: expect.stringContaining('React Native') })
  })

  it('throws on OpenAI non-OK response', async () => {
    mockFetchResponse({ error: 'bad key' }, false, 401, 'Unauthorized')
    const provider = new RemoteProvider('openai')
    await expect(provider.generate({ prompt: 'hi' })).rejects.toThrow('OpenAI API error: 401 Unauthorized')
  })

  it('inlines enabled project skills into the OpenAI system message', async () => {
    const dir = createTempProject({
      '.vectalon/ecosystem.json': JSON.stringify({ enabled: ['expo-router'] }),
      '.vectalon/skills/expo-router/SKILL.md': 'ALWAYS use file-based routes with typed routes enabled.',
    })
    try {
      mockFetchResponse({ choices: [{ message: { content: 'ok' } }] })

      const provider = new RemoteProvider('openai', undefined, { projectRoot: dir })
      await provider.generate({ prompt: 'build a screen', systemPrompt: 'be concise' })

      const [, init] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(init.body)
      const system = body.messages.find((m: { role: string }) => m.role === 'system')
      expect(system.content).toContain('be concise')
      expect(system.content).toContain('## Enabled project skills (best practices)')
      expect(system.content).toContain('ALWAYS use file-based routes with typed routes enabled.')
    } finally {
      cleanup(dir)
    }
  })

  it('uses an injected skills loader for Anthropic', async () => {
    mockFetchResponse({ content: [{ text: 'ok' }] })

    const provider = new RemoteProvider('anthropic', undefined, {
      projectRoot: '/tmp/irrelevant',
      skillsLoader: (_root, systemPrompt) => `${systemPrompt}\n\n## Injected skills\n\nCUSTOM SKILL GUIDANCE`,
    })
    await provider.generate({ prompt: 'hi', systemPrompt: 'base' })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.system).toContain('CUSTOM SKILL GUIDANCE')
    expect(body.system).toContain('base')
  })

  it('does not load skills without a projectRoot', async () => {
    mockFetchResponse({ choices: [{ message: { content: 'ok' } }] })

    const provider = new RemoteProvider('openai')
    await provider.generate({ prompt: 'hi', systemPrompt: 'base' })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)
    const system = body.messages.find((m: { role: string }) => m.role === 'system')
    expect(system.content).toBe('base')
    expect(system.content).not.toContain('## Enabled project skills')
  })

  it('calls the Anthropic messages endpoint', async () => {
    mockFetchResponse({
      content: [{ text: 'hello from anthropic' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    const provider = new RemoteProvider('anthropic')
    const response = await provider.generate({ prompt: 'hi' })

    expect(response.content).toBe('hello from anthropic')
    expect(response.provider).toBe('anthropic')

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('sk-test')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('gpt-4o')
    expect(body.messages).toContainEqual({ role: 'user', content: 'hi' })
  })

  it('calls Azure OpenAI with the deployments path, api-version, and api-key header', async () => {
    mockFetchResponse({ choices: [{ message: { content: 'hello from azure' } }] })

    const provider = new RemoteProvider('azure-openai')
    const response = await provider.generate({ prompt: 'hi', temperature: 0.5 })

    expect(response.content).toBe('hello from azure')
    expect(response.provider).toBe('azure-openai')

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(
      'https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-06-01'
    )
    expect(init.headers['api-key']).toBe('sk-test')
    expect(init.headers.Authorization).toBeUndefined()
    const body = JSON.parse(init.body)
    // Azure derives the deployment from the URL path — the body omits `model`
    // so deployments that reject a mismatched model field don't fail.
    expect(body.model).toBeUndefined()
    expect(body.temperature).toBe(0.5)
  })

  it('calls Groq with bearer auth on its OpenAI-compatible endpoint', async () => {
    mockFetchResponse({ choices: [{ message: { content: 'groq reply' } }] })

    // Global config carries a gpt-4o modelName; an explicit config wins.
    const provider = new RemoteProvider('groq', { modelName: 'llama-3.3-70b-versatile' })
    const response = await provider.generate({ prompt: 'hi' })

    expect(response.content).toBe('groq reply')
    expect(response.provider).toBe('groq')

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('llama-3.3-70b-versatile')
  })

  it('calls Ollama without an Authorization header (keyless local server)', async () => {
    mockFetchResponse({ choices: [{ message: { content: 'ollama reply' } }] })

    // No global apiKey (the beforeEach global config is cleared) → no key, no
    // bearer header, and the registry default model is used.
    setConfig('modelConfig', {})
    const provider = new RemoteProvider('ollama')
    const response = await provider.generate({ prompt: 'hi' })

    expect(response.content).toBe('ollama reply')
    expect(response.provider).toBe('ollama')

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    expect(init.headers.Authorization).toBeUndefined()
    expect(JSON.parse(init.body).model).toBe('llama3.1')
  })

  it('calls vLLM on its OpenAI-compatible endpoint', async () => {
    mockFetchResponse({ choices: [{ message: { content: 'vllm reply' } }] })

    const provider = new RemoteProvider('vllm')
    const response = await provider.generate({ prompt: 'hi' })

    expect(response.content).toBe('vllm reply')
    expect(response.provider).toBe('vllm')

    const [url] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('http://localhost:8000/v1/chat/completions')
  })

  it('honors an endpoint override and a custom model name from the config', async () => {
    mockFetchResponse({ choices: [{ message: { content: 'custom endpoint' } }] })

    const provider = new RemoteProvider('vllm', {
      modelName: 'my-served-model',
      endpoint: 'http://localhost:9999/custom/v1',
    })
    await provider.generate({ prompt: 'hi' })

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('http://localhost:9999/custom/v1/chat/completions')
    expect(JSON.parse(init.body).model).toBe('my-served-model')
  })
})
