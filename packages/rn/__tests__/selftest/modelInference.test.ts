import { runOneCheck } from '../../src/selftest/runner'
import { getFeatureCheck } from '../../src/selftest/catalog'
import { hasDownloadedModel } from '../../src/model/local/ModelStore'

// Deterministic environment: nothing downloaded (per-test override available),
// WASM weights not cached, no API keys. The check must warn with guidance (and
// fail under requireModel) instead of passing on the deterministic stub.
jest.mock('../../src/model/local/ModelStore', () => ({
  hasDownloadedModel: jest.fn(() => false),
}))

jest.mock('../../src/model/local/wasmPresets', () => ({
  wasmCacheReady: jest.fn(() => false),
}))

const mockHasModel = hasDownloadedModel as jest.Mock

const inferenceCheck = getFeatureCheck('model-inference')
const originalFetch = global.fetch
const originalKeys = { openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY }

describe('model-inference check', () => {
  beforeEach(() => {
    mockHasModel.mockReturnValue(false)
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    global.fetch = originalFetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalKeys.openai !== undefined) process.env.OPENAI_API_KEY = originalKeys.openai
    if (originalKeys.anthropic !== undefined) process.env.ANTHROPIC_API_KEY = originalKeys.anthropic
  })

  it('warns honestly when a GGUF model exists but native inference is unavailable (no WASM download)', async () => {
    mockHasModel.mockReturnValue(true)
    const run = await runOneCheck(inferenceCheck!, {}, '/tmp/vectalon-selftest-fixture')
    expect(run.status).toBe('warn')
    // Zero-config is forced off when a GGUF is present, so the stub surfaces
    // (honest warn) instead of a silent WASM download.
    expect(run.detail).toContain('stub')
    expect(run.detail).not.toContain('WASM weights')
  })

  it('warns with guidance when no local model and no WASM weights are available', async () => {
    const run = await runOneCheck(inferenceCheck!, {}, '/tmp/vectalon-selftest-fixture')
    expect(run.status).toBe('warn')
    expect(run.detail).toContain('vectalon pull')
    // The check must never pass on the stub.
    expect(run.status).not.toBe('pass')
  })

  it('fails instead of warning under requireModel', async () => {
    const run = await runOneCheck(inferenceCheck!, { requireModel: true }, '/tmp/vectalon-selftest-fixture')
    expect(run.status).toBe('fail')
    expect(run.detail).toContain('vectalon pull')
  })

  it('warns when a remote provider is requested without an API key', async () => {
    const run = await runOneCheck(
      inferenceCheck!,
      { modelProvider: 'openai' },
      '/tmp/vectalon-selftest-fixture'
    )
    expect(run.status).toBe('warn')
    expect(run.detail).toContain('OPENAI_API_KEY')
  })

  it('passes with real remote output when the API key is set and the API responds', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ choices: [{ message: { content: 'vectalon' } }], usage: {} }),
    }) as unknown as typeof fetch

    const run = await runOneCheck(inferenceCheck!, { modelProvider: 'openai' }, '/tmp/vectalon-selftest-fixture')
    expect(run.status).toBe('pass')
    expect(run.detail).toContain('model output')
    expect(run.detail).toContain('openai')
  })

  it('fails honestly when the remote API returns an error', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
    }) as unknown as typeof fetch

    const run = await runOneCheck(inferenceCheck!, { modelProvider: 'openai' }, '/tmp/vectalon-selftest-fixture')
    expect(run.status).toBe('fail')
    expect(run.detail).toContain('OpenAI API error')
  })
})
