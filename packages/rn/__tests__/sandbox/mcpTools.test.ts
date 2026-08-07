import { join } from 'path'
import { SandboxTools } from '../../src/protocol/tools/SandboxTools'
import type { ToolContext } from '../../src/protocol/tools'
import { createTempProject, cleanup } from '../helpers/tmp'

function toolCtx(): ToolContext {
  return {
    engine: {} as never,
    modelRouter: {} as never,
    artifactStore: null,
    teamStore: null,
    deviceControlLive: false,
    handleToolCall: async () => ({ id: 'x', content: '' }),
    getToolList: () => [],
  }
}

describe('SandboxTools', () => {
  it('advertises sandbox_run and sandbox_backend', () => {
    const tools = new SandboxTools(toolCtx())
    const names = tools.metadata().map(t => t.name)
    expect(names).toContain('sandbox_run')
    expect(names).toContain('sandbox_backend')
  })

  it('runs a command and returns a structured result', async () => {
    const root = createTempProject({})
    try {
      const tools = new SandboxTools(toolCtx())
      const out = await tools.sandboxRunTool({ command: 'node', args: ['-e', 'console.log("mcp-sandbox")'], root })
      const parsed = JSON.parse(out) as { ok: boolean; stdout: string; isolation: string }
      expect(parsed.ok).toBe(true)
      expect(parsed.stdout).toContain('mcp-sandbox')
      expect(parsed.isolation).toBeTruthy()
    } finally {
      cleanup(root)
    }
  })

  it('reports the backend', async () => {
    const tools = new SandboxTools(toolCtx())
    const out = await tools.sandboxBackendTool()
    const parsed = JSON.parse(out) as { isolation: string }
    expect(['sandbox-exec', 'bwrap', 'process']).toContain(parsed.isolation)
  })

  it('requires an explicit root — never defaults to cwd', async () => {
    const tools = new SandboxTools(toolCtx())
    await expect(tools.sandboxRunTool({ command: 'node' })).rejects.toThrow(/requires an explicit `root`/)
  })

  it('requires a command string', async () => {
    const root = createTempProject({})
    try {
      const tools = new SandboxTools(toolCtx())
      await expect(tools.sandboxRunTool({ root })).rejects.toThrow(/requires a `command`/)
    } finally {
      cleanup(root)
    }
  })

  it('accepts numeric-string limits from MCP clients', async () => {
    const root = createTempProject({})
    try {
      const tools = new SandboxTools(toolCtx())
      const out = await tools.sandboxRunTool({ command: 'node', args: ['-e', 'console.log(1)'], root, timeoutMs: '5000' })
      const parsed = JSON.parse(out) as { ok: boolean }
      expect(parsed.ok).toBe(true)
    } finally {
      cleanup(root)
    }
  })

  it('validates the root exists on disk', async () => {
    const tools = new SandboxTools(toolCtx())
    const out = await tools.sandboxRunTool({ command: 'node', root: join(process.cwd(), 'nope-missing-root') })
    const parsed = JSON.parse(out) as { error: string; ok: boolean }
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toContain('does not exist')
  })
})
