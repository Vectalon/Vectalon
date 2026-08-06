import type { WebFetcher } from './types'

const DEFAULT_TIMEOUT_MS = 15_000

export class FetchWebFetcher implements WebFetcher {
  private timeoutMs: number

  constructor(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs
  }

  async fetch(url: string): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html, application/json, text/plain, */*',
          'User-Agent': 'rn-vectalon knowledge refresh',
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.text()
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeoutMs}ms: ${url}`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}

export class StubWebFetcher implements WebFetcher {
  private responses: Map<string, string>

  constructor(responses: Record<string, string> = {}) {
    this.responses = new Map(Object.entries(responses))
  }

  setResponse(url: string, content: string): void {
    this.responses.set(url, content)
  }

  removeResponse(url: string): void {
    this.responses.delete(url)
  }

  async fetch(url: string): Promise<string> {
    const content = this.responses.get(url)
    if (content === undefined) {
      throw new Error(`No stub response for ${url}`)
    }
    return content
  }
}

export function createDefaultFetcher(): WebFetcher {
  if (process.env.NODE_ENV === 'test' || process.env.RN_VECTALON_STUB_FETCH) {
    return new StubWebFetcher()
  }
  return new FetchWebFetcher()
}
