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
  it('advertises the upgrade tools', () => {
    const tools = new UpgradeTools(toolCtx())
    const names = tools.metadata().map(t => t.name)
    expect(names).toContain('plan_upgrade')
    expect(names).toContain('apply_upgrade')
    expect(names).toContain('detect_upgrade_state')
    expect(names).toContain('get_rn_upgrade_diff')
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

  it('parses a provided rn-diff-purge diff offline (deterministic)', async () => {
    const tools = new UpgradeTools(toolCtx())
    const diff = [
      'diff --git a/RnDiffApp/android/app/build.gradle b/RnDiffApp/android/app/build.gradle',
      '--- a/RnDiffApp/android/app/build.gradle',
      '+++ b/RnDiffApp/android/app/build.gradle',
      '@@ -1 +1 @@',
      '-    compileSdkVersion = 35',
      '+    compileSdkVersion = 36',
      'diff --git a/RnDiffApp/App.tsx b/RnDiffApp/App.tsx',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/RnDiffApp/App.tsx',
      '@@ -0,0 +1 @@',
      '+export const App = () => null;',
    ].join('\n')
    const out = await tools.getRnUpgradeDiffTool({ from: '0.84.0', to: '0.85.0', diff })
    const parsed = JSON.parse(out) as { totalFiles: number; native: { fileCount: number }; jsTs: { fileCount: number } }
    expect(parsed.totalFiles).toBe(2)
    expect(parsed.native.fileCount).toBe(1)
    expect(parsed.jsTs.fileCount).toBe(1)
  })

  it('requires from and to for get_rn_upgrade_diff', async () => {
    const tools = new UpgradeTools(toolCtx())
    const out = await tools.getRnUpgradeDiffTool({})
    const parsed = JSON.parse(out) as { error: string }
    expect(parsed.error).toContain('requires from and to')
  })
})
