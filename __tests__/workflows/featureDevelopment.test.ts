import { featureDevelopmentWorkflow } from '../../src/workflows/definitions/featureDevelopment'
import { WorkflowEngine } from '../../src/workflows/WorkflowEngine'
import { createWorkflowState } from '../../src/workflows/WorkflowState'
import type { WorkflowContext } from '../../src/adapters/types'
import { createAdapters } from '../../src/adapters'
import { ModelRouter } from '../../src/model/ModelRouter'

function makeContext(prompt: string): WorkflowContext {
  return {
    projectRoot: '/tmp',
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
  it('runs all 11 phases for a login + API prompt', async () => {
    const engine = new WorkflowEngine()
    const ctx = makeContext('Login')
    ctx.modelRouter.initialize({ provider: 'local' })

    const result = await engine.run(featureDevelopmentWorkflow, ctx)

    expect(result.status).toBe('completed')
    expect(result.phases).toHaveLength(11)

    const phaseIds = result.phases.map(p => p.id)
    expect(phaseIds).toEqual([
      'prd',
      'scope',
      'design',
      'architecture',
      'tasks',
      'implementation',
      'verification',
      'readiness',
      'pr',
      'documentation',
      'close',
    ])

    const implementation = result.phases.find(p => p.id === 'implementation')
    expect(implementation?.output).toContain('src/services/LoginApi.ts')
    expect(implementation?.output).toContain('src/hooks/useLogin.ts')
    expect(implementation?.output).toContain('src/screens/LoginScreen.tsx')

    const design = result.phases.find(p => p.id === 'design')
    expect(design?.output).toContain('Motion design recommendations')

    const readiness = result.phases.find(p => p.id === 'readiness')
    expect(readiness?.output).toContain('Status: GO')
  })

  it('handles the verification phase failure', async () => {
    const engine = new WorkflowEngine()
    const ctx = makeContext('Login')
    ctx.modelRouter.initialize({ provider: 'local' })
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

  it('detects dependency still installed and fails verification', async () => {
    const engine = new WorkflowEngine()
    const ctx = makeContext('Remove appcenter safely from this project')
    ctx.modelRouter.initialize({ provider: 'local' })
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
