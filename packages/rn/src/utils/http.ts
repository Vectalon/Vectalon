/**
 * Shared best-effort HTTP GET helpers with a short timeout — used by the npm
 * maintenance-signals fetcher and the ecosystem catalog registry validation.
 * Every helper never throws: callers branch on null / status codes instead.
 * Business Source License 1.1 (BSL-1.1)
 */

const DEFAULT_TIMEOUT_MS = 3000

/** fetch with an AbortController timeout; never throws (rejects propagate to callers to handle). */
export function fetchWithTimeout(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {}
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  return fetch(url, {
    headers: { 'User-Agent': 'vectalon-rn', Accept: 'application/json', ...(opts.headers || {}) },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))
}

/** Best-effort JSON GET; null on any failure (timeout, non-2xx, parse error). */
export async function fetchJson<T>(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {}
): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url, opts)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}
