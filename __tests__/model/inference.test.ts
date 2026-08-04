import { shouldSuppressStderrLine, withSuppressedTokenizerWarnings } from '../../src/model/local/inference'

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
