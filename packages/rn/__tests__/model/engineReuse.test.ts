/**
 * Shared inference engine — one llama + one model per process, reused across
 * every inference. Regression test for the benchmark symptom: 11 scenarios
 * were calling getLlama() 11 times, leaking beforeExit listeners (the
 * MaxListenersExceededWarning) and reloading the GGUF from disk every run.
 */

jest.mock('../../src/utils/dynamicImport', () => ({
  dynamicImport: jest.fn(),
}))
jest.mock('os', () => ({ ...jest.requireActual('os'), freemem: jest.fn(() => 16 * 1024 ** 3) }))

import { dynamicImport } from '../../src/utils/dynamicImport'
import { runInference, _resetSharedEngineForTests } from '../../src/model/local/inference'
import { registerModel, unregisterModel } from '../../src/model/local/ModelStore'
import { useTempConfig, cleanup } from '../helpers/tmp'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { freemem } from 'os'

const mockDynamicImport = dynamicImport as jest.Mock

interface FakeNlc {
  resolveChatWrapper: jest.Mock
  appendUserMessageToChatHistory: jest.Mock
  getLlama: jest.Mock
  LlamaLogLevel: Record<string, number>
  LlamaChatSession: new (opts: unknown) => {
    promptWithMeta: (prompt: string, opts?: Record<string, unknown>) => Promise<{ responseText: string; stopReason: string }>
  }
}

function buildFakeNlc(stopReason = 'eogToken', inputTokens = 32): FakeNlc {
  const getLlama = jest.fn(async () => {
    const loadModel = jest.fn(async () => {
      const createContext = jest.fn(async (options?: { contextSize: number }) => ({
        contextSize: options?.contextSize ?? 32768,
        dispose: jest.fn(),
        getSequence: () => ({ tokenize: jest.fn() }),
      }))
      return { createContext, trainContextSize: 32768 }
    })
    return { loadModel }
  })
  const FakeSession = class {
    promptWithMeta = async (prompt: string, opts?: Record<string, unknown>) => {
      // Mirror node-llama-cpp: invoke onTextChunk per decoded chunk.
      const onTextChunk = opts?.onTextChunk as ((t: string) => void) | undefined
      onTextChunk?.('streamed part ')
      onTextChunk?.('two')
      return { responseText: 'engine reused', stopReason }
    }
  }
  return {
    resolveChatWrapper: jest.fn(() => ({ settings: {},
      generateInitialChatHistory: ({ systemPrompt }: { systemPrompt?: string }) => systemPrompt ? [{ type: 'system', text: systemPrompt }] : [],
      generateContextState: jest.fn(() => ({ contextText: { tokenize: () => new Array(inputTokens).fill(0) } })),
    })),
    appendUserMessageToChatHistory: jest.fn((history: unknown[], text: string) => [...history, { type: 'user', text }]),
    getLlama,
    LlamaLogLevel: { fatal: 0, error: 1, warn: 2, info: 3, log: 4, debug: 5 },
    LlamaChatSession: FakeSession as unknown as FakeNlc['LlamaChatSession'],
  }
}

interface FakeLlama {
  loadModel: jest.Mock
}

function llamaOf(fakeNlc: FakeNlc): Promise<FakeLlama> {
  return fakeNlc.getLlama.mock.results[0].value
}

describe('shared inference engine', () => {
  let configDir: string
  let modelPath: string
  beforeEach(() => {
    jest.mocked(freemem).mockReturnValue(16 * 1024 ** 3)
    configDir = useTempConfig()
    modelPath = join(configDir, 'fake-qwen.gguf')
    writeFileSync(modelPath, 'test weights')
    _resetSharedEngineForTests()
    registerModel({
      id: 'qwen-test',
      name: 'Qwen Test',
      uri: 'hf:Qwen/Qwen2.5-Coder-0.5B-Instruct:q4_k_m',
      license: 'apache-2.0',
      filePath: modelPath,
      downloadedAt: Date.now(),
      sizeBytes: 1000,
    })
  })

  afterEach(() => {
    unregisterModel('qwen-test')
    cleanup(configDir)
    delete process.env.RN_VECTALON_CONFIG_DIR
  })

  it.each(['maxTokens', 'abort', 'customStopTrigger'])('retains native termination %s without rewriting output', async reason => {
    mockDynamicImport.mockResolvedValue(buildFakeNlc(reason))
    const result = await runInference('qwen-test', { prompt: 'code' })
    expect(result).toMatchObject({ content: 'engine reused', stopReason: reason })
  })

  it('creates the llama + model exactly once and reuses them across inferences', async () => {
    const fakeNlc = buildFakeNlc()
    mockDynamicImport.mockResolvedValue(fakeNlc)

    const first = await runInference('qwen-test', { prompt: 'first' })
    const second = await runInference('qwen-test', { prompt: 'second' })
    const third = await runInference('qwen-test', { prompt: 'third' })

    expect(first.content).toBe('engine reused')
    expect(first.stopReason).toBe('eogToken')
    expect(first.artifact).toEqual({ sha256: createHash('sha256').update('test weights').digest('hex'),
      sizeBytes: 12, source: 'local-file-at-load' })
    expect(second.artifact).toEqual(first.artifact)
    expect(second.artifact).not.toBe(first.artifact)
    expect(JSON.stringify(first.artifact)).not.toContain(modelPath)
    expect(second.content).toBe('engine reused')
    expect(third.content).toBe('engine reused')
    expect(fakeNlc.getLlama).toHaveBeenCalledTimes(1)
    const llama = await llamaOf(fakeNlc)
    expect(llama.loadModel).toHaveBeenCalledTimes(1)
  })

  it('allocates only the formatted input plus output reserve and keeps original chat messages', async () => {
    const fake = buildFakeNlc()
    mockDynamicImport.mockResolvedValue(fake)
    await runInference('qwen-test', { systemPrompt: 'keep all instructions', prompt: 'keep all source', maxTokens: 2048 })
    const loaded = await (await llamaOf(fake)).loadModel.mock.results[0].value
    expect(loaded.createContext).toHaveBeenCalledWith({ contextSize: 2560, batchSize: 128 })
    const wrapper = fake.resolveChatWrapper.mock.results[0].value
    expect(wrapper.generateContextState.mock.calls[0][0].chatHistory).toEqual([
      { type: 'system', text: 'keep all instructions' }, { type: 'user', text: 'keep all source' }, { type: 'model', response: [] },
    ])
  })

  it('refuses oversized input rather than allocating a large context or dropping source', async () => {
    const fake = buildFakeNlc('eogToken', 15000)
    mockDynamicImport.mockResolvedValue(fake)
    await expect(runInference('qwen-test', { prompt: 'oversize' })).rejects.toThrow('context budget')
    const loaded = await (await llamaOf(fake)).loadModel.mock.results[0].value
    expect(loaded.createContext).not.toHaveBeenCalled()
  })

  it('refuses low free RAM before native model loading', async () => {
    const fake = buildFakeNlc()
    mockDynamicImport.mockResolvedValue(fake)
    jest.mocked(freemem).mockReturnValue(1024 ** 3)
    await expect(runInference('qwen-test', { prompt: 'small' })).rejects.toThrow('free RAM')
    expect(fake.getLlama).not.toHaveBeenCalled()
  })

  it('rechecks free RAM after loading before allocating context', async () => {
    const fake = buildFakeNlc()
    mockDynamicImport.mockResolvedValue(fake)
    jest.mocked(freemem).mockReturnValueOnce(16 * 1024 ** 3).mockReturnValueOnce(1024 ** 3)
    await expect(runInference('qwen-test', { prompt: 'small' })).rejects.toThrow('context reserve')
    const loaded = await (await llamaOf(fake)).loadModel.mock.results[0].value
    expect(loaded.createContext).not.toHaveBeenCalled()
  })

  it('rejects a smaller-than-requested native allocation and releases it', async () => {
    const fake = buildFakeNlc()
    const getEngine = fake.getLlama
    const dispose = jest.fn()
    fake.getLlama = jest.fn(async () => {
      const engine = await getEngine()
      const load = engine.loadModel
      engine.loadModel = jest.fn(async () => {
        const model = await load()
        model.createContext.mockResolvedValue({ contextSize: 1024, dispose, getSequence: jest.fn() })
        return model
      })
      return engine
    })
    mockDynamicImport.mockResolvedValue(fake)
    await expect(runInference('qwen-test', { prompt: 'small' })).rejects.toThrow('does not satisfy')
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('refuses a model chat wrapper that would discard system instructions', async () => {
    const fake = buildFakeNlc()
    fake.resolveChatWrapper.mockReturnValue({ settings: { supportsSystemMessages: false } })
    mockDynamicImport.mockResolvedValue(fake)
    await expect(runInference('qwen-test', { systemPrompt: 'must preserve', prompt: 'small' })).rejects.toThrow('cannot preserve')
  })

  it('does not load an already-canceled request and forwards cancellation to native prompt evaluation', async () => {
    const fake = buildFakeNlc()
    mockDynamicImport.mockResolvedValue(fake)
    const canceled = new AbortController()
    canceled.abort(new Error('canceled'))
    await expect(runInference('qwen-test', { prompt: 'small', signal: canceled.signal })).rejects.toThrow('canceled')
    expect(fake.getLlama).not.toHaveBeenCalled()
    const controller = new AbortController()
    const prompt = jest.fn(async (_text: string, _options?: Record<string, unknown>) => ({ responseText: 'code', stopReason: 'eogToken' }))
    fake.LlamaChatSession = class { promptWithMeta = prompt }
    await runInference('qwen-test', { prompt: 'small', signal: controller.signal })
    expect(prompt.mock.calls[0][1]?.signal).toBe(controller.signal)
  })

  it('supports existing 8192-output callers when the complete formatted input fits', async () => {
    mockDynamicImport.mockResolvedValue(buildFakeNlc())
    const result = await runInference('qwen-test', { prompt: 'small', maxTokens: 8192 })
    expect(result.localContext).toEqual({ inputTokens: 32, maxOutputTokens: 8192, contextSize: 8704, batchSize: 128 })
  })

  it.each([0, -1, NaN, Infinity, 1.5, 16129])('refuses invalid output budgets before loading (%s)', async maxTokens => {
    const fake = buildFakeNlc()
    mockDynamicImport.mockResolvedValue(fake)
    await expect(runInference('qwen-test', { prompt: 'small', maxTokens })).rejects.toThrow('output token budget')
    expect(fake.getLlama).not.toHaveBeenCalled()
  })

  it('releases allocated context if session construction fails, allowing a later retry', async () => {
    const fake = buildFakeNlc()
    const working = fake.LlamaChatSession
    fake.LlamaChatSession = class { constructor() { throw new Error('session failed') } promptWithMeta = jest.fn() }
    mockDynamicImport.mockResolvedValue(fake)
    await expect(runInference('qwen-test', { prompt: 'small' })).rejects.toThrow('session failed')
    const loaded = await (await llamaOf(fake)).loadModel.mock.results[0].value
    expect((await loaded.createContext.mock.results[0].value).dispose).toHaveBeenCalledTimes(1)
    fake.LlamaChatSession = working
    await expect(runInference('qwen-test', { prompt: 'retry' })).resolves.toHaveProperty('content')
  })

  it('refuses concurrent native allocations and context shifting', async () => {
    const fake = buildFakeNlc()
    let release!: () => void
    let entered!: () => void
    const ready = new Promise<void>(resolve => { entered = resolve })
    const wait = new Promise<void>(resolve => { release = resolve })
    let shift!: () => never
    fake.LlamaChatSession = class {
      constructor(options: unknown) { shift = (options as { contextShift: { strategy: () => never } }).contextShift.strategy }
      promptWithMeta = async () => { entered(); await wait; return { responseText: 'code', stopReason: 'eogToken' } }
    }
    mockDynamicImport.mockResolvedValue(fake)
    const first = runInference('qwen-test', { prompt: 'first' })
    await ready
    try {
      await expect(runInference('qwen-test', { prompt: 'second' })).rejects.toThrow('already active')
      expect(() => shift()).toThrow('Context shift refused')
    } finally { release(); await first }
  })

  it('forwards onTextChunk into the session prompt options', async () => {
    const fakeNlc = buildFakeNlc()
    mockDynamicImport.mockResolvedValue(fakeNlc)

    const chunks: string[] = []
    await runInference('qwen-test', {
      prompt: 'write code',
      onTextChunk: chunk => chunks.push(chunk),
    })

    expect(chunks).toEqual(['streamed part ', 'two'])
  })

  it.each([undefined, false] as const)('changes only repetition penalties for an explicit diagnostic override (%s)', async repeatPenalty => {
    const fakeNlc = buildFakeNlc()
    const prompt = jest.fn(async (_text: string, _options?: Record<string, unknown>) => ({ responseText: 'code', stopReason: 'eogToken' }))
    fakeNlc.LlamaChatSession = class { promptWithMeta = prompt }
    mockDynamicImport.mockResolvedValue(fakeNlc)
    await runInference('qwen-test', { prompt: 'write code', repeatPenalty })
    expect(prompt.mock.calls[0][1]).toMatchObject({ temperature: 0.2, maxTokens: 2048, minP: 0.05,
      repeatPenalty: repeatPenalty === false ? false : { penalty: 1.1, lastTokens: 512, frequencyPenalty: 0.3, presencePenalty: 0.2 } })
  })

  it('rejects a replaced file instead of attaching its hash to the cached model', async () => {
    mockDynamicImport.mockResolvedValue(buildFakeNlc())
    await runInference('qwen-test', { prompt: 'first' })
    writeFileSync(modelPath, 'different weights')
    await expect(runInference('qwen-test', { prompt: 'second' })).rejects.toThrow('Loaded model artifact changed')
  })

  it('rejects empty model files before native loading', async () => {
    const fakeNlc = buildFakeNlc()
    mockDynamicImport.mockResolvedValue(fakeNlc)
    writeFileSync(modelPath, '')
    await expect(runInference('qwen-test', { prompt: 'first' })).rejects.toThrow('non-empty file')
    expect((await llamaOf(fakeNlc)).loadModel).not.toHaveBeenCalled()
  })

  it('disposes a model changed during loading and permits a fresh retry', async () => {
    const fakeNlc = buildFakeNlc()
    const dispose = jest.fn()
    const originalEngine = fakeNlc.getLlama
    fakeNlc.getLlama = jest.fn(async () => {
      const engine = await originalEngine()
      engine.loadModel.mockImplementationOnce(async () => {
        writeFileSync(modelPath, 'changed during load')
        return { dispose }
      })
      return engine
    })
    mockDynamicImport.mockResolvedValue(fakeNlc)
    await expect(runInference('qwen-test', { prompt: 'first' })).rejects.toThrow('changed during load')
    expect(dispose).toHaveBeenCalledTimes(1)
    const retry = await runInference('qwen-test', { prompt: 'retry' })
    expect(retry.artifact?.sha256).toBe(createHash('sha256').update('changed during load').digest('hex'))
  })

  it('rejects output if the file changes during inference', async () => {
    mockDynamicImport.mockResolvedValue(buildFakeNlc())
    await expect(runInference('qwen-test', { prompt: 'first',
      onTextChunk: () => writeFileSync(modelPath, 'changed during inference'),
    })).rejects.toThrow('changed during inference')
  })

  it('omits onTextChunk when not provided (no crash, single response)', async () => {
    const fakeNlc = buildFakeNlc()
    mockDynamicImport.mockResolvedValue(fakeNlc)
    const result = await runInference('qwen-test', { prompt: 'plain call' })
    expect(result.content).toBe('engine reused')
  })

  it('resets the cache when the engine fails to load, so a later call can retry', async () => {
    // First engine creation fails at getLlama (native binding broken) — the
    // cached promise must not poison the singleton for the rest of the process.
    const broken = buildFakeNlc()
    broken.getLlama.mockRejectedValueOnce(new Error('native binding broken'))
    mockDynamicImport.mockResolvedValue(broken)
    await expect(runInference('qwen-test', { prompt: 'one' })).rejects.toThrow(/Inference failed/)

    // Retry with a working engine — the cache was reset, so this creates a
    // fresh one and succeeds.
    const fakeNlc = buildFakeNlc()
    mockDynamicImport.mockResolvedValue(fakeNlc)
    const result = await runInference('qwen-test', { prompt: 'retry' })
    expect(result.content).toBe('engine reused')
    expect(fakeNlc.getLlama).toHaveBeenCalledTimes(1)
    // The broken attempt's llama was never cached; only the working one exists.
    expect(broken.getLlama).toHaveBeenCalledTimes(1)
  })
})
