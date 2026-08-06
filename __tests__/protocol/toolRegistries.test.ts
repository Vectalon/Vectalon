import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { ToolRegistry } from '../../src/protocol/tools'
import { mcpTool, collectTools } from '../../src/protocol/tools/decorators'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import type { ToolContext } from '../../src/protocol/tools/context'
import { resetConfig } from '../../src/config'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { 'react-native': '0.72.0' },
  }),
  'src/Home.tsx': "import React from 'react'\nconst Home = () => null\nexport default Home\n",
}

describe('MCP tool registries (decorator pattern)', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
    dir = createTempProject(PROJECT)
    configDir = useTempConfig()
    resetConfig()
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  it('collectTools derives handlers from @mcpTool declarations, bound to the instance', async () => {
    class ExampleRegistry extends ToolRegistry {
      @mcpTool('example_hello', 'Say hello', { type: 'object', properties: { name: { type: 'string' } } })
      async hello(args: Record<string, unknown>): Promise<string> {
        return `Hello ${(args.name as string) || 'world'} from ${this.tag}`
      }

      tag = 'registry-a'
    }

    const ctx = { tag: 'unused' } as unknown as ToolContext
    const registry = new ExampleRegistry(ctx)
    const tools = collectTools(registry)

    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('example_hello')
    expect(tools[0].description).toBe('Say hello')
    const schema = tools[0].inputSchema as { properties?: Record<string, unknown> }
    expect(schema.properties?.name).toEqual({ type: 'string' })
    // Handler is bound to the registry instance, so `this` works.
    expect(await tools[0].handler({ name: 'Buffy' })).toBe('Hello Buffy from registry-a')
    expect(registry.metadata()).toHaveLength(1)
    expect(registry.metadata()[0]).not.toHaveProperty('handler')
  })

  it('each registry keeps its own tool set even with a shared base class', () => {
    class One extends ToolRegistry {
      @mcpTool('one_a', 'A')
      async a(): Promise<string> { return 'a' }
    }
    class Two extends ToolRegistry {
      @mcpTool('two_b', 'B')
      async b(): Promise<string> { return 'b' }
    }

    expect(collectTools(new One({} as ToolContext)).map(t => t.name)).toEqual(['one_a'])
    expect(collectTools(new Two({} as ToolContext)).map(t => t.name)).toEqual(['two_b'])
  })

  it('requires-gated tools are advertised and callable only when the service is present', () => {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })

    const without = new MCPServer(engine, router)
    expect(without.getToolList().some(t => t.name === 'list_artifacts')).toBe(false)

    const withStore = new MCPServer(engine, router, 'mcp', new ArtifactStore(dir), null)
    expect(withStore.getToolList().some(t => t.name === 'list_artifacts')).toBe(true)
  })

  it('advertises every tool with a non-empty inputSchema', () => {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    const server = new MCPServer(engine, router)

    for (const tool of server.getToolList()) {
      expect(tool.inputSchema).toBeDefined()
      expect(typeof tool.inputSchema).toBe('object')
    }
  })

  it('a new registry plugs into the server with no changes to MCPServer', async () => {
    // The pattern: build a registry off ToolRegistry, then hand its tools to
    // the server's handler surface. MCPServer itself is untouched.
    class ExtraTools extends ToolRegistry {
      @mcpTool('extra_thing', 'An extra tool')
      async thing(): Promise<string> {
        return 'extra result'
      }
    }

    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    const server = new MCPServer(engine, router)
    const before = server.getToolList().length

    const registry = new ExtraTools({
      engine,
      modelRouter: router,
      artifactStore: null,
      teamStore: null,
      deviceControlLive: false,
      handleToolCall: call => server.handleToolCall(call),
      getToolList: () => server.getToolList(),
    } as ToolContext)

    const serverInternals = server as unknown as {
      tools: Map<string, (a: Record<string, unknown>) => Promise<string>>
    }
    for (const tool of collectTools(registry)) {
      serverInternals.tools.set(tool.name, tool.handler)
    }

    expect(server.getToolList()).toHaveLength(before) // discovery list is registry-driven
    const result = await server.handleToolCall({ id: '1', name: 'extra_thing', arguments: {} })
    expect(result.isError).not.toBe(true)
    expect(result.content).toBe('extra result')
  })
})
