import { spawn } from 'child_process'
import { listEcosystemItems, readEcosystemConfig } from '../ecosystem'
import type { EcosystemItem } from '../ecosystem'
import { reportError } from '../utils/safe'

/**
 * Real sub-MCP proxying.
 *
 * Instead of merely advertising enabled ecosystem MCP servers (Metro MCP,
 * Expo MCP, …) as descriptors for agents to configure themselves, rn-vectalon
 * spawns each enabled server as a child process, completes the MCP
 * `initialize` handshake over stdio, and exposes its real tools as first-class
 * (namespaced) tools on the parent server. Connected agents — and anything
 * routing through `handleToolCall` — call them directly.
 */

export interface McpToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpServerInfo {
  name: string
  version: string
}

/** Minimal stdio transport: write JSON objects, receive parsed JSON lines. */
export interface McpTransport {
  write(message: Record<string, unknown>): void
  onMessage(cb: (message: Record<string, unknown>) => void): void
  onClose(cb: (code: number | null) => void): void
  close(): void
}

export interface SpawnProcessOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  /** Called once per stderr line (npx notices, server logs). */
  stderr?: (line: string) => void
}

/**
 * Transport backed by a spawned child process speaking newline-delimited
 * JSON-RPC over stdio. `detached` + group kill so npx-launched grandchildren
 * are terminated when the client closes.
 */
export function spawnMcpProcess(command: string, args: string[], options: SpawnProcessOptions = {}): McpTransport {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  })

  let buffer = ''
  const messageListeners = new Set<(m: Record<string, unknown>) => void>()
  const closeListeners = new Set<(code: number | null) => void>()

  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf-8')
    let idx: number
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        if (msg && typeof msg === 'object') {
          for (const cb of messageListeners) cb(msg as Record<string, unknown>)
        }
      } catch (err) {
        reportError(err, 'subMcp: non-JSON line from sub-MCP stdout')
      }
    }
  })

  let stderrBuffer = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString('utf-8')
    let idx: number
    while ((idx = stderrBuffer.indexOf('\n')) !== -1) {
      const line = stderrBuffer.slice(0, idx).trim()
      stderrBuffer = stderrBuffer.slice(idx + 1)
      if (line) options.stderr?.(line)
    }
  })

  child.on('close', code => {
    for (const cb of closeListeners) cb(code)
  })
  child.on('error', err => {
    for (const cb of closeListeners) cb(null)
    options.stderr?.(err.message)
  })

  return {
    write(message) {
      if (child.stdin?.writable) child.stdin.write(JSON.stringify(message) + '\n')
    },
    onMessage(cb) {
      messageListeners.add(cb)
    },
    onClose(cb) {
      closeListeners.add(cb)
    },
    close() {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM')
      } catch (err) {
        reportError(err, 'subMcp: killing process group')
      }
      try {
        child.kill()
      } catch (err) {
        reportError(err, 'subMcp: killing child process')
      }
    },
  }
}

/** Outcome of a proxied tools/call. */
export interface McpCallResult {
  content: string
  isError: boolean
}

/**
 * Structural handle the parent server needs from a proxied sub-MCP client.
 * `SubMcpClient` implements it; tests inject stubs with the same shape.
 */
export interface McpClientHandle {
  readonly item: EcosystemItem
  tools: McpToolDef[]
  start(): Promise<McpServerInfo>
  callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult>
  close(): void
}

export interface SubMcpClientOptions {
  initializeTimeoutMs?: number
  requestTimeoutMs?: number
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

const MCP_PROTOCOL_VERSION = '2024-11-05'

/** Render an MCP tools/call result content array into plain text. */
export function renderMcpContent(content: unknown): string {
  if (content === undefined || content === null) return ''
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text
        }
        return JSON.stringify(part)
      })
      .join('\n')
  }
  if (typeof content === 'string') return content
  return JSON.stringify(content)
}

/**
 * A single spawned sub-MCP server. Sends JSON-RPC 2.0 requests over the
 * transport, matches responses by id, enforces per-request timeouts, and
 * exposes the server's tool list after the initialize handshake.
 */
export class SubMcpClient implements McpClientHandle {
  tools: McpToolDef[] = []
  info: McpServerInfo | null = null

  private nextId = 1
  private pending = new Map<number | string, PendingRequest>()
  private closed = false

  constructor(
    readonly item: EcosystemItem,
    private readonly transport: McpTransport,
    private readonly options: SubMcpClientOptions = {}
  ) {
    this.transport.onMessage(msg => this.handleMessage(msg))
    this.transport.onClose(() => this.failAll('sub-MCP server closed'))
  }

  /** MCP initialize handshake + tools/list; populates this.tools. */
  async start(): Promise<McpServerInfo> {
    const info = await this.request<{ serverInfo?: { name?: string; version?: string } }>(
      'initialize',
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'rn-vectalon', version: '0.5.0' },
      },
      this.options.initializeTimeoutMs ?? 15000
    )
    this.info = {
      name: info?.serverInfo?.name || this.item.name,
      version: info?.serverInfo?.version || '',
    }
    // Notification — no response expected; servers ignore it if unsupported.
    this.transport.write({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
    const list = await this.request<{ tools?: McpToolDef[] }>(
      'tools/list',
      {},
      this.options.requestTimeoutMs ?? 60000
    )
    this.tools = Array.isArray(list?.tools) ? list.tools : []
    return this.info
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const result = await this.request<{ content?: unknown; structuredContent?: unknown; isError?: boolean }>(
      'tools/call',
      { name, arguments: args },
      this.options.requestTimeoutMs ?? 120000
    )
    // Newer MCP servers may return structuredContent instead of content parts.
    const body = result?.content ?? result?.structuredContent
    return { content: renderMcpContent(body), isError: result?.isError === true }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.transport.close()
    this.failAll('sub-MCP server closed')
  }

  private request<T = unknown>(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<T> {
    if (this.closed) return Promise.reject(new Error('sub-MCP server is closed'))
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      this.transport.write({ jsonrpc: '2.0', id, method, params })
    })
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const id = msg.id
    if (typeof id !== 'number' && typeof id !== 'string') return
    const entry = this.pending.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(id)
    if (msg.error && typeof msg.error === 'object') {
      const err = msg.error as { code?: unknown; message?: unknown }
      entry.reject(new Error(`${String(err.code ?? 'error')}: ${String(err.message ?? 'unknown error')}`))
    } else {
      entry.resolve(msg.result)
    }
  }

  private failAll(reason: string): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error(reason))
    }
    this.pending.clear()
  }
}

/** Split an install string into a spawnable command + args; npx gets --yes. */
export function parseMcpCommand(install: string): { command: string; args: string[] } {
  const parts = install
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p.replace(/^['"]|['"]$/g, ''))
  const [command, ...rest] = parts
  if (command === 'npx') return { command: 'npx', args: ['--yes', ...rest] }
  return { command: command || '', args: rest }
}

/** Spawn an ecosystem MCP item as a SubMcpClient (no handshake yet). */
export function spawnClientForItem(item: EcosystemItem, options: { cwd?: string; stderr?: (line: string) => void } = {}): McpClientHandle {
  const { command, args } = parseMcpCommand(item.install)
  const transport = spawnMcpProcess(command, args, { cwd: options.cwd, stderr: options.stderr })
  return new SubMcpClient(item, transport)
}

export interface StartMcpClientsOptions {
  /** Injectable client factory (tests stub this to avoid real processes). */
  spawnClient?: (item: EcosystemItem) => McpClientHandle
  log?: { info?: (message: string) => void; warn?: (message: string) => void }
  /** Called once per stderr line from a spawned server, for visibility. */
  stderr?: (item: EcosystemItem, line: string) => void
  cwd?: string
}

/**
 * Spawn + handshake every enabled ecosystem MCP server for a project root, in
 * parallel (one hung server can't delay the rest). Servers that fail to start
 * (missing package, timeout) are closed and skipped with a warning + install
 * hint; the parent server keeps serving either way.
 */
export async function startEnabledMcpClients(
  root: string,
  options: StartMcpClientsOptions = {}
): Promise<McpClientHandle[]> {
  const config = readEcosystemConfig(root)
  const enabled = listEcosystemItems().filter(i => i.category === 'mcp' && config.enabled.includes(i.id))

  const attempts = enabled.map(async item => {
    const client = options.spawnClient
      ? options.spawnClient(item)
      : spawnClientForItem(item, {
          cwd: options.cwd || root,
          stderr: line => options.stderr?.(item, line),
        })
    try {
      await client.start()
      return { item, client, error: null as Error | null }
    } catch (err) {
      client.close()
      return { item, client: null, error: err instanceof Error ? err : new Error(String(err)) }
    }
  })

  const settled = await Promise.all(attempts)
  const started: McpClientHandle[] = []
  for (const result of settled) {
    if (result.client) {
      started.push(result.client)
      options.log?.info?.(`Proxied ${result.item.name} (${result.client.tools.length} tool${result.client.tools.length === 1 ? '' : 's'})`)
    } else {
      options.log?.warn?.(`Could not start sub-MCP ${result.item.name} (${result.item.id}): ${result.error?.message}`)
      options.log?.warn?.(`  Install with: ${result.item.install}`)
    }
  }
  return started
}
