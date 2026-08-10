import { WasmProvider } from '../../src/model/providers/WasmProvider'
import { useTempConfig, cleanup } from '../helpers/tmp'

interface FakeTransformers {
  env: { cacheDir?: string; allowLocalModels?: boolean }
  pipeline: jest.Mock
  generator: jest.Mock
}

function makeTransformers(): FakeTransformers {
  const env = { cacheDir: '', allowLocalModels: true }
  const generator = jest.fn(async () => [{ generated_text: '  const x = 1\n' }])
  const pipeline = jest.fn(async () => generator)
  return { env, pipeline, generator }
}

describe('WasmProvider', () => {
  it('generates via the transformers pipeline, trims output, and reports the wasm provider', async () => {
    const mod = makeTransformers()
    const provider = new WasmProvider({ loadTransformers: async () => mod })

    const response = await provider.generate({ prompt: 'Write a hook' })

    expect(response.provider).toBe('wasm')
    expect(response.content).toBe('const x = 1')
    expect(mod.pipeline).toHaveBeenCalledWith(
      'text-generation',
      'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
      expect.objectContaining({ dtype: 'q8' })
    )
  })

  it('points the transformers cache at the vectalon model store and disables local models', async () => {
    const configDir = useTempConfig()
    try {
      const mod = makeTransformers()
      const provider = new WasmProvider({ loadTransformers: async () => mod })

      await provider.generate({ prompt: 'x' })

      expect(mod.env.cacheDir).toContain('wasm')
      expect(mod.env.allowLocalModels).toBe(false)
    } finally {
      cleanup(configDir)
    }
  })

  it('passes system prompt and context as chat messages and strips the echoed input', async () => {
    const mod = makeTransformers()
    const provider = new WasmProvider({ loadTransformers: async () => mod })

    await provider.generate({ prompt: 'Do it', context: 'ctx', systemPrompt: 'sys' })

    expect(mod.generator).toHaveBeenCalledWith(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: '\nContext:\nctx\nDo it' },
      ],
      expect.objectContaining({ max_new_tokens: 2048, return_full_text: false, do_sample: true })
    )
  })

  it('inlines web intel into the system prompt when a project root is set', async () => {
    const mod = makeTransformers()
    const provider = new WasmProvider({
      projectRoot: '/tmp/irrelevant',
      loadTransformers: async () => mod,
      // Mirrors the real loader contract: base prompt + appended intel.
      intelLoader: (root, systemPrompt) => `${systemPrompt}\n\n## Latest React Native ecosystem intel\n\n- RN 0.82 released`,
    })

    await provider.generate({ prompt: 'hi', systemPrompt: 'base' })

    const [messages] = mod.generator.mock.calls[0]
    expect(messages[0].content).toContain('base')
    expect(messages[0].content).toContain('RN 0.82 released')
  })

  it('does not load web intel without a projectRoot', async () => {
    const mod = makeTransformers()
    const provider = new WasmProvider({ loadTransformers: async () => mod })

    await provider.generate({ prompt: 'hi', systemPrompt: 'base' })

    const [messages] = mod.generator.mock.calls[0]
    expect(messages[0].content).toContain('base')
    expect(messages[0].content).not.toContain('Latest React Native ecosystem intel')
  })

  it('adds tool-call envelope instructions when tools are provided', async () => {
    const mod = makeTransformers()
    mod.generator.mockResolvedValue([{ generated_text: '{"answer":"ok"}' }])
    const provider = new WasmProvider({ loadTransformers: async () => mod })

    await provider.generate({
      prompt: 'x',
      tools: [{ name: 'scan', description: 'Scan the project', inputSchema: {} }],
    })

    const [messages] = mod.generator.mock.calls[0]
    expect(messages[0].content).toContain('"tool"')
    expect(messages[0].content).toContain('scan')
  })

  it('degrades to the deterministic stub when the transformers module cannot load', async () => {
    const provider = new WasmProvider({
      loadTransformers: async () => {
        throw new Error('no wasm runtime')
      },
    })

    const response = await provider.generate({ prompt: 'hi' })

    expect(response.content).toContain('Wasm model fallback')
    expect(response.content).toContain('hi')
    expect(provider.isFallback()).toBe(true)
  })

  it('treats an empty generation as a fallback', async () => {
    const mod = makeTransformers()
    mod.generator.mockResolvedValue([{ generated_text: '   ' }])
    const provider = new WasmProvider({ loadTransformers: async () => mod })

    const response = await provider.generate({ prompt: 'hi' })

    expect(response.content).toContain('Wasm model fallback')
    expect(provider.isFallback()).toBe(true)
  })

  it('isReady after a successful initialize probe', async () => {
    const provider = new WasmProvider({ loadTransformers: async () => makeTransformers() })
    await provider.initialize()
    expect(provider.isReady()).toBe(true)
    expect(provider.isFallback()).toBe(false)
  })

  it('remains ready but falls back to the stub when the loader is broken', async () => {
    const provider = new WasmProvider({
      loadTransformers: async () => {
        throw new Error('broken loader')
      },
    })
    await provider.initialize()
    expect(provider.isReady()).toBe(true)

    const response = await provider.generate({ prompt: 'hi' })
    expect(response.content).toContain('Wasm model fallback')
  })
})
