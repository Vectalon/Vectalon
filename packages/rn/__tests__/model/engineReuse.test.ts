/**
 * Shared inference engine — one llama + one model per process, reused across
 * every inference. Regression test for the benchmark symptom: 11 scenarios
 * were calling getLlama() 11 times, leaking beforeExit listeners (the
 * MaxListenersExceededWarning) and reloading the GGUF from disk every run.
 */

jest.mock('../../src/utils/dynamicImport', () => ({
  dynamicImport: jest.fn(),
}))

import { dynamicImport } from '../../src/utils/dynamicImport'
import { runInference, _resetSharedEngineForTests } from '../../src/model/local/inference'
import { registerModel, unregisterModel } from '../../src/model/local/ModelStore'
import { useTempConfig } from '../helpers/tmp'

const mockDynamicImport = dynamicImport as jest.Mock

interface FakeNlc {
  getLlama: jest.Mock
  LlamaLogLevel: Record<string, number>
  LlamaChatSession: new (opts: unknown) => { prompt: () => Promise<string> }
}

function buildFakeNlc(): FakeNlc {
  const getLlama = jest.fn(async () => {
    const loadModel = jest.fn(async () => {
      const createContext = jest.fn(async () => ({
        getSequence: () => ({ tokenize: jest.fn() }),
      }))
      return { createContext }
    })
    return { loadModel }
  })
  const FakeSession = class {
    prompt = async () => 'engine reused'
  }
  return {
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
  beforeEach(() => {
    useTempConfig()
    _resetSharedEngineForTests()
    registerModel({
      id: 'qwen-test',
      name: 'Qwen Test',
      uri: 'hf:Qwen/Qwen2.5-Coder-0.5B-Instruct:q4_k_m',
      license: 'apache-2.0',
      filePath: '/tmp/fake-qwen.gguf',
      downloadedAt: Date.now(),
      sizeBytes: 1000,
    })
  })

  afterEach(() => {
    unregisterModel('qwen-test')
    delete process.env.RN_VECTALON_CONFIG_DIR
  })

  it('creates the llama + model exactly once and reuses them across inferences', async () => {
    const fakeNlc = buildFakeNlc()
    mockDynamicImport.mockResolvedValue(fakeNlc)

    const first = await runInference('qwen-test', { prompt: 'first' })
    const second = await runInference('qwen-test', { prompt: 'second' })
    const third = await runInference('qwen-test', { prompt: 'third' })

    expect(first.content).toBe('engine reused')
    expect(second.content).toBe('engine reused')
    expect(third.content).toBe('engine reused')
    expect(fakeNlc.getLlama).toHaveBeenCalledTimes(1)
    const llama = await llamaOf(fakeNlc)
    expect(llama.loadModel).toHaveBeenCalledTimes(1)
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
