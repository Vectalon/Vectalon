import { createTempProject, cleanup } from '../helpers/tmp'
import { UpgradeTools } from '../../src/protocol/tools/UpgradeTools'
import type { ToolContext } from '../../src/protocol/tools'

const FIXTURE: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { react: '18.2.0', 'react-native': '0.72.5' },
  }),
  'src/legacy.js': [
    "import { NativeModules } from 'react-native'",
    "import { requireNativeComponent } from 'react-native'",
    'const NativeThing = requireNativeComponent("NativeThing")',
    'export const M = NativeModules.MyModule',
  ].join('\n'),
}

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

describe('UpgradeTools', () => {
  it('advertises three upgrade tools', () => {
    const tools = new UpgradeTools(toolCtx())
    const names = tools.metadata().map(t => t.name)
    expect(names).toContain('plan_upgrade')
    expect(names).toContain('apply_upgrade')
    expect(names).toContain('detect_upgrade_state')
  })

  it('plans an upgrade deterministically', async () => {
    const dir = createTempProject(FIXTURE)
    try {
      const tools = new UpgradeTools(toolCtx())
      const out = await tools.planUpgradeTool({ directory: dir, to: '0.76' })
      const parsed = JSON.parse(out) as { target: string; steps: { id: string }[]; detected: string }
      expect(parsed.target).toBe('0.76.0')
      expect(parsed.detected).toContain('react-native 0.72.5')
      expect(parsed.steps.some(s => s.id === 'rn-070-codegen-native-component')).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('refuses apply_upgrade without an explicit directory', async () => {
    const tools = new UpgradeTools(toolCtx())
    // Regression: apply_upgrade must never default to cwd (destructive write
    // path) — it must refuse and surface a real MCP error.
    await expect(tools.applyUpgradeTool({})).rejects.toThrow(/requires a "directory" argument/)
    await expect(tools.applyUpgradeTool({ to: '0.76' })).rejects.toThrow(/requires a "directory" argument/)
  })

  it('detects upgrade state', async () => {
    const dir = createTempProject(FIXTURE)
    try {
      const tools = new UpgradeTools(toolCtx())
      const out = await tools.detectUpgradeState({ directory: dir })
      const parsed = JSON.parse(out) as { rnVersion: string; tooling: string }
      expect(parsed.rnVersion).toBe('0.72.5')
      expect(parsed.tooling).toBe('rn-cli')
    } finally {
      cleanup(dir)
    }
  })
})
