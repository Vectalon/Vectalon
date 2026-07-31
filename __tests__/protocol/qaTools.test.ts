import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { resetConfig } from '../../src/config'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: {} }),
}

describe('MCPServer QA tools', () => {
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

  it('advertises the QA tools', () => {
    const names = createServer(true).server.getToolList().map(t => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'write_test_plan',
        'triage_bugs',
        'analyze_root_cause',
        'review_code',
        'suggest_refactors',
      ])
    )
  })

  it('write_test_plan returns a deterministic test plan and persists it', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({
      id: '1',
      name: 'write_test_plan',
      arguments: { feature: 'Onboarding', scope: 'camera, signup' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Test Plan — Onboarding')
    expect(result.content).toContain('camera')
    expect(result.content).toContain('## Exit Criteria')
    expect(store!.findByType('qa').length).toBe(1)
  })

  it('triage_bugs triages by severity and sorts', async () => {
    const { server } = createServer(false)
    const result = await server.handleToolCall({
      id: '1',
      name: 'triage_bugs',
      arguments: { bugs: 'App crashes on startup\nFix typo on settings screen' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Bug Triage')
    expect(result.content).toContain('B-1')
    expect(result.content).toContain('critical')
    expect(result.content).toContain('p0')
    expect(result.content).toContain('p3')
  })

  it('analyze_root_cause returns a cause bucket', async () => {
    const { server } = createServer(false)
    const result = await server.handleToolCall({
      id: '1',
      name: 'analyze_root_cause',
      arguments: { issue: 'null is not an object' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('null-reference')
  })

  it('review_code reports deterministic findings', async () => {
    const { server } = createServer(false)
    const result = await server.handleToolCall({
      id: '1',
      name: 'review_code',
      arguments: { code: "import React from 'react'\nconsole.log('hi')\nconst x: any = 1\n" },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('no-console-log')
    expect(result.content).toContain('no-any')
  })

  it('review_code persists an engineering artifact when a store exists', async () => {
    const { server, store } = createServer(true)
    await server.handleToolCall({ id: '1', name: 'review_code', arguments: { code: 'const x = 1\n' } })
    expect(store!.findByType('engineering').length).toBe(1)
  })

  it('suggest_refactors returns refactor suggestions', async () => {
    const { server } = createServer(false)
    const result = await server.handleToolCall({
      id: '1',
      name: 'suggest_refactors',
      arguments: { code: 'const x: any = 320\n', filename: 'Foo.tsx' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('avoid-any')
  })

  it('write_test generates deterministic cases from acceptance criteria', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({
      id: '1',
      name: 'write_test',
      arguments: {
        target: 'Button.tsx',
        acceptanceCriteria: '- Given the user taps, when they press the button, then the action fires.',
      },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain("describe('Button'")
    expect(result.content).toContain("it('the action fires'")
    expect(store!.findByType('qa').length).toBe(1)
  })
})
