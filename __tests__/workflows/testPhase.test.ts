import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { testPhase } from '../../src/workflows/phases/testPhase'
import type { WorkflowContext } from '../../src/adapters/types'
import { ModelRouter } from '../../src/model/ModelRouter'

// Intent always comes from the LLM, so tests exercising a specific intent must
// feed intent JSON through the model router.
function intentRouter(...intents: Array<Record<string, unknown>>): ModelRouter {
  const router = new ModelRouter()
  jest.spyOn(router, 'generate').mockResolvedValue({
    content: JSON.stringify({ intents }),
    provider: 'mock',
  })
  return router
}

function makeContext(projectRoot: string | undefined, prompt: string): WorkflowContext {
  return {
    // WorkflowContext.projectRoot is typed as string; a falsy root simulates the
    // no-project-root path where tests are recorded but not written to disk.
    projectRoot: projectRoot as string,
    snapshot: {
      project: {
        root: projectRoot || '/tmp',
        name: 'test-app',
        version: '1.0.0',
        reactNativeVersion: '0.72.0',
        dependencies: { 'react-native': '0.72.0' },
        devDependencies: {},
        scripts: {},
        platforms: ['ios', 'android'],
        hasTypeScript: true,
        hasMetro: true,
        hasExpo: false,
      },
      structure: [],
      components: [],
      recentChanges: [],
      timestamp: Date.now(),
    },
    prompt,
    inputs: {},
    outputs: {},
    state: {
      id: 'test',
      workflowId: 'feature-development',
      prompt,
      status: 'running',
      phases: [
        {
          id: 'prd',
          name: 'PRD',
          description: 'PRD',
          status: 'completed',
          output: 'Given a user, when they open the app, then they see a login screen.',
          artifacts: [],
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    adapters: {
      projectManagement: { name: 'mock', createTasks: jest.fn(), updateTasks: jest.fn(), closeTasks: jest.fn() },
      git: { name: 'mock', createBranch: jest.fn(), commit: jest.fn(), push: jest.fn(), createPullRequest: jest.fn() },
      testRunner: { name: 'mock', runTests: jest.fn() },
      simulator: { name: 'mock', run: jest.fn() },
      design: { name: 'mock', analyzeMotion: jest.fn() },
    },
    modelRouter: {} as WorkflowContext['modelRouter'],
  }
}

describe('testPhase (TDD)', () => {
  let tmpDir: string
  let projectRoot: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-testphase-'))
    projectRoot = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes screen, hook, and service tests before implementation', async () => {
    const result = await testPhase.run(makeContext(projectRoot, 'Login'))

    expect(result.status).toBe('completed')
    const written = result.artifacts.filter(a => a.type === 'qa')
    expect(written).toHaveLength(3)

    const paths = written.map(a => a.path)
    expect(paths.some(p => p!.endsWith('src/__tests__/Login.ts'))).toBe(true)
    expect(paths.some(p => p!.endsWith('src/__tests__/useLogin.ts'))).toBe(true)
    expect(paths.some(p => p!.endsWith('src/__tests__/LoginApi.ts'))).toBe(true)

    for (const artifact of written) {
      expect(existsSync(artifact.path!)).toBe(true)
    }
  })

  it('uses named imports that match the implementation scaffold contract', async () => {
    const result = await testPhase.run(makeContext(projectRoot, 'Login'))

    const screenTest = result.artifacts.find(a => a.path?.endsWith('src/__tests__/Login.ts'))
    const hookTest = result.artifacts.find(a => a.path?.endsWith('src/__tests__/useLogin.ts'))
    const serviceTest = result.artifacts.find(a => a.path?.endsWith('src/__tests__/LoginApi.ts'))

    expect(screenTest?.content).toContain("import { LoginScreen } from '../screens/LoginScreen'")
    expect(hookTest?.content).toContain("import { useLogin } from '../hooks/useLogin'")
    expect(serviceTest?.content).toContain("import { loginApi } from '../services/LoginApi'")
    expect(screenTest?.content).not.toContain('import Login from')
  })

  it('skips test generation for dependency removal', async () => {
    const ctx = makeContext(projectRoot, 'Remove appcenter from this project')
    ctx.modelRouter = intentRouter({ type: 'remove-dependency', dependency: 'appcenter', confidence: 0.99, reasoning: 'removal' })
    const result = await testPhase.run(ctx)

    expect(result.status).toBe('completed')
    expect(result.artifacts.filter(a => a.type === 'qa')).toHaveLength(0)
    expect(result.output).toContain('Skipping test generation for dependency removal')
  })

  it('skips scaffold test generation for refactor intents', async () => {
    const ctx = makeContext(projectRoot, 'Refactor the login screen')
    ctx.modelRouter = intentRouter({ type: 'refactor', target: 'loginscreen', confidence: 0.99, reasoning: 'refactor' })
    const result = await testPhase.run(ctx)

    expect(result.status).toBe('completed')
    expect(result.artifacts.filter(a => a.type === 'qa')).toHaveLength(0)
    expect(result.output).toContain('Skipping scaffold test generation for refactor')
  })

  it('keeps generated tests out of src/ when the project is the rn-vectalon package itself', async () => {
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: '@vectalon-dev/rn-vectalon', version: '0.5.0' }))

    const result = await testPhase.run(makeContext(projectRoot, 'Login'))

    expect(result.output).toContain('.vectalon/generated')
    expect(existsSync(join(projectRoot, 'src/__tests__/Login.ts'))).toBe(false)
    expect(existsSync(join(projectRoot, '.vectalon/generated/src/__tests__/Login.ts'))).toBe(true)
    expect(existsSync(join(projectRoot, '.vectalon/generated/src/__tests__/useLogin.ts'))).toBe(true)
    expect(existsSync(join(projectRoot, '.vectalon/generated/src/__tests__/LoginApi.ts'))).toBe(true)
  })

  it('still writes tests into src/__tests__ for a regular project', async () => {
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'my-app', version: '1.0.0' }))

    const result = await testPhase.run(makeContext(projectRoot, 'Login'))

    expect(existsSync(join(projectRoot, 'src/__tests__/Login.ts'))).toBe(true)
    expect(result.output).not.toContain('.vectalon/generated')
  })

  it('records qa artifacts even without a project root (simulated)', async () => {
    const result = await testPhase.run(makeContext(undefined, 'Login'))

    expect(result.status).toBe('completed')
    expect(result.artifacts.filter(a => a.type === 'qa')).toHaveLength(3)
    expect(result.output).toContain('simulated')
  })
})
