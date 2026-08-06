import type { AgentTool, ToolCall, ToolResult, ProtocolType } from './types'
import type { McpClientHandle } from './subMcp'
import { ContextEngine } from '../harness/ContextEngine'
import { ModelRouter } from '../model/ModelRouter'
import { ArtifactStore } from '../knowledge/ArtifactStore'
import { TeamStore } from '../knowledge/TeamStore'
import { reportError } from '../utils/safe'
import {
  CoreTools,
  SdlcTools,
  KnowledgeTools,
  EcosystemTools,
  type ToolContext,
  type ToolRegistry,
} from './tools'

type ToolHandler = (args: Record<string, unknown>) => Promise<string>

export interface MCPServerOptions {
  /**
   * When true, device-control tools (device_boot, device_screenshot, …)
   * execute real simulator/emulator commands. Defaults to false — tools
   * describe the command they would run (safe, deterministic, CI-friendly).
   */
  deviceControlLive?: boolean
}

/**
 * MCP server — transport/lifecycle orchestration only. Tools live in
 * per-domain registries (CoreTools, SdlcTools, KnowledgeTools, EcosystemTools)
 * declared with the @mcpTool decorator, so adding an SDLC module never touches
 * this file. The handler map and the discovery list are both derived from the
 * decorator metadata — a single source of truth per tool.
 */
export class MCPServer {
  private tools: Map<string, ToolHandler> = new Map()
  private toolRegistries: ToolRegistry[] = []
  private protocol: ProtocolType
  private engine: ContextEngine
  private modelRouter: ModelRouter
  private artifactStore: ArtifactStore | null
  private teamStore: TeamStore | null
  private subMcpClients: McpClientHandle[]
  private deviceControlLive: boolean
  private httpServer: import('http').Server | null = null

  constructor(
    engine: ContextEngine,
    modelRouter: ModelRouter,
    protocol: ProtocolType = 'mcp',
    artifactStore: ArtifactStore | null = null,
    teamStore: TeamStore | null = null,
    subMcpClients: McpClientHandle[] = [],
    options: MCPServerOptions = {}
  ) {
    this.engine = engine
    this.modelRouter = modelRouter
    this.protocol = protocol
    this.artifactStore = artifactStore
    this.teamStore = teamStore
    this.subMcpClients = subMcpClients
    this.deviceControlLive = options.deviceControlLive === true

    const ctx: ToolContext = {
      engine: this.engine,
      modelRouter: this.modelRouter,
      artifactStore: this.artifactStore,
      teamStore: this.teamStore,
      deviceControlLive: this.deviceControlLive,
      // Lazy closures over this server so registries can route through the
      // full tool surface (including proxied sub-MCP tools).
      handleToolCall: call => this.handleToolCall(call),
      getToolList: () => this.getToolList(),
    }

    this.toolRegistries = [
      new CoreTools(ctx),
      new SdlcTools(ctx),
      new KnowledgeTools(ctx),
      new EcosystemTools(ctx),
    ]
    this.registerTools()
  }

  async start(port = 0): Promise<number | void> {
    switch (this.protocol) {
      case 'mcp':
      case 'stdio':
        await this.startStdio()
        break
      case 'sse':
      case 'http':
        return this.startHTTP(port)
    }
  }

  async handleToolCall(call: ToolCall): Promise<ToolResult> {
    const proxied = await this.tryHandleProxiedCall(call)
    if (proxied) return proxied

    const handler = this.tools.get(call.name)

    if (!handler) {
      return { id: call.id, content: `Unknown tool: ${call.name}`, isError: true }
    }

    try {
      const content = await handler(call.arguments)
      return { id: call.id, content }
    } catch (err) {
      return {
        id: call.id,
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  }

  getToolList(): AgentTool[] {
    // Real proxied tools from every started sub-MCP server (spawned by
    // `vectalon serve` via startEnabledMcpClients), namespaced by item id so
    // `metro-mcp__get_console_logs` can't collide with parent tool names.
    const proxiedTools: AgentTool[] = this.subMcpClients.flatMap(client =>
      client.tools.map(tool => ({
        name: `${client.item.id}__${tool.name}`,
        description: `[${client.item.name}] ${tool.description}`,
        inputSchema: tool.inputSchema,
      }))
    )

    // Declared tools from the registries, gated by service availability.
    const registeredTools: AgentTool[] = []
    for (const registry of this.toolRegistries) {
      for (const def of registry.metadata()) {
        if (!this.serviceAvailable(def.requires)) continue
        registeredTools.push({
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema || {},
        })
      }
    }

    return [...proxiedTools, ...registeredTools]
  }

  /** Route `itemId__toolName` calls to the matching proxied sub-MCP client. */
  private async tryHandleProxiedCall(call: ToolCall): Promise<ToolResult | null> {
    const sep = call.name.indexOf('__')
    if (sep === -1) return null
    const itemId = call.name.slice(0, sep)
    const toolName = call.name.slice(sep + 2)
    const client = this.subMcpClients.find(c => c.item.id === itemId)
    if (!client) return null
    try {
      const result = await client.callTool(toolName, call.arguments)
      return { id: call.id, content: result.content, isError: result.isError }
    } catch (err) {
      return {
        id: call.id,
        content: `Error from ${itemId}: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  }

  /** Close the HTTP server (if any) and every proxied sub-MCP server. */
  close(): void {
    if (this.httpServer) {
      this.httpServer.close()
      this.httpServer = null
    }
    for (const client of this.subMcpClients) client.close()
  }

  /** Register every declared tool whose gating service is available. */
  private registerTools(): void {
    for (const registry of this.toolRegistries) {
      for (const tool of registry.tools()) {
        if (this.serviceAvailable(tool.requires)) {
          this.tools.set(tool.name, tool.handler)
        }
      }
    }
  }

  private serviceAvailable(requires: 'artifactStore' | 'teamStore' | undefined): boolean {
    if (requires === 'artifactStore') return this.artifactStore !== null
    if (requires === 'teamStore') return this.teamStore !== null
    return true
  }

  private async startStdio(): Promise<void> {
    const readline = (await import('readline')).default.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    })

    readline.on('line', async (line: string) => {
      try {
        const call: ToolCall = JSON.parse(line)
        this.sendResult(await this.handleToolCall(call))
      } catch (err) {
        this.sendResult({
          id: 'error',
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        })
      }
    })
  }

  private sendResult(result: ToolResult): void {
    process.stdout.write(JSON.stringify(result) + '\n')
  }

  private async startHTTP(port: number): Promise<number> {
    const http = await import('http')
    const server = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res)
    })
    this.httpServer = server

    return new Promise<number>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, () => {
        const address = server.address()
        const bound = typeof address === 'object' && address ? address.port : port
        process.stderr.write(`rn-vectalon MCP server running on port ${bound}\n`)
        resolve(bound)
      })
    })
  }

  private async handleHttpRequest(req: import('http').IncomingMessage, res: import('http').ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const path = url.pathname
      const method = req.method || 'GET'

      const sendJson = (status: number, body: unknown): void => {
        if (res.writableEnded) return
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        })
        res.end(JSON.stringify(body))
      }

      // CORS preflight for browser-based dashboards.
      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        })
        res.end()
        return
      }

      // Tool discovery.
      if (method === 'GET' && (path === '/' || path === '/tools')) {
        sendJson(200, { tools: this.getToolList(), status: 'running' })
        return
      }

      // Tool invocation: POST /call or POST /invoke with a ToolCall JSON body
      // { id?, name, arguments }. Tool-level failures come back as an isError
      // flag on a 200 response (handleToolCall never throws for handler
      // errors) — the transport stays 2xx and the error travels in the body.
      if ((path === '/call' || path === '/invoke') && method === 'POST') {
        const body = await this.readJsonBody(req)
        if (!body) {
          sendJson(400, { error: 'Invalid JSON body' })
          return
        }

        const name = body.name
        if (typeof name !== 'string' || !name) {
          sendJson(400, { error: 'Missing required field: name' })
          return
        }

        const args = body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
          ? (body.arguments as Record<string, unknown>)
          : {}

        const call: ToolCall = {
          id: typeof body.id === 'string' ? body.id : `http-${Date.now()}`,
          name,
          arguments: args,
        }

        const known = this.getToolList().some(t => t.name === name)
        if (!known) {
          sendJson(404, { error: `Unknown tool: ${name}` })
          return
        }

        const result = await this.handleToolCall(call)
        sendJson(200, result)
        return
      }

      if (path === '/call' || path === '/invoke' || path === '/' || path === '/tools') {
        sendJson(405, { error: `Method ${method} not allowed on ${path}` })
        return
      }

      sendJson(404, { error: `Not found: ${path}` })
    } catch (err) {
      // Stream/parse failures (e.g. a client aborting mid-body) must never
      // become an unhandled rejection or leave the client hanging.
      const message = err instanceof Error ? err.message : String(err)
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: message }))
      }
    }
  }

  /** Read + parse a JSON request body, capped to 1 MiB. */
  private async readJsonBody(req: import('http').IncomingMessage): Promise<Record<string, unknown> | null> {
    const MAX_BYTES = 1024 * 1024
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      if (size > MAX_BYTES) return null
      chunks.push(buf)
    }
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
    } catch (err) {
      reportError(err, 'MCPServer: parsing JSON request body')
      return null
    }
  }
}
