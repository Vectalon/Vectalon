import { RemoteProvider } from '../../src/model/providers/RemoteProvider'
import { setConfig, resetConfig } from '../../src/config'
import { useTempConfig, cleanup } from '../helpers/tmp'

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
})
