import { wasmZeroConfigEnabled } from '../../src/model/zeroConfig'

describe('zero-config WASM gate', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    delete process.env.RN_VECTALON_NO_WASM
  })

  it('is disabled in the test environment so suites never trigger a model download', () => {
    process.env.NODE_ENV = 'test'
    expect(wasmZeroConfigEnabled()).toBe(false)
  })

  it('is disabled when RN_VECTALON_NO_WASM=1 even in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.RN_VECTALON_NO_WASM = '1'
    expect(wasmZeroConfigEnabled()).toBe(false)
  })

  it('is enabled in production when the transformers package resolves', () => {
    process.env.NODE_ENV = 'production'
    expect(wasmZeroConfigEnabled()).toBe(true)
  })
})
