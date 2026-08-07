import { RenderTools } from '../../src/protocol/tools/RenderTools'
import type { ToolContext } from '../../src/protocol/tools'

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

describe('RenderTools', () => {
  it('advertises render_component', () => {
    const tools = new RenderTools(toolCtx())
    const names = tools.metadata().map(t => t.name)
    expect(names).toContain('render_component')
  })

  it('renders a component and returns the tree + logs', async () => {
    const tools = new RenderTools(toolCtx())
    const out = await tools.renderComponentTool({
      files: { 'src/App.tsx': 'import { Text } from "react-native"; export default function App() { console.log("hi"); return <Text>hello</Text> }' },
      entry: 'src/App.tsx',
    })
    const parsed = JSON.parse(out) as { ok: boolean; tree: { type: string }; logs: { message: string }[]; renderer: string }
    expect(parsed.ok).toBe(true)
    expect(parsed.renderer).toBe('shim')
    expect(parsed.logs.some(l => l.message.includes('hi'))).toBe(true)
    expect(JSON.stringify(parsed.tree)).toContain('hello')
  })

  it('returns runtime errors structurally (not a thrown error)', async () => {
    const tools = new RenderTools(toolCtx())
    const out = await tools.renderComponentTool({
      files: { 'src/App.tsx': 'import { Text } from "react-native"; export default function App() { throw new Error("kapow"); return <Text>x</Text> }' },
      entry: 'src/App.tsx',
    })
    const parsed = JSON.parse(out) as { ok: boolean; runtimeError: string }
    expect(parsed.ok).toBe(false)
    expect(parsed.runtimeError).toContain('kapow')
  })

  it('requires files as an object map', async () => {
    const tools = new RenderTools(toolCtx())
    await expect(tools.renderComponentTool({ entry: 'x' })).rejects.toThrow(/files/)
  })

  it('requires the entry to be a key of files', async () => {
    const tools = new RenderTools(toolCtx())
    await expect(
      tools.renderComponentTool({ files: { 'src/App.tsx': 'x' }, entry: 'src/Missing.tsx' })
    ).rejects.toThrow(/not a key of files/)
  })
})
