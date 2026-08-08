/**
 * Minimal HTTP client for the vectalon MCP server (`vectalon serve
 * --protocol http`). Talks JSON over the existing REST surface — no new
 * backend: GET /tools for discovery, POST /call for tool invocation.
 *
 * Deliberately free of any `vscode` import so the module is unit-testable in
 * the host repo and reusable from web dashboards / JetBrains plugins.
 */

export interface AgentTool {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
}

export interface ToolResult {
  id?: string
  content: string
  isError?: boolean
}

/** One deep-health check from GET /health. */
export interface HealthCheck {
  name: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
}

/** Structured /health response (P0-4). */
export interface HealthReport {
  status: 'healthy' | 'degraded' | 'critical'
  checks: HealthCheck[]
  timestamp?: number
  version?: string
}

export interface McpClientOptions {
  /** fetch-compatible implementation (injected for tests). */
  fetch?: typeof fetch
  /** Timeout in ms for a single HTTP request. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000

export class McpHttpClient {
  private baseUrl: string
  private fetchImpl: typeof fetch
  private timeoutMs: number

  constructor(baseUrl: string, options: McpClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.fetchImpl = options.fetch || globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /** GET /tools — true when the server is reachable and MCP is running. */
  async ping(): Promise<boolean> {
    try {
      const tools = await this.listTools()
      return Array.isArray(tools)
    } catch {
      return false
    }
  }

  /**
   * Fast reachability check with a short override timeout (P0-8): used before
   * guardrail runs so a down server skips silently instead of hanging the
   * editor on a 15s request timeout.
   */
  async pingQuick(timeoutMs = 2_000): Promise<boolean> {
    try {
      await this.request<unknown>('/tools', { method: 'GET' }, timeoutMs)
      return true
    } catch {
      return false
    }
  }

  /** GET /tools — the advertised tool list. */
  async listTools(): Promise<AgentTool[]> {
    const data = await this.request<{ tools?: unknown }>('/tools', { method: 'GET' })
    if (!data || !Array.isArray(data.tools)) {
      throw new Error('Unexpected /tools response shape')
    }
    return data.tools as AgentTool[]
  }

  /**
   * GET /health — the deep health report (healthy | degraded | critical +
   * checks[]). Returns null when the server predates the endpoint (404).
   */
  async getHealth(): Promise<HealthReport | null> {
    try {
      const data = await this.request<HealthReport>('/health', { method: 'GET' })
      if (!data || !Array.isArray(data.checks) || typeof data.status !== 'string') {
        return null
      }
      return data
    } catch {
      return null
    }
  }

  /** POST /call — invoke a tool with the given arguments. */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    const data = await this.request<ToolResult>('/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args }),
    })
    if (!data || typeof data.content !== 'string') {
      throw new Error(`Unexpected /call response for tool "${name}"`)
    }
    return data
  }

  private async request<T>(path: string, init: RequestInit, timeoutMs?: number): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`${path} failed with HTTP ${response.status}`)
      }
      return (await response.json()) as T
    } finally {
      clearTimeout(timer)
    }
  }
}
