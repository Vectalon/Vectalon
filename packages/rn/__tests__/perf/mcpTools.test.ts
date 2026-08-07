import { PerfTools } from '../../src/protocol/tools/PerfTools'
import type { ToolContext } from '../../src/protocol/tools'
import { cpuProfileFixture, heapSnapshotFixture } from './fixtures'

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

describe('PerfTools', () => {
  it('advertises analyze_hermes_profile', () => {
    const tools = new PerfTools(toolCtx())
    const names = tools.metadata().map(t => t.name)
    expect(names).toContain('analyze_hermes_profile')
  })

  it('analyzes a CPU profile payload', async () => {
    const tools = new PerfTools(toolCtx())
    const out = await tools.analyzeHermesProfileTool({ profileContent: JSON.stringify(cpuProfileFixture(500)) })
    const parsed = JSON.parse(out) as { totalBlockingMs: number; findings: { target: string; message: string }[] }
    expect(parsed.totalBlockingMs).toBeGreaterThanOrEqual(500)
    expect(parsed.findings[0].target).toBe('useEffect')
    expect(parsed.findings[0].message).toContain('blocks the JS thread')
  })

  it('analyzes a heap snapshot payload', async () => {
    const tools = new PerfTools(toolCtx())
    const out = await tools.analyzeHermesProfileTool({ heapContent: JSON.stringify(heapSnapshotFixture()) })
    const parsed = JSON.parse(out) as { totalHeapBytes: number; topRetained: { name: string }[] }
    expect(parsed.totalHeapBytes).toBeGreaterThan(20 * 1024 * 1024)
    expect(parsed.topRetained[0].name).toBe('imageCache')
  })

  it('handles empty input with an empty report', async () => {
    const tools = new PerfTools(toolCtx())
    const out = await tools.analyzeHermesProfileTool({})
    const parsed = JSON.parse(out) as { findings: unknown[] }
    expect(parsed.findings).toEqual([])
  })

  it('accepts a numeric-string thresholdMs from MCP clients', async () => {
    const tools = new PerfTools(toolCtx())
    const out = await tools.analyzeHermesProfileTool({
      profileContent: JSON.stringify(cpuProfileFixture(500)),
      thresholdMs: '150',
    })
    const parsed = JSON.parse(out) as { totalBlockingMs: number }
    expect(parsed.totalBlockingMs).toBeGreaterThanOrEqual(500)
  })

  it('surfaces invalid profile JSON as an error', async () => {
    const tools = new PerfTools(toolCtx())
    await expect(tools.analyzeHermesProfileTool({ profileContent: '{not json' })).rejects.toThrow()
  })
})
