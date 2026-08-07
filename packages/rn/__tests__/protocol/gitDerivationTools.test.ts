import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { resetConfig } from '../../src/config'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

// The path-based auto-run branch shells out to `git log`; stub it so the test
// proves the wiring without depending on a real repo.
jest.mock('../../src/adapters/runCommand', () => ({
  runCommand: jest.fn(async () => ({
    success: true,
    stdout: 'a1b2c3d|Jane Doe|2026-08-06 10:00:00 +0000|feat: add login screen\nf1e2d3c|Bob|2026-08-05 09:00:00 +0000|fix: crash on startup',
    stderr: '',
    exitCode: 0,
  })),
}))

const PROJECT = {
  'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: {} }),
}

describe('MCPServer git-history derivation tools', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
    dir = createTempProject(PROJECT)
    configDir = useTempConfig()
    resetConfig()
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  function createServer(withKnowledge: boolean) {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    const store = withKnowledge ? new ArtifactStore(dir) : null
    return { server: new MCPServer(engine, router, 'mcp', store), store }
  }

  it('advertises the derive_from_git_history tool', () => {
    const names = createServer(true).server.getToolList().map(t => t.name)
    expect(names).toEqual(expect.arrayContaining(['derive_from_git_history']))
  })

  it('derives changelog + release notes from gitLog and persists a devops artifact', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({
      id: '1',
      name: 'derive_from_git_history',
      arguments: {
        gitLog: 'a1b2c3d feat: add login screen\nf1e2d3c fix: crash on startup',
        currentVersion: '1.2.3',
      },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('## 📜 Derived from git history')
    expect(result.content).toContain('# Changelog')
    expect(result.content).toContain('## Added')
    expect(result.content).toContain('1.2.3 → 1.3.0')
    expect(result.content).toContain('# Release Notes — v1.3.0')
    expect(store!.findByType('devops').length).toBe(1)
  })

  it('persists derived ADR drafts as architecture artifacts by default', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({
      id: '1',
      name: 'derive_from_git_history',
      arguments: { gitLog: 'a1b2c3d feat: migrate auth to react-native-keychain' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Derived ADR drafts (1)')
    const architecture = store!.findByType('architecture')
    expect(architecture.length).toBe(1)
    expect(architecture[0].title).toContain('ADR (derived)')
    expect(architecture[0].content).toContain('Status: proposed')
  })

  it('skips ADR artifacts when includeAdrs is false', async () => {
    const { server, store } = createServer(true)
    await server.handleToolCall({
      id: '1',
      name: 'derive_from_git_history',
      arguments: { gitLog: 'a1b2c3d feat: migrate auth', includeAdrs: false },
    })
    expect(store!.findByType('architecture').length).toBe(0)
    expect(store!.findByType('devops').length).toBe(1)
  })

  it('auto-runs git log when only a path is provided', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({
      id: '1',
      name: 'derive_from_git_history',
      arguments: { path: dir, currentVersion: '0.1.0' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Jane Doe')
    expect(result.content).toContain('## Added')
    expect(store!.findByType('devops').length).toBe(1)
  })

  it('returns guidance when neither gitLog nor path is provided', async () => {
    const { server } = createServer(false)
    const result = await server.handleToolCall({
      id: '1',
      name: 'derive_from_git_history',
      arguments: {},
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Pass `gitLog`')
  })
})
