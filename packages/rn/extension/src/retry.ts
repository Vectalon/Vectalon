/**
 * Retry with exponential backoff — pure helpers for the extension's
 * connection resilience (P0-8). Deliberately vscode-free so the schedule and
 * the retry loop are unit-testable in the host repo.
 */

/** Exponential backoff delays (ms) for `attempts` total tries (1 + retries). */
export function backoffDelays(attempts: number, baseMs = 1_000): number[] {
  const delays: number[] = []
  for (let i = 0; i < Math.max(0, attempts - 1); i++) {
    delays.push(baseMs * 2 ** i)
  }
  return delays
}

export interface WithRetriesOptions {
  /** Total attempts (default 3). */
  attempts?: number
  /** Explicit backoff delays between attempts (default exponential). */
  delays?: number[]
  /** Base ms for the exponential schedule (default 1000). */
  baseMs?: number
  /** Sleep implementation (injectable for tests; defaults to setTimeout). */
  sleep?: (ms: number) => Promise<void>
  /** Human-readable label for logs. */
  label?: string
  /** Optional logger. */
  log?: (message: string) => void
  /** Whether a failure is retryable at all (default: always). */
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

/**
 * Run `fn` up to `attempts` times, waiting `delays[i]` ms between tries.
 * Returns the first success; throws the last error when all attempts fail.
 */
export async function withRetries<T>(
  fn: () => Promise<T>,
  options: WithRetriesOptions = {}
): Promise<T> {
  const attempts = options.attempts ?? 3
  const delays = options.delays ?? backoffDelays(attempts, options.baseMs ?? 1_000)
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const log = options.log

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const retryable = options.shouldRetry ? options.shouldRetry(error, attempt) : true
      const delay = delays[attempt - 1]
      if (attempt < attempts && retryable && delay !== undefined) {
        log?.(`${options.label ?? 'operation'} attempt ${attempt}/${attempts} failed (${error instanceof Error ? error.message : String(error)}) — retrying in ${delay}ms`)
        await sleep(delay)
      } else {
        if (attempt < attempts && !retryable) {
          log?.(`${options.label ?? 'operation'} attempt ${attempt}/${attempts} failed with a non-retryable error — giving up`)
        }
        break
      }
    }
  }
  throw lastError
}

/** Bound a promise with a wall-clock timeout; rejects with a clear error. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}
