import {
  createLlamaLogFilter,
  shouldSuppressStderrLine,
  couldBecomeNoiseLine,
  NOISE_PATTERN,
} from '../../src/model/local/llamaLog'

const NOISE_LINE =
  "load: control-looking token: 128247 '</s>' was not control-type; this is probably a bug in the model. its type will be overridden"

describe('shared noise classification (llamaLog)', () => {
  it('classifies the Qwen control-looking-token notice as suppressible', () => {
    expect(shouldSuppressStderrLine(NOISE_LINE)).toBe(true)
  })

  it('lets every other log line through', () => {
    expect(shouldSuppressStderrLine('llama_model_load: loading model')).toBe(false)
    expect(shouldSuppressStderrLine('ERROR: inference failed')).toBe(false)
  })

  it('flags partials that could grow into the noise line', () => {
    expect(couldBecomeNoiseLine('load: control-')).toBe(true)
    expect(couldBecomeNoiseLine('something control-looking toke')).toBe(true)
  })

  it('lets non-candidate partials pass', () => {
    expect(couldBecomeNoiseLine('\\r  Progress: 42% (42 / 100 MB)')).toBe(false)
    expect(couldBecomeNoiseLine('')).toBe(false)
  })

  it('exposes the shared pattern constant', () => {
    expect(NOISE_PATTERN).toBe('control-looking token')
  })
})

describe('createLlamaLogFilter', () => {
  const originalEnv = process.env.VECTALON_DEBUG
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VECTALON_DEBUG
    else process.env.VECTALON_DEBUG = originalEnv
  })

  it('drops the known-harmless tokenizer noise entirely (no re-emission)', () => {
    const errors: string[] = []
    const warnings: string[] = []
    const infos: string[] = []
    const filter = createLlamaLogFilter()
    const spyError = jest.spyOn(console, 'error').mockImplementation(m => errors.push(String(m)))
    const spyWarn = jest.spyOn(console, 'warn').mockImplementation(m => warnings.push(String(m)))
    const spyInfo = jest.spyOn(console, 'info').mockImplementation(m => infos.push(String(m)))
    try {
      filter('warn', NOISE_LINE)
    } finally {
      spyError.mockRestore()
      spyWarn.mockRestore()
      spyInfo.mockRestore()
    }
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(infos).toEqual([])
  })

  it('re-emits errors and warnings with the prefix at their real severity', () => {
    const errors: string[] = []
    const warnings: string[] = []
    const filter = createLlamaLogFilter()
    const spyError = jest.spyOn(console, 'error').mockImplementation(m => errors.push(String(m)))
    const spyWarn = jest.spyOn(console, 'warn').mockImplementation(m => warnings.push(String(m)))
    try {
      filter('error', 'llama_new_context_with_model: failed')
      filter('warn', 'using fallback CPU path')
    } finally {
      spyError.mockRestore()
      spyWarn.mockRestore()
    }
    expect(errors).toEqual(['[node-llama-cpp] llama_new_context_with_model: failed'])
    expect(warnings).toEqual(['[node-llama-cpp] using fallback CPU path'])
  })

  it('silences info/log/debug chatter unless VECTALON_DEBUG=1', () => {
    const calls: string[] = []
    const filter = createLlamaLogFilter()
    const spyInfo = jest.spyOn(console, 'info').mockImplementation(m => calls.push(String(m)))

    try {
      filter('info', 'llama_model_load: loaded 48.1 MiB')
      expect(calls).toEqual([])

      process.env.VECTALON_DEBUG = '1'
      filter('info', 'llama_model_load: loaded 48.1 MiB')
      expect(calls).toEqual(['[node-llama-cpp] llama_model_load: loaded 48.1 MiB'])
    } finally {
      spyInfo.mockRestore()
    }
  })

  it('handles unknown levels defensively (treats them as info)', () => {
    const calls: string[] = []
    const filter = createLlamaLogFilter()
    const spyInfo = jest.spyOn(console, 'info').mockImplementation(m => calls.push(String(m)))
    try {
      process.env.VECTALON_DEBUG = '1'
      filter('bogus-level' as string, 'something odd')
      expect(calls).toEqual(['[node-llama-cpp] something odd'])
    } finally {
      spyInfo.mockRestore()
    }
  })

  it('honors a custom prefix', () => {
    const errors: string[] = []
    const filter = createLlamaLogFilter({ prefix: '[llama]' })
    const spyError = jest.spyOn(console, 'error').mockImplementation(m => errors.push(String(m)))
    try {
      filter('error', 'boom')
    } finally {
      spyError.mockRestore()
    }
    expect(errors).toEqual(['[llama] boom'])
  })
})
