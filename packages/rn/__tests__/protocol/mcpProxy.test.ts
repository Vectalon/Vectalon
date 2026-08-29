import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { getEcosystemItem } from '../../src/ecosystem'
import type { EcosystemItem } from '../../src/ecosystem'
import type { McpClientHandle, McpToolDef } from '../../src/protocol/subMcp'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { 'react-native': '0.72.0' },
  }),
}

function stubClient(itemId: string, tools: McpToolDef[]): McpClientHandle & { callTool: jest.Mock } {
  return {
    item: getEcosystemItem(itemId) as EcosystemItem,
    tools,
    start: async () => ({ name: itemId, version: '0' }),
    callTool: jest.fn(async (name: string) => ({ content: `result:${name}`, isError: false })),
    close: jest.fn(),
  }
}

describe('MCPServer sub-MCP proxying', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
    dir = createTempProject(PROJECT)
    configDir = useTempConfig()
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  function createServer(clients: McpClientHandle[] = []) {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    return new MCPServer(engine, router, 'stdio', null, null, clients)
  }

  it('exposes proxied sub-MCP tools namespaced by item id', () => {
    const client = stubClient('metro-mcp', [
      { name: 'get_console_logs', description: 'Read Metro console logs', inputSchema: { type: 'object' } },
      { name: 'get_network_requests', description: 'Inspect network', inputSchema: { type: 'object' } },
    ])
    const server = createServer([client])
    const tools = server.getToolList()
    expect(tools.find(t => t.name === 'metro-mcp__get_console_logs')).toEqual({
      name: 'metro-mcp__get_console_logs',
      description: '[third-party; not Vectalon-qualified: Metro MCP] Read Metro console logs',
      inputSchema: { type: 'object' },
    })
    expect(tools.find(t => t.name === 'metro-mcp__get_network_requests')).toBeDefined()
    // Core tools still present alongside proxied ones.
    expect(tools.find(t => t.name === 'get_project_context')).toBeDefined()
  })

  it('routes namespaced calls to the sub-MCP client with arguments', async () => {
    const client = stubClient('metro-mcp', [
      { name: 'get_console_logs', description: 'd', inputSchema: {} },
    ])
    const server = createServer([client])

    const result = await server.handleToolCall({
      id: '1',
      name: 'metro-mcp__get_console_logs',
      arguments: { limit: 10 },
    })
    expect(result).toEqual({ id: '1', content: 'result:get_console_logs', isError: false })
    expect(client.callTool).toHaveBeenCalledWith('get_console_logs', { limit: 10 })
  })

  it('returns an error result when the sub-MCP call fails', async () => {
    const client = stubClient('metro-mcp', [{ name: 'crash', description: 'd', inputSchema: {} }])
    client.callTool.mockRejectedValue(new Error('connection reset'))
    const server = createServer([client])

    const result = await server.handleToolCall({ id: '1', name: 'metro-mcp__crash', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('connection reset')
  })

  it('reports unknown tools (including unknown namespaced prefixes)', async () => {
    const server = createServer([stubClient('metro-mcp', [{ name: 'x', description: 'd', inputSchema: {} }])])

    const unknown = await server.handleToolCall({ id: '1', name: 'nope', arguments: {} })
    expect(unknown.isError).toBe(true)
    expect(unknown.content).toContain('Unknown tool')

    const unknownNamespace = await server.handleToolCall({ id: '2', name: 'expo-mcp__build_run', arguments: {} })
    expect(unknownNamespace.isError).toBe(true)
    expect(unknownNamespace.content).toContain('Unknown tool')
  })

  it('close() closes every proxied client', () => {
    const a = stubClient('metro-mcp', [])
    const b = stubClient('expo-mcp', [])
    const server = createServer([a, b])
    server.close()
    expect(a.close).toHaveBeenCalled()
    expect(b.close).toHaveBeenCalled()
  })
})
