import { backoffDelays, withRetries, withTimeout } from '../../extension/src/retry'

describe('backoffDelays', () => {
  it('produces exponential delays for attempts-1 retries', () => {
    expect(backoffDelays(3)).toEqual([1000, 2000])
    expect(backoffDelays(4)).toEqual([1000, 2000, 4000])
    expect(backoffDelays(1)).toEqual([])
    expect(backoffDelays(0)).toEqual([])
  })

  it('honors a custom base delay', () => {
    expect(backoffDelays(3, 500)).toEqual([500, 1000])
  })
})

describe('withRetries', () => {
  it('succeeds on the first attempt', async () => {
    const fn = jest.fn(async () => 'ok')
    await expect(withRetries(fn, { attempts: 3 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries with backoff until success', async () => {
    const sleeps: number[] = []
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValue('third time') as unknown as () => Promise<string>
    const result = await withRetries(fn, {
      attempts: 3,
      delays: [10, 20],
      sleep: async ms => {
        sleeps.push(ms)
      },
    })
    expect(result).toBe('third time')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([10, 20])
  })

  it('throws the last error when all attempts fail', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always down'))
    await expect(
      withRetries(fn, { attempts: 3, delays: [1, 1], sleep: async () => undefined })
    ).rejects.toThrow('always down')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('stops early on a non-retryable error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('4xx'))
    await expect(
      withRetries(fn, {
        attempts: 3,
        delays: [1, 1],
        sleep: async () => undefined,
        shouldRetry: () => false,
      })
    ).rejects.toThrow('4xx')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('withTimeout', () => {
  it('resolves when the promise wins the race', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1_000)).resolves.toBe('done')
  })

  it('rejects with a clear message on timeout', async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 10, 'guardrail check')
    ).rejects.toThrow('guardrail check timed out after 10ms')
  })
})
