import {
  shouldSuppressStderrLine,
  couldBecomeNoiseLine,
  withSuppressedTokenizerWarnings,
  installStderrNoiseFilter,
  _resetStderrNoiseFilterForTests,
} from '../../src/model/local/inference'

/**
 * Temporarily point process.stderr at a capture function, run `fn`, and return
 * what was captured. Unlike jest.spyOn this does NOT replace the writer the
 * noise filter captured at install time — so filter tests observe the filter
 * actually forwarding (or swallowing) lines.
 */
function captureThroughCurrentWriter(fn: () => void): string[] {
  const writes: string[] = []
  const original = process.stderr.write
  process.stderr.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'))
    return true
  }) as typeof process.stderr.write
  try {
    fn()
  } finally {
    process.stderr.write = original
  }
  return writes
}

describe('tokenizer warning suppression', () => {
  it('classifies the Qwen "control-looking token" notice as suppressible', () => {
    const line = "[node-llama-cpp] load: control-looking token: 128247 '</s>' was not control-type; this is probably a bug in the model. its type will be overridden"
    expect(shouldSuppressStderrLine(line)).toBe(true)
  })

  it('lets every other stderr line through', () => {
    expect(shouldSuppressStderrLine('ERROR: inference failed')).toBe(false)
    expect(shouldSuppressStderrLine('llama_model_load: loading model')).toBe(false)
  })

  it('swallows suppressible stderr writes while the task runs and forwards the rest', async () => {
    const writes: string[] = []
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'))
      return true
    })
    try {
      await withSuppressedTokenizerWarnings(async () => {
        process.stderr.write("control-looking token: 128247 '</s>' was not control-type\n")
        process.stderr.write('real error line\n')
        return 'done'
      })
    } finally {
      spy.mockRestore()
    }
    expect(writes).toEqual(['real error line\n'])
  })

  it('does not corrupt stderr when suppressions overlap (nested call)', async () => {
    const writes: string[] = []
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'))
      return true
    })
    try {
      await withSuppressedTokenizerWarnings(async () => {
        await withSuppressedTokenizerWarnings(async () => {
          process.stderr.write('nested suppressible line: control-looking token\n')
        })
        process.stderr.write('outer real line\n')
      })
      // After the wrapper, the property must be the mock again (spy restored by
      // the wrapper's finally back to the captured original, which is the spy).
      process.stderr.write('after real line\n')
    } finally {
      spy.mockRestore()
    }
    expect(writes).toEqual(['outer real line\n', 'after real line\n'])
  })

  it('restores the original stderr writer after the task', async () => {
    const original = process.stderr.write
    await withSuppressedTokenizerWarnings(async () => {
      process.stderr.write('inside\n')
    })
    expect(process.stderr.write).toBe(original)
  })
})

describe('permanent stderr noise filter', () => {
  afterEach(() => {
    _resetStderrNoiseFilterForTests()
  })

  it('is idempotent — installing twice is a no-op, reset allows a fresh install', () => {
    const original = process.stderr.write
    try {
      installStderrNoiseFilter()
      const first = process.stderr.write
      installStderrNoiseFilter()
      expect(process.stderr.write).toBe(first)
      _resetStderrNoiseFilterForTests()
      installStderrNoiseFilter()
      expect(process.stderr.write).not.toBe(first)
      expect(process.stderr.write).not.toBe(original)
    } finally {
      process.stderr.write = original
      _resetStderrNoiseFilterForTests()
    }
  })

  it('swallows tokenizer-noise lines forever and forwards everything else', () => {
    const writes = captureThroughCurrentWriter(() => {
      // The filter captures the current writer at install time — install AFTER
      // the capture writer is in place so the filter forwards into it.
      installStderrNoiseFilter()
      process.stderr.write("load: control-looking token: 128247 '</s>' was not control-type; this is probably a bug in the model. its type will be overridden\n")
      process.stderr.write('real error line\n')
    })
    expect(writes).toEqual(['real error line\n'])
  })

  it('holds noise-candidate partials and releases them once the line completes', () => {
    const writes = captureThroughCurrentWriter(() => {
      installStderrNoiseFilter()
      // A partial that could still become the noise line is held back...
      process.stderr.write('load: control-looking ')
      // ...and once the newline arrives the completed line is suppressed.
      process.stderr.write("token: 128247 '</s>' was not control-type\n")
      process.stderr.write('keep me\n')
    })
    expect(writes).toEqual(['keep me\n'])
  })

  it('never delays newline-less progress writes (\r-overwrite progress bars)', () => {
    const writes = captureThroughCurrentWriter(() => {
      installStderrNoiseFilter()
      // pull.ts updates a progress line with \r and no newline — the filter
      // must not buffer these or the progress bar would freeze.
      process.stderr.write('\r  Progress: 42% (42 / 100 MB)')
      process.stderr.write('\r  Progress: 85% (85 / 100 MB)')
      process.stderr.write('\n')
    })
    expect(writes).toEqual([
      '\r  Progress: 42% (42 / 100 MB)',
      '\r  Progress: 85% (85 / 100 MB)',
      '\n',
    ])
  })

  it('drops a noise line that arrives without its trailing newline', () => {
    const writes = captureThroughCurrentWriter(() => {
      installStderrNoiseFilter()
      // The full pattern can be present before the \n arrives; the filter must
      // not forward the partial just because no suffix matches a pattern prefix
      // (the matching suffix is longer than the pattern itself).
      process.stderr.write("load: control-looking token: 128247 '</s>' was not control-type")
      process.stderr.write('\n')
    })
    expect(writes).toEqual(['\n'])
  })

  it('flushes a newline-less partial that merely ends in a pattern prefix once it grows long', () => {
    // Ends in 'c' (a single-char pattern prefix) so it is a noise candidate
    // and held at first — but it is far longer than any noise line, so the
    // length cap flushes it immediately instead of batching forever.
    const longLine = '\r  Building assets... ' + 'a'.repeat(300) + ' c'
    const writes = captureThroughCurrentWriter(() => {
      installStderrNoiseFilter()
      process.stderr.write(longLine)
    })
    expect(writes).toEqual([longLine])
  })

  it('catches noise written AFTER a per-inference wrapper has already returned (the race)', async () => {
    const writes = captureThroughCurrentWriter(() => {
      installStderrNoiseFilter()
      void withSuppressedTokenizerWarnings(async () => 'done')
      // The old per-inference patch restored stderr before the native addon
      // dispatched its async log line, so the noise escaped. The permanent
      // filter installed before the inference stays active afterwards.
      process.stderr.write("control-looking token: 128247 '</s>' was not control-type; this is probably a bug in the model. its type will be overridden\n")
    })
    expect(writes).toEqual([])
  })

  it('never filters real diagnostics', () => {
    const writes = captureThroughCurrentWriter(() => {
      installStderrNoiseFilter()
      process.stderr.write('ERROR: inference failed\n')
      process.stderr.write('llama_model_load: loading model\n')
    })
    expect(writes).toEqual(['ERROR: inference failed\n', 'llama_model_load: loading model\n'])
  })

  it('suppresses a held noise partial at process exit instead of printing it', () => {
    const writes = captureThroughCurrentWriter(() => {
      installStderrNoiseFilter()
      // A split noise line whose tail never arrives: the held partial must be
      // dropped on exit, not written raw (which would leak the noise).
      process.stderr.write("load: control-looking token: 128247 '</s>' was not")
      process.emit('beforeExit')
    })
    expect(writes).toEqual([])
  })

  it('drops a held non-noise partial at exit rather than printing an unterminated line', () => {
    const writes = captureThroughCurrentWriter(() => {
      installStderrNoiseFilter()
      // Held because it ends in a pattern-prefix char; at exit it is an
      // unterminated line fragment, so it is dropped rather than written raw.
      process.stderr.write('\r  Downloading model... c')
      process.emit('beforeExit')
    })
    expect(writes).toEqual([])
  })
})

describe('noise-candidate classification', () => {
  it('flags partials that could grow into the noise line', () => {
    expect(couldBecomeNoiseLine('load: control-')).toBe(true)
    expect(couldBecomeNoiseLine('control-l')).toBe(true)
    expect(couldBecomeNoiseLine('something control-looking toke')).toBe(true)
  })

  it('lets non-candidate partials pass', () => {
    expect(couldBecomeNoiseLine('\r  Progress: 42% (42 / 100 MB)')).toBe(false)
    expect(couldBecomeNoiseLine('real partial line without newline')).toBe(false)
    expect(couldBecomeNoiseLine('')).toBe(false)
  })
})
