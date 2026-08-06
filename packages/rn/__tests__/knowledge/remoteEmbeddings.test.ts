import { OpenAIEmbeddingProvider, OpenAICompatibleEmbeddingProvider, createRemoteEmbeddingProvider } from '../../src/knowledge/remoteEmbeddings'

describe('OpenAIEmbeddingProvider', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.OPENAI_API_KEY
    delete process.env.RN_VECTALON_OPENAI_API_KEY
  })

  it('embeds text via the embeddings endpoint with bearer auth', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
      }
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-test' })
    const vector = await provider.embed('login screen')

    expect(vector).toEqual([0.1, 0.2, 0.3])
    expect(fetchMock).toHaveBeenCalledWith('https://api.openai.com/v1/embeddings', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
    }))
    const body = JSON.parse((calls[0].init?.body as string) || '{}')
    expect(body.model).toBe('text-embedding-3-small')
    expect(body.input).toBe('login screen')
  })

  it('throws on non-ok responses', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'invalid api key',
      json: async () => ({}),
    })) as unknown as typeof fetch

    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-bad' })
    await expect(provider.embed('x')).rejects.toThrow(/401/)
  })

  it('throws when the payload carries an API error or no data', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ error: { message: 'rate limited' } }),
    })) as unknown as typeof fetch
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-test' })
    await expect(provider.embed('x')).rejects.toThrow(/rate limited/)

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ data: [] }),
    })) as unknown as typeof fetch
    await expect(provider.embed('x')).rejects.toThrow(/no data/)
  })

  it('uses a custom base URL and model', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ data: [{ embedding: [1] }] }),
      }
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const provider = new OpenAICompatibleEmbeddingProvider({
      apiKey: 'k',
      model: 'text-embedding-ada-002',
      baseUrl: 'https://gateway.example.com/v1',
    })
    await provider.embed('x')
    expect(calls[0].url).toBe('https://gateway.example.com/v1/embeddings')
    const body = JSON.parse((calls[0].init?.body as string) || '{}')
    expect(body.model).toBe('text-embedding-ada-002')
  })
})

describe('createRemoteEmbeddingProvider', () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY
  })

  it('returns null for hash / unset provider', () => {
    expect(createRemoteEmbeddingProvider({ provider: 'hash' })).toBeNull()
    expect(createRemoteEmbeddingProvider({ provider: '' })).toBeNull()
  })

  it('builds an openai provider from env key', () => {
    process.env.OPENAI_API_KEY = 'sk-env'
    const provider = createRemoteEmbeddingProvider({ provider: 'openai' })
    expect(provider).not.toBeNull()
    expect(provider!.name).toBe('openai')
  })

  it('returns null for openai without a key', () => {
    expect(createRemoteEmbeddingProvider({ provider: 'openai' })).toBeNull()
  })

  it('builds an openai-compatible provider with baseUrl even without a key', () => {
    const provider = createRemoteEmbeddingProvider({ provider: 'openai-compatible', baseUrl: 'http://localhost:8000/v1' })
    expect(provider).not.toBeNull()
    expect(provider!.name).toBe('openai-compatible')
  })

  it('returns null for unknown providers', () => {
    expect(createRemoteEmbeddingProvider({ provider: 'bogus' })).toBeNull()
  })
})
