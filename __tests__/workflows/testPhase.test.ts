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
  // Default to an add-feature intent so scaffold-generation tests exercise the
  // happy path; intent-specific tests override modelRouter below.
  const router = intentRouter({ type: 'add-feature', feature: 'login', confidence: 0.99, reasoning: 'new feature' })
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
        tooling: 'rn-cli',
        expoSdkVersion: '',
        reactVersion: '18.2.0',
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
      git: { name: 'mock', createBranch: jest.fn(), commit: jest.fn(), push: jest.fn(), createPullRequest: jest.fn(), commentPullRequest: jest.fn() },
      testRunner: { name: 'mock', runTests: jest.fn() },
      simulator: { name: 'mock', run: jest.fn() },
      design: { name: 'mock', analyzeMotion: jest.fn() },
    },
    modelRouter: router,
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

  it('skips test generation when the intent is unknown', async () => {
    const ctx = makeContext(projectRoot, 'Remove appcenter safely from this project')
    ctx.modelRouter = intentRouter({ type: 'unknown', confidence: 0.5, reasoning: 'not sure' })
    const result = await testPhase.run(ctx)

    expect(result.status).toBe('completed')
    expect(result.artifacts.filter(a => a.type === 'qa')).toHaveLength(0)
    expect(result.output).toContain('could not be classified')
    expect(existsSync(join(projectRoot, 'src'))).toBe(false)
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

  it('generates a Maestro E2E flow from the acceptance criteria', async () => {
    const ctx = makeContext(projectRoot, 'Login')
    ctx.state.phases[0].output = [
      'Given the user opens the app',
      'When the user taps on "Login"',
      'Then the user sees "Dashboard"',
    ].join('\n')
    const result = await testPhase.run(ctx)

    const flow = result.artifacts.find(a => a.type === 'e2e')
    expect(flow).toBeDefined()
    expect(flow!.title).toContain('.maestro/Login.yaml')
    expect(flow!.content).toContain('appId:')
    expect(flow!.content).toContain('- launchApp')
    expect(flow!.content).toContain('- tapOn: "Login"')
    expect(flow!.content).toContain('- assertVisible: "Dashboard"')
    // The flow file is written next to the unit tests.
    expect(existsSync(join(projectRoot, '.maestro/Login.yaml'))).toBe(true)
    // The TDD gate still counts only unit tests.
    expect(result.artifacts.filter(a => a.type === 'qa')).toHaveLength(3)
    expect(result.output).toContain('## E2E flow')
  })

  it('skips the Maestro flow when no acceptance criteria were captured', async () => {
    const ctx = makeContext(projectRoot, 'Login')
    ctx.state.phases[0].output = ''
    const result = await testPhase.run(ctx)

    expect(result.artifacts.find(a => a.type === 'e2e')).toBeUndefined()
  })
})
