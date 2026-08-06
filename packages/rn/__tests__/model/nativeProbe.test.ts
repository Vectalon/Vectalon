import { LocalProvider } from '../../src/model/providers/LocalProvider'
import { probeNativeModule, isMissingModuleError } from '../../src/model/local/inference'
import { logger } from '../../src/cli/logger'

// Control what the probe's dynamic import does without loading the real
// (heavy, native) node-llama-cpp module in tests.
jest.mock('../../src/utils/dynamicImport', () => ({
  dynamicImport: jest.fn(),
}))
import { dynamicImport } from '../../src/utils/dynamicImport'
const mockDynamicImport = dynamicImport as jest.Mock

describe('probeNativeModule', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('resolves true when node-llama-cpp loads', async () => {
    mockDynamicImport.mockResolvedValue({})
    await expect(probeNativeModule()).resolves.toBe(true)
  })

  it('classifies a missing module as "missing"', async () => {
    mockDynamicImport.mockRejectedValue(Object.assign(new Error("Cannot find module 'node-llama-cpp'"), {
      code: 'MODULE_NOT_FOUND',
    }))
    await expect(probeNativeModule()).resolves.toBe('missing')
  })

  it('classifies the ESM "Cannot find package" shape as missing', async () => {
    // Real Node dynamic-import failure for an absent package (the production
    // scenario this feature targets): code ERR_MODULE_NOT_FOUND, message
    // "Cannot find package '...' imported from ..." — must map to 'missing',
    // not 'failed'.
    mockDynamicImport.mockRejectedValue(Object.assign(new Error("Cannot find package 'node-llama-cpp' imported from /app/dist/x.js"), {
      code: 'ERR_MODULE_NOT_FOUND',
    }))
    await expect(probeNativeModule()).resolves.toBe('missing')
  })

  it('isMissingModuleError recognizes both CJS and ESM missing shapes', () => {
    expect(isMissingModuleError(new Error("Cannot find module 'x'"))).toBe(true)
    expect(
      isMissingModuleError(Object.assign(new Error("Cannot find package 'x' imported from /app/a.js"), { code: 'ERR_MODULE_NOT_FOUND' }))
    ).toBe(true)
    expect(isMissingModuleError(Object.assign(new Error('boom'), { code: 'EACCES' }))).toBe(false)
  })

  it('classifies an installed module that throws as "failed"', async () => {
    mockDynamicImport.mockRejectedValue(new Error('NODE_MODULE_VERSION mismatch: native binding mismatch'))
    await expect(probeNativeModule()).resolves.toBe('failed')
  })

  it('falls back to a resolution check under the jest VM flag error', async () => {
    // Jest's VM rejects the Function-constructor dynamic import with this code
    // even when the module is installed; the probe must not misreport that as
    // a broken native binary.
    mockDynamicImport.mockRejectedValue(Object.assign(new Error('A dynamic import callback was invoked'), {
      code: 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG',
    }))
    const result = await probeNativeModule()
    // node-llama-cpp IS installed in the dev environment -> available.
    expect(result).toBe(true)
  })
})

describe('LocalProvider graceful degrade (optional node-llama-cpp)', () => {
  it('degrades to the deterministic stub with a clear warning when the module is missing', async () => {
    const warns: string[] = []
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation((m: string) => {
      warns.push(m)
    })
    try {
      const provider = new LocalProvider({
        nativeProbe: async () => 'missing' as const,
      })
      const response = await provider.generate({ prompt: 'hello' })
      expect(response.provider).toBe('local')
      expect(response.content).toContain('hello')
      expect(response.content).toContain('node-llama-cpp native module unavailable')
    } finally {
      warnSpy.mockRestore()
    }
    expect(warns.some(w => w.includes('node-llama-cpp') && w.includes('optional dependency'))).toBe(true)
  })

  it('degrades when the module is installed but fails to load', async () => {
    const provider = new LocalProvider({
      nativeProbe: async () => 'failed' as const,
    })
    const response = await provider.generate({ prompt: 'hello' })
    expect(response.content).toContain('node-llama-cpp native module unavailable')
  })

  it('is ready immediately and never attempts native inference without the module', async () => {
    const provider = new LocalProvider({
      nativeProbe: async () => 'missing' as const,
    })
    await provider.initialize()
    expect(provider.isReady()).toBe(true)
    expect(provider.isNativeAvailable()).toBe(false)
    const response = await provider.generate({ prompt: 'hi' })
    expect(response.content).toContain('hi')
    expect(response.content).toContain('Local model fallback')
  })

  it('reports native availability when the probe succeeds', async () => {
    const provider = new LocalProvider({
      nativeProbe: async () => true,
    })
    await provider.initialize()
    expect(provider.isNativeAvailable()).toBe(true)
    // No model downloaded -> still falls back, but the message names the
    // no-model cause rather than the native module.
    const response = await provider.generate({ prompt: 'hi' })
    expect(response.content).toContain('no downloaded model')
    expect(response.content).not.toContain('node-llama-cpp native module unavailable')
  })

  it('inlines skills in the fallback even when the module is missing', async () => {
    const provider = new LocalProvider({
      projectRoot: '/tmp/irrelevant',
      nativeProbe: async () => 'missing' as const,
      skillsLoader: (root, systemPrompt) => `${systemPrompt}\n\n## Injected skills\n\nCUSTOM SKILL GUIDANCE`,
    })
    const response = await provider.generate({ prompt: 'hi', systemPrompt: 'base' })
    expect(response.content).toContain('CUSTOM SKILL GUIDANCE')
    expect(response.content).toContain('node-llama-cpp native module unavailable')
  })
})
