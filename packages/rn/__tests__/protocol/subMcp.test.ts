import {
  SubMcpClient,
  spawnMcpProcess,
  startEnabledMcpClients,
  parseMcpCommand,
  renderMcpContent,
  type McpTransport,
  type McpClientHandle,
} from '../../src/protocol/subMcp'
import { getEcosystemItem } from '../../src/ecosystem'
import type { EcosystemItem } from '../../src/ecosystem'
import { createTempProject, cleanup } from '../helpers/tmp'

/** Fake transport that answers each request with a scripted response. */
class FakeTransport implements McpTransport {
  onMessageCb: ((m: Record<string, unknown>) => void) | null = null
  written: Array<Record<string, unknown>> = []

  constructor(
    private readonly responder: (msg: Record<string, unknown>) => Record<string, unknown> | null
  ) {}

  write(message: Record<string, unknown>): void {
    this.written.push(message)
    const reply = this.responder(message)
    if (reply) setImmediate(() => this.onMessageCb?.(reply))
  }

  onMessage(cb: (m: Record<string, unknown>) => void): void {
    this.onMessageCb = cb
  }

  onClose(): void {}

  close(): void {}
}

const METRO_ITEM = getEcosystemItem('metro-mcp')!

describe('parseMcpCommand', () => {
  it('adds --yes to npx commands', () => {
    expect(parseMcpCommand('npx @steve228uk/metro-mcp')).toEqual({
      command: 'npx',
      args: ['--yes', '@steve228uk/metro-mcp'],
    })
    expect(parseMcpCommand('npx expo mcp')).toEqual({ command: 'npx', args: ['--yes', 'expo', 'mcp'] })
  })

  it('passes non-npx commands through', () => {
    expect(parseMcpCommand('gem install fastlane')).toEqual({ command: 'gem', args: ['install', 'fastlane'] })
  })
})

describe('renderMcpContent', () => {
  it('joins text parts', () => {
    expect(renderMcpContent([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a\nb')
  })

  it('stringifies non-text parts', () => {
    expect(renderMcpContent([{ type: 'image', data: 'x' }])).toContain('"type":"image"')
  })

  it('passes plain strings through', () => {
    expect(renderMcpContent('hello')).toBe('hello')
  })
})

describe('SubMcpClient', () => {
  it('completes the initialize handshake and lists tools', async () => {
    const transport = new FakeTransport(msg => {
      if (msg.method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id: msg.id,
          result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'metro', version: '1.0.0' } },
        }
      }
      if (msg.method === 'tools/list') {
        return { jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'get_console_logs', description: 'Read logs', inputSchema: { type: 'object' } }] } }
      }
      return null
    })
    const client = new SubMcpClient(METRO_ITEM, transport)

    const info = await client.start()
    expect(info).toEqual({ name: 'metro', version: '1.0.0' })
    expect(client.tools).toEqual([{ name: 'get_console_logs', description: 'Read logs', inputSchema: { type: 'object' } }])
    expect(transport.written[0].method).toBe('initialize')
    // notifications/initialized is sent without an id.
    expect(transport.written.find(m => m.method === 'notifications/initialized')).toBeDefined()
    expect(transport.written.find(m => m.method === 'notifications/initialized')?.id).toBeUndefined()
  })

  it('calls tools and forwards arguments', async () => {
    const transport = new FakeTransport(msg => {
      if (msg.method === 'tools/call') {
        expect(msg.params).toEqual({ name: 'get_console_logs', arguments: { limit: 10 } })
        return { jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'line1\nline2' }] } }
      }
      return null
    })
    const client = new SubMcpClient(METRO_ITEM, transport)

    const result = await client.callTool('get_console_logs', { limit: 10 })
    expect(result).toEqual({ content: 'line1\nline2', isError: false })
  })

  it('surfaces JSON-RPC errors', async () => {
    const transport = new FakeTransport(msg =>
      msg.method === 'tools/call'
        ? { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } }
        : null
    )
    const client = new SubMcpClient(METRO_ITEM, transport)
    await expect(client.callTool('nope', {})).rejects.toThrow('method not found')
  })

  it('rejects when a request times out', async () => {
    const transport = new FakeTransport(() => null) // never responds
    const client = new SubMcpClient(METRO_ITEM, transport, { initializeTimeoutMs: 50, requestTimeoutMs: 50 })
    await expect(client.start()).rejects.toThrow(/timed out/)
  })

  it('rejects calls after close', async () => {
    const transport = new FakeTransport(() => null)
    const client = new SubMcpClient(METRO_ITEM, transport)
    client.close()
    await expect(client.callTool('x', {})).rejects.toThrow('closed')
  })
})

describe('spawnMcpProcess (real process framing)', () => {
  it('runs a JSON-RPC exchange with a spawned node echo server', async () => {
    const script = `
      const rl = require('readline').createInterface({ input: process.stdin });
      rl.on('line', (l) => {
        const m = JSON.parse(l);
        if (m.method === 'initialize') {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake', version: '2.0.0' } } }) + '\\n');
        } else if (m.method === 'tools/list') {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'ping', description: 'p', inputSchema: { type: 'object' } }] } }) + '\\n');
        } else if (m.method === 'tools/call') {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'pong' }] } }) + '\\n');
        }
      });
    `
    const transport = spawnMcpProcess('node', ['-e', script])
    const client = new SubMcpClient(METRO_ITEM, transport, { initializeTimeoutMs: 5000, requestTimeoutMs: 5000 })

    try {
      const info = await client.start()
      expect(info.name).toBe('fake')
      expect(client.tools.map(t => t.name)).toEqual(['ping'])
      const result = await client.callTool('ping', {})
      expect(result).toEqual({ content: 'pong', isError: false })
    } finally {
      client.close()
    }
  })
})

describe('startEnabledMcpClients', () => {
  it('starts enabled MCP items and skips failures with a warning', async () => {
    const dir = createTempProject({
      '.vectalon/ecosystem.json': JSON.stringify({ enabled: ['metro-mcp', 'expo-mcp'] }),
    })
    const warns: string[] = []
    try {
      const clients = await startEnabledMcpClients(dir, {
        spawnClient: (item: EcosystemItem) => {
          if (item.id === 'expo-mcp') {
            return {
              item,
              tools: [],
              start: async () => {
                throw new Error('expo CLI missing')
              },
              callTool: async () => ({ content: '', isError: true }),
              close: () => {},
            }
          }
          return {
            item,
            tools: [{ name: 'get_console_logs', description: 'd', inputSchema: {} }],
            start: async () => ({ name: 'metro', version: '1' }),
            callTool: async () => ({ content: 'ok', isError: false }),
            close: () => {},
          }
        },
        log: { warn: message => warns.push(message) },
      })
      expect(clients).toHaveLength(1)
      expect(clients[0].item.id).toBe('metro-mcp')
      expect(clients[0].tools.map(t => t.name)).toEqual(['get_console_logs'])
      expect(warns.some(w => w.includes('expo-mcp'))).toBe(true)
      expect(warns.some(w => w.includes('Install with:'))).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('returns no clients when nothing is enabled', async () => {
    const dir = createTempProject({})
    try {
      const clients = await startEnabledMcpClients(dir, {
        spawnClient: (): McpClientHandle => {
          throw new Error('should not be called')
        },
      })
      expect(clients).toEqual([])
    } finally {
      cleanup(dir)
    }
  })
})
