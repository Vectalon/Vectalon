import { safe, safeAsync, bestEffort, bestEffortAsync, ok, err, toError, reportError } from '../../src/utils/safe'

const boom = (): never => {
  throw new Error('boom')
}

describe('safe()', () => {
  it('returns ok with the value when fn succeeds', () => {
    const result = safe(() => 42)
    expect(result).toEqual({ ok: true, value: 42 })
  })

  it('returns err with a normalized Error when fn throws', () => {
    const result = safe(boom)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error)
      expect(result.error.message).toBe('boom')
    }
  })

  it('never throws even when the thrown value is not an Error', () => {
    const result = safe(() => {
      throw 'string error'
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe('string error')
    }
  })
})

describe('safeAsync()', () => {
  it('resolves ok with the value', async () => {
    const result = await safeAsync(async () => 'value')
    expect(result).toEqual({ ok: true, value: 'value' })
  })

  it('resolves err when the promise rejects', async () => {
    const result = await safeAsync(async () => {
      throw new Error('async boom')
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('async boom')
  })
})

describe('bestEffort()', () => {
  it('returns the value on success', () => {
    expect(bestEffort(() => 1, 'ctx')).toBe(1)
  })

  it('returns undefined on failure without throwing', () => {
    expect(bestEffort(boom, 'ctx')).toBeUndefined()
  })
})

describe('bestEffortAsync()', () => {
  it('returns the value on success', async () => {
    expect(await bestEffortAsync(async () => 'x', 'ctx')).toBe('x')
  })

  it('returns undefined on failure without rejecting', async () => {
    expect(await bestEffortAsync(async () => {
      throw new Error('nope')
    }, 'ctx')).toBeUndefined()
  })
})

describe('ok() / err()', () => {
  it('builds tagged results', () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 })
    const e = new Error('x')
    expect(err(e)).toEqual({ ok: false, error: e })
  })
})

describe('toError()', () => {
  it('passes Errors through unchanged', () => {
    const e = new Error('same')
    expect(toError(e)).toBe(e)
  })

  it('wraps non-Error throws', () => {
    expect(toError(undefined).message).toBe('undefined')
    expect(toError({ code: 7 }).message).toBe('[object Object]')
  })
})

describe('reportError()', () => {
  const originalWrite = process.stderr.write
  const originalDebugEnv = process.env.VECTALON_DEBUG

  function captureStderr(): string[] {
    const lines: string[] = []
    // The logger writes to process.stderr.write; route it into a buffer.
    process.stderr.write = ((chunk: unknown) => {
      lines.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    return lines
  }

  afterEach(() => {
    process.stderr.write = originalWrite
    if (originalDebugEnv === undefined) delete process.env.VECTALON_DEBUG
    else process.env.VECTALON_DEBUG = originalDebugEnv
  })

  it('logs a contextual message with the error text', () => {
    const lines = captureStderr()
    process.env.VECTALON_DEBUG = '1'
    reportError(new Error('kaboom'), 'module: doing a thing')
    expect(lines.some(l => l.includes('module: doing a thing: kaboom'))).toBe(true)
  })

  it('normalizes non-Error throws before logging', () => {
    const lines = captureStderr()
    process.env.VECTALON_DEBUG = '1'
    reportError('plain string', 'ctx')
    expect(lines.some(l => l.includes('ctx: plain string'))).toBe(true)
  })

  it('is silent at debug level unless VECTALON_DEBUG is set', () => {
    const lines = captureStderr()
    delete process.env.VECTALON_DEBUG
    reportError(new Error('quiet'), 'ctx')
    expect(lines).toHaveLength(0)
  })

  it('logs at warn level regardless of VECTALON_DEBUG', () => {
    const lines = captureStderr()
    delete process.env.VECTALON_DEBUG
    reportError(new Error('loud'), 'ctx', 'warn')
    expect(lines.some(l => l.includes('ctx: loud'))).toBe(true)
  })

  it('never throws even when logging fails', () => {
    captureStderr()
    process.stderr.write = (() => {
      throw new Error('stderr broken')
    }) as typeof process.stderr.write
    process.env.VECTALON_DEBUG = '1'
    expect(() => reportError(new Error('x'), 'ctx')).not.toThrow()
  })
})
