import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { featureDevelopmentWorkflow } from '../../src/workflows/definitions/featureDevelopment'
import { WorkflowEngine } from '../../src/workflows/WorkflowEngine'
import { createWorkflowState } from '../../src/workflows/WorkflowState'
import type { WorkflowContext } from '../../src/adapters/types'
import { createAdapters } from '../../src/adapters'
import { ModelRouter } from '../../src/model/ModelRouter'

// Real temp dir (not /tmp): the remove-dependency implementation edits
// package.json and writes cleanup scripts into the project root, so the
// context must point at an isolated directory.
const projectRoot = mkdtempSync(join(tmpdir(), 'vectalon-featdev-'))

afterAll(() => {
  rmSync(projectRoot, { recursive: true, force: true })
})

function makeContext(prompt: string): WorkflowContext {
  return {
    projectRoot,
    snapshot: {
      project: {
        root: '/tmp',
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
      components: [
        {
          name: 'Home',
          filePath: 'src/screens/Home.tsx',
          isDefaultExport: true,
          usesStyleSheet: true,
          usesNavigation: true,
          imports: ['react-native', '@react-navigation/native'],
        },
      ],
      recentChanges: [],
      timestamp: Date.now(),
    },
    prompt,
    inputs: {},
    outputs: {},
    state: createWorkflowState('feature-development', prompt),
    adapters: createAdapters({ dryRun: true }),
    modelRouter: new ModelRouter(),
  }
}

describe('featureDevelopmentWorkflow', () => {
  it('runs all 13 phases for a login + API prompt', async () => {
    const engine = new WorkflowEngine()
    const ctx = makeContext('Login')
    ctx.modelRouter.initialize({ provider: 'local' })
    // Intent comes from the LLM; feed an add-feature classification so the
    // workflow takes the scaffold path (unparseable implementation output then
    // falls back to the deterministic scaffold, which this test asserts on).
    jest.spyOn(ctx.modelRouter, 'generate').mockResolvedValue({
      content: JSON.stringify({ intents: [{ type: 'add-feature', feature: 'login', confidence: 0.99, reasoning: 'new feature' }] }),
      provider: 'mock',
    })

    const result = await engine.run(featureDevelopmentWorkflow, ctx)

    expect(result.status).toBe('completed')
    expect(result.phases).toHaveLength(13)

    const phaseIds = result.phases.map(p => p.id)
    expect(phaseIds).toEqual([
      'prd',
      'scope',
      'design',
      'architecture',
      'tasks',
      'tests',
      'implementation',
      'code-review',
      'verification',
      'readiness',
      'pr',
      'documentation',
      'close',
    ])

    // TDD: tests are written BEFORE implementation
    const phases = result.phases
    const testsIndex = phases.findIndex(p => p.id === 'tests')
    const implementationIndex = phases.findIndex(p => p.id === 'implementation')
    const reviewIndex = phases.findIndex(p => p.id === 'code-review')
    const verificationIndex = phases.findIndex(p => p.id === 'verification')
    expect(testsIndex).toBeGreaterThan(-1)
    expect(implementationIndex).toBeGreaterThan(testsIndex)
    expect(reviewIndex).toBeGreaterThan(implementationIndex)
    expect(verificationIndex).toBeGreaterThan(reviewIndex)

    const tests = result.phases.find(p => p.id === 'tests')
    expect(tests?.artifacts.some(a => a.type === 'qa')).toBe(true)

    const implementation = result.phases.find(p => p.id === 'implementation')
    expect(implementation?.output).toContain('src/services/LoginApi.ts')
    expect(implementation?.output).toContain('src/hooks/useLogin.ts')
    expect(implementation?.output).toContain('src/screens/LoginScreen.tsx')

    const review = result.phases.find(p => p.id === 'code-review')
    expect(review?.status).toBe('completed')

    const design = result.phases.find(p => p.id === 'design')
    expect(design?.output).toContain('Motion design recommendations')

    const readiness = result.phases.find(p => p.id === 'readiness')
    expect(readiness?.output).toContain('Status: GO')
  })

  it('handles the verification phase failure', async () => {
    const engine = new WorkflowEngine()
    const ctx = makeContext('Login')
    ctx.modelRouter.initialize({ provider: 'local' })
    jest.spyOn(ctx.modelRouter, 'generate').mockResolvedValue({
      content: JSON.stringify({ intents: [{ type: 'add-feature', feature: 'login', confidence: 0.99, reasoning: 'new feature' }] }),
      provider: 'mock',
    })
    ctx.adapters.testRunner = {
      name: 'failing',
      runTests: async () => ({
        success: false,
        stdout: '',
        stderr: 'Tests failed',
        exitCode: 1,
        summary: '1 failure',
      }),
    }

    const result = await engine.run(featureDevelopmentWorkflow, ctx)

    expect(result.status).toBe('failed')
    expect(result.phases.find(p => p.id === 'verification')?.status).toBe('failed')
  })

  it('detects dependency removal intent and produces a removal plan', async () => {
    const engine = new WorkflowEngine()
    const ctx = makeContext('Remove appcenter safely from this project')
    ctx.modelRouter.initialize({ provider: 'local' })
    // Intent always comes from the LLM, so the model must classify this prompt.
    jest.spyOn(ctx.modelRouter, 'generate').mockResolvedValue({
      content: JSON.stringify({
        intents: [{ type: 'remove-dependency', dependency: 'appcenter', confidence: 0.99, reasoning: 'explicit removal request' }],
      }),
      provider: 'mock',
    })

    const result = await engine.run(featureDevelopmentWorkflow, ctx)

    expect(result.status).toBe('completed')
    const implementation = result.phases.find(p => p.id === 'implementation')
    expect(implementation?.output).toContain('Remove dependency: appcenter')
    expect(implementation?.output).toContain('npm uninstall appcenter')
    expect(implementation?.output).not.toContain('LoginScreen')
    expect(implementation?.output).not.toContain('Sign In')

    const scope = result.phases.find(p => p.id === 'scope')
    expect(scope?.output).toContain('Detected intent: remove-dependency')

    const design = result.phases.find(p => p.id === 'design')
    expect(design?.output).toContain('This request does not introduce new UI')

    const readiness = result.phases.find(p => p.id === 'readiness')
    expect(readiness?.output).toContain('GO')
    expect(readiness?.output).toContain('simulation mode')
  })

  it('completes when intent is unknown — clarification plan, no TDD failure', async () => {
    const engine = new WorkflowEngine()
    const ctx = makeContext('Login')
    ctx.modelRouter.initialize({ provider: 'local' })
    // Intent always comes from the LLM; here the model says it cannot classify
    // the request. testPhase skips generation for unknown intents by design, so
    // verification must not fail the TDD gate for the missing scaffold.
    jest.spyOn(ctx.modelRouter, 'generate').mockResolvedValue({
      content: JSON.stringify({ intents: [{ type: 'unknown', confidence: 0.99, reasoning: 'cannot classify' }] }),
      provider: 'mock',
    })

    const result = await engine.run(featureDevelopmentWorkflow, ctx)

    expect(result.status).toBe('completed')
    const implementation = result.phases.find(p => p.id === 'implementation')
    expect(implementation?.output).toContain('Request not classified')
    const tests = result.phases.find(p => p.id === 'tests')
    expect(tests?.artifacts.some(a => a.type === 'qa')).toBe(false)
    const verification = result.phases.find(p => p.id === 'verification')
    expect(verification?.status).toBe('completed')
    expect(verification?.output).toContain('TDD validation: skipped')
  })

  it('detects dependency still installed and fails verification', async () => {
    const engine = new WorkflowEngine()
    const ctx = makeContext('Remove appcenter safely from this project')
    ctx.modelRouter.initialize({ provider: 'local' })
    jest.spyOn(ctx.modelRouter, 'generate').mockResolvedValue({
      content: JSON.stringify({
        intents: [{ type: 'remove-dependency', dependency: 'appcenter', confidence: 0.99, reasoning: 'explicit removal request' }],
      }),
      provider: 'mock',
    })
    ctx.snapshot = {
      ...ctx.snapshot!,
      project: {
        ...ctx.snapshot!.project,
        dependencies: { ...ctx.snapshot!.project.dependencies, 'appcenter': '4.4.5' },
      },
    }

    const result = await engine.run(featureDevelopmentWorkflow, ctx)

    expect(result.status).toBe('failed')
    const verification = result.phases.find(p => p.id === 'verification')
    expect(verification?.status).toBe('failed')
    expect(verification?.output).toContain('FAIL — package still in package.json')
  })
})
