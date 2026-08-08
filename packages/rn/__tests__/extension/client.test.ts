import { McpHttpClient } from '../../extension/src/client'
import { portFromUrl, baseUrlFromPort } from '../../extension/src/urls'

/** A tiny fetch mock that routes on method + url. */
function fakeFetch(handler: (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>) {
  return (async (url: unknown, init?: unknown) => handler(String(url), (init || {}) as RequestInit)) as unknown as typeof fetch
}

describe('McpHttpClient', () => {
  it('lists tools from GET /tools', async () => {
    const fetchImpl = fakeFetch(async (url, init) => {
      expect(init.method).toBe('GET')
      expect(url).toBe('http://localhost:8765/tools')
      return { ok: true, status: 200, json: async () => ({ tools: [{ name: 'get_project_context', description: 'x' }], status: 'running' }) }
    })
    const client = new McpHttpClient('http://localhost:8765/', { fetch: fetchImpl })
    const tools = await client.listTools()
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('get_project_context')
  })

  it('calls a tool via POST /call with JSON body', async () => {
    const fetchImpl = fakeFetch(async (url, init) => {
      expect(url).toBe('http://localhost:8765/call')
      expect(init.method).toBe('POST')
      const body = JSON.parse(String(init.body))
      expect(body).toEqual({ name: 'check_guardrails', arguments: { content: 'x' } })
      return { ok: true, status: 200, json: async () => ({ id: '1', content: '{"ok":true}' }) }
    })
    const client = new McpHttpClient('http://localhost:8765', { fetch: fetchImpl })
    const result = await client.callTool('check_guardrails', { content: 'x' })
    expect(result.content).toBe('{"ok":true}')
    expect(result.isError).toBeUndefined()
  })

  it('propagates HTTP errors', async () => {
    const fetchImpl = fakeFetch(async () => ({ ok: false, status: 404, json: async () => ({ error: 'nope' }) }))
    const client = new McpHttpClient('http://localhost:8765', { fetch: fetchImpl })
    await expect(client.callTool('nope')).rejects.toThrow(/HTTP 404/)
  })

  it('throws on malformed /tools responses', async () => {
    const fetchImpl = fakeFetch(async () => ({ ok: true, status: 200, json: async () => ({ unexpected: true }) }))
    const client = new McpHttpClient('http://localhost:8765', { fetch: fetchImpl })
    await expect(client.listTools()).rejects.toThrow(/response shape/)
  })

  it('ping returns false when the server is unreachable', async () => {
    const fetchImpl = fakeFetch(async () => {
      throw new Error('ECONNREFUSED')
    })
    const client = new McpHttpClient('http://localhost:1', { fetch: fetchImpl })
    expect(await client.ping()).toBe(false)
  })

  it('pingQuick returns true for a live server and false when down (P0-8)', async () => {
    const alive = fakeFetch(async () => ({ ok: true, status: 200, json: async () => ({ tools: [] }) }))
    expect(await new McpHttpClient('http://localhost:8765', { fetch: alive }).pingQuick(500)).toBe(true)

    const dead = fakeFetch(async () => {
      throw new Error('ECONNREFUSED')
    })
    expect(await new McpHttpClient('http://localhost:1', { fetch: dead }).pingQuick(500)).toBe(false)
  })

  it('surfaces tool-level errors without throwing', async () => {
    const fetchImpl = fakeFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: '1', content: 'Unknown tool: nope', isError: true }),
    }))
    const client = new McpHttpClient('http://localhost:8765', { fetch: fetchImpl })
    const result = await client.callTool('nope')
    expect(result.isError).toBe(true)
  })
})

describe('serverManager helpers', () => {
  it('parses the port from a URL', () => {
    expect(portFromUrl('http://localhost:8765')).toBe(8765)
    expect(portFromUrl('http://localhost:9999/')).toBe(9999)
    expect(portFromUrl('not a url')).toBe(8765)
  })

  it('builds a base URL from a port', () => {
    expect(baseUrlFromPort(8765)).toBe('http://localhost:8765')
  })
})
