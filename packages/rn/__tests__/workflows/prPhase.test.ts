import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { prPhase } from '../../src/workflows/phases/prPhase'
import { ModelRouter } from '../../src/model/ModelRouter'
import type { WorkflowContext, PullRequest } from '../../src/adapters/types'

const REMOVE_DEP_INTENT = JSON.stringify({
  intents: [{ type: 'remove-dependency', dependency: 'appcenter', confidence: 1, reasoning: 'remove appcenter' }],
})

function createContext(projectRoot: string, intentContent = REMOVE_DEP_INTENT): WorkflowContext {
  const router = new ModelRouter()
  router.initialize({ provider: 'local' })
  jest.spyOn(router, 'generate').mockResolvedValue({
    content: intentContent,
    provider: 'mock',
  })
  const git = {
    name: 'mock',
    createBranch: jest.fn(async () => undefined),
    commit: jest.fn(async () => 'sha'),
    push: jest.fn(async () => undefined),
    createPullRequest: jest.fn(async (): Promise<PullRequest | null> => ({
      id: 'pr-1',
      number: 12,
      url: 'https://github.com/acme/app/pull/12',
      title: 'chore: remove appcenter',
    })),
    commentPullRequest: jest.fn(async () => undefined),
    upsertPullRequestComment: jest.fn(async () => undefined),
  }
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
        reactVersion: '18.2.0',
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
        {
          id: 'tests',
          name: 'Tests',
          description: '',
          status: 'completed',
          output: '',
          artifacts: [{ type: 'qa', title: 'Test', content: 'x', path: '__tests__/remove-appcenter.test.ts' }],
        },
        {
          id: 'implementation',
          name: 'Implementation',
          description: '',
          status: 'completed',
          output: '',
          artifacts: [{ type: 'engineering', title: 'x', content: 'x', path: 'scripts/remove-appcenter.sh' }],
        },
        {
          id: 'code-review',
          name: 'Code review',
          description: '',
          status: 'completed',
          output: [
            '# Code Review Report',
            '',
            '**Summary:** 0 error(s), 1 warning(s)',
            '',
            '## Self-healing',
            '',
            '- Attempt 1: feeding 2 finding(s) back to the model',
            '- `scripts/remove-appcenter.sh`: fixed 2 finding(s)',
            '',
          ].join('\n'),
          artifacts: [],
        },
        {
          id: 'verification',
          name: 'Verification',
          description: '',
          status: 'completed',
          output: 'Tests: passed (exit 0)\nLint: passed (exit 0)',
          artifacts: [],
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    adapters: {
      projectManagement: { name: 'mock', createTasks: jest.fn(), updateTasks: jest.fn(), closeTasks: jest.fn(), readTicket: jest.fn(async () => null) },
      git,
      testRunner: { name: 'mock', runTests: jest.fn(), runLint: jest.fn(), runTypeCheck: jest.fn() },
      simulator: { name: 'mock', run: jest.fn() },
      design: { name: 'mock', analyzeMotion: jest.fn() },
    },
    modelRouter: router,
  }
}

describe('prPhase', () => {
  let projectRoot: string

  beforeEach(() => {
    projectRoot = join(tmpdir(), `vectalon-pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
    mkdirSync(projectRoot, { recursive: true })
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'app', scripts: { lint: 'eslint', test: 'jest' }, dependencies: { 'react-native': '0.72.0' } }, null, 2)
    )
  })

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  it('creates a branch, commits implementation + CI files, opens a PR, and posts the review comment', async () => {
    const ctx = createContext(projectRoot)
    const result = await prPhase.run(ctx)

    expect(result.status).toBe('completed')
    expect(ctx.adapters.git.createBranch).toHaveBeenCalledWith(expect.stringContaining('feature/'))

    const commitFiles = (ctx.adapters.git.commit as jest.Mock).mock.calls[0][0].files as string[]
    expect(commitFiles).toContain('scripts/remove-appcenter.sh')
    expect(commitFiles).toContain('__tests__/remove-appcenter.test.ts')
    expect(commitFiles).toContain('.github/workflows/vectalon-ci.yml')
    expect(existsSync(join(projectRoot, '.github', 'workflows', 'vectalon-ci.yml'))).toBe(true)

    expect(ctx.adapters.git.push).toHaveBeenCalled()
    expect(ctx.adapters.git.createPullRequest).toHaveBeenCalled()

    const prInput = (ctx.adapters.git.createPullRequest as jest.Mock).mock.calls[0][0]
    expect(prInput.body).toContain('## What changed')
    expect(prInput.body).toContain('scripts/remove-appcenter.sh')
    expect(prInput.body).toContain('.github/workflows/vectalon-ci.yml (generated CI workflow)')
    expect(prInput.body).toContain('## Why')
    expect(prInput.body).toContain('Code review: 0 error(s), 1 warning(s)')
    expect(prInput.body).toContain('fixed 2 finding(s)')
    expect(prInput.body).toContain('Tests: passed (exit 0)')
    expect(prInput.body).toContain('## Checklist')

    expect(ctx.adapters.git.commentPullRequest).toHaveBeenCalledWith(12, expect.stringContaining('## Code review'))
    expect(result.output).toContain('https://github.com/acme/app/pull/12')
  })

  it('generates the EAS workflow for Expo projects and includes it in the commit', async () => {
    const ctx = createContext(projectRoot)
    ctx.snapshot = {
      ...ctx.snapshot!,
      project: { ...ctx.snapshot!.project, expoSdkVersion: '52.0.0', dependencies: { expo: '~52.0.0' } },
    }

    const result = await prPhase.run(ctx)
    expect(result.status).toBe('completed')

    const commitFiles = (ctx.adapters.git.commit as jest.Mock).mock.calls[0][0].files as string[]
    expect(commitFiles).toContain('.eas/workflows/vectalon.yml')
    expect(existsSync(join(projectRoot, '.eas', 'workflows', 'vectalon.yml'))).toBe(true)
    expect(existsSync(join(projectRoot, '.github', 'workflows', 'vectalon-ci.yml'))).toBe(false)
  })

  it('does not overwrite an existing CI workflow', () => {
    const existing = join(projectRoot, '.github', 'workflows', 'vectalon-ci.yml')
    mkdirSync(join(projectRoot, '.github', 'workflows'), { recursive: true })
    writeFileSync(existing, '# user authored')

    const ctx = createContext(projectRoot)
    return prPhase.run(ctx).then(result => {
      expect(result.status).toBe('completed')
      expect(readFileSync(existing, 'utf-8')).toBe('# user authored')
      const commitFiles = (ctx.adapters.git.commit as jest.Mock).mock.calls[0][0].files as string[]
      // The existing workflow is left untouched but the phase still commits the feature.
      expect(commitFiles).toContain('scripts/remove-appcenter.sh')
    })
  })

  it('does not fail the phase when posting the review comment throws', async () => {
    const ctx = createContext(projectRoot)
    ;(ctx.adapters.git.commentPullRequest as jest.Mock).mockRejectedValue(new Error('network down'))

    const result = await prPhase.run(ctx)
    expect(result.status).toBe('completed')
    expect(result.output).toContain('https://github.com/acme/app/pull/12')
  })

  it('handles a null PR gracefully (no token / no gh) without failing the phase', async () => {
    const ctx = createContext(projectRoot)
    ;(ctx.adapters.git.createPullRequest as jest.Mock).mockResolvedValue(null)

    const result = await prPhase.run(ctx)
    expect(result.status).toBe('completed')
    expect(result.output).toContain('not created')
    expect(ctx.adapters.git.commentPullRequest).not.toHaveBeenCalled()
  })

  it('skips CI workflow generation on dry-run (console git adapter)', async () => {
    const ctx = createContext(projectRoot)
    ctx.adapters.git = {
      ...ctx.adapters.git,
      name: 'console',
      createBranch: jest.fn(async () => undefined),
      commit: jest.fn(async () => 'sha'),
      push: jest.fn(async () => undefined),
      createPullRequest: jest.fn(async () => ({ id: 'c1', number: 1, url: 'https://example.com/pr/1', title: 'x' })),
      commentPullRequest: jest.fn(async () => undefined),
      upsertPullRequestComment: jest.fn(async () => undefined),
    }

    const result = await prPhase.run(ctx)
    expect(result.status).toBe('completed')
    expect(existsSync(join(projectRoot, '.github', 'workflows', 'vectalon-ci.yml'))).toBe(false)
    const commitFiles = (ctx.adapters.git.commit as jest.Mock).mock.calls[0][0].files as string[]
    expect(commitFiles).not.toContain('.github/workflows/vectalon-ci.yml')
  })

  it('reports a failed phase when the branch cannot be created', async () => {
    const ctx = createContext(projectRoot)
    ;(ctx.adapters.git.createBranch as jest.Mock).mockRejectedValue(new Error('not a git repo'))

    const result = await prPhase.run(ctx)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('not a git repo')
  })
})
