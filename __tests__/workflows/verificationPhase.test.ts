import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { verificationPhase } from '../../src/workflows/phases/verificationPhase'
import { ModelRouter } from '../../src/model/ModelRouter'
import type { WorkflowContext } from '../../src/adapters/types'

function createContext(projectRoot: string): WorkflowContext {
  const router = new ModelRouter()
  router.initialize({ provider: 'local' })
  jest.spyOn(router, 'generate').mockResolvedValue({
    content: JSON.stringify({ intents: [{ type: 'remove-dependency', dependency: 'appcenter', confidence: 1, reasoning: 'remove appcenter' }] }),
    provider: 'mock',
  })
  return {
    projectRoot,
    snapshot: {
      project: {
        root: projectRoot,
        name: 'test-app',
        version: '1.0.0',
        reactNativeVersion: '0.72.0',
        dependencies: {},
        devDependencies: {},
        scripts: {},
        platforms: ['ios', 'android'],
        hasTypeScript: true,
        hasMetro: true,
        hasExpo: false,
        tooling: 'rn-cli',
        expoSdkVersion: '',
      },
      structure: [],
      components: [],
      recentChanges: [],
      timestamp: Date.now(),
    },
    prompt: 'Remove appcenter safely from this project',
    inputs: {},
    outputs: {},
    state: {
      id: 'test',
      workflowId: 'feature-development',
      prompt: 'x',
      status: 'running',
      phases: [
        { id: 'tests', name: 'Tests', description: '', status: 'completed', output: '', artifacts: [] },
        {
          id: 'implementation',
          name: 'Implementation',
          description: '',
          status: 'completed',
          output: '',
          artifacts: [{ type: 'engineering', title: 'x', content: 'x' }],
        },
        { id: 'code-review', name: 'Code review', description: '', status: 'completed', output: '', artifacts: [] },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    adapters: {
      projectManagement: { name: 'mock', createTasks: jest.fn(), updateTasks: jest.fn(), closeTasks: jest.fn() },
      git: { name: 'mock', createBranch: jest.fn(), commit: jest.fn(), push: jest.fn(), createPullRequest: jest.fn() },
      testRunner: {
        name: 'console',
        runTests: async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 }),
        runLint: async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 }),
        runTypeCheck: async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 }),
        runPrettier: async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 }),
      },
      simulator: { name: 'mock', run: jest.fn() },
      design: { name: 'mock', analyzeMotion: jest.fn() },
    },
    modelRouter: router,
  }
}

describe('verificationPhase remove-dependency checks', () => {
  let tmpDir: string
  let projectRoot: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-verify-'))
    projectRoot = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('passes when the live package.json no longer lists the dependency (implementation edited it)', async () => {
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'app', dependencies: { 'react-native': '0.72.0' } }, null, 2))
    const result = await verificationPhase.run(createContext(projectRoot))

    expect(result.status).toBe('completed')
    expect(result.output).toContain('Dependency check: pass')
  })

  it('fails when the live package.json still lists the dependency', async () => {
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'app', dependencies: { appcenter: '4.4.5' } }, null, 2))
    const result = await verificationPhase.run(createContext(projectRoot))

    expect(result.status).toBe('failed')
    expect(result.output).toContain('FAIL — package still in package.json')
  })

  it('fails when a source file still imports the removed package', async () => {
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'app', dependencies: {} }, null, 2))
    const srcDir = join(projectRoot, 'src')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(join(srcDir, 'App.tsx'), "import AppCenter from 'appcenter';\nexport function App() { return null }\n")

    const result = await verificationPhase.run(createContext(projectRoot))

    expect(result.status).toBe('failed')
    expect(result.output).toContain('Import scan: FAIL')
  })

  it('fails when code still calls the removed package even without imports', async () => {
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'app', dependencies: {} }, null, 2))
    const srcDir = join(projectRoot, 'src')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(
      join(srcDir, 'App.tsx'),
      "import { View } from 'react-native';\nexport function App() { AppCenter.startWithAppCenterSecret('x'); return null }\n"
    )

    const result = await verificationPhase.run(createContext(projectRoot))

    expect(result.status).toBe('failed')
    expect(result.output).toContain('Reference scan: FAIL')
  })

  it('falls back to the scan-time snapshot when no package.json exists on disk', async () => {
    const ctx = createContext(projectRoot)
    ctx.snapshot = {
      ...ctx.snapshot!,
      project: { ...ctx.snapshot!.project, dependencies: { appcenter: '4.4.5' } },
    }

    const result = await verificationPhase.run(ctx)

    expect(result.status).toBe('failed')
    expect(result.output).toContain('checked scan-time snapshot')
  })
})
