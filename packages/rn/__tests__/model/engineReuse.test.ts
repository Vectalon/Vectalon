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
import { useTempConfig, cleanup } from '../helpers/tmp'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const mockDynamicImport = dynamicImport as jest.Mock

interface FakeNlc {
  getLlama: jest.Mock
  LlamaLogLevel: Record<string, number>
  LlamaChatSession: new (opts: unknown) => {
    promptWithMeta: (prompt: string, opts?: Record<string, unknown>) => Promise<{ responseText: string; stopReason: string }>
  }
}

function buildFakeNlc(stopReason = 'eogToken'): FakeNlc {
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
    promptWithMeta = async (prompt: string, opts?: Record<string, unknown>) => {
      // Mirror node-llama-cpp: invoke onTextChunk per decoded chunk.
      const onTextChunk = opts?.onTextChunk as ((t: string) => void) | undefined
      onTextChunk?.('streamed part ')
      onTextChunk?.('two')
      return { responseText: 'engine reused', stopReason }
    }
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
  let configDir: string
  let modelPath: string
  beforeEach(() => {
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
