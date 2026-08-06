import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { resetConfig } from '../../src/config'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: {} }),
}

describe('MCPServer architecture/security/UX tools', () => {
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

  it('advertises the architecture/security/UX tools', () => {
    const names = createServer(true).server.getToolList().map(t => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'write_adr',
        'analyze_tradeoffs',
        'threat_model',
        'check_accessibility',
        'extract_design_system',
        'generate_wireframe',
      ])
    )
  })

  it('write_adr returns an ADR scaffold and persists an architecture artifact', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({
      id: '1',
      name: 'write_adr',
      arguments: { title: 'Use TypeScript', context: 'The codebase is untyped', options: 'TypeScript, Flow', decision: 'TypeScript' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('# ADR-1: Use TypeScript')
    expect(result.content).toContain('- TypeScript')
    expect(result.content).toContain('- Flow')
    expect(store!.findByType('architecture').length).toBe(1)
  })

  it('analyze_tradeoffs ranks JSON options and reports the best', async () => {
    const { server, store } = createServer(true)
    const options = JSON.stringify([
      { name: 'Option A', scores: { cost: 1, speed: 2 } },
      { name: 'Option B', scores: { cost: 3, speed: 4 } },
    ])
    const result = await server.handleToolCall({ id: '1', name: 'analyze_tradeoffs', arguments: { options } })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Tradeoff Analysis')
    expect(result.content).toContain('Best option: Option B')
    expect(store!.findByType('architecture').length).toBe(1)
  })

  it('threat_model returns a STRIDE model and persists a security artifact', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({ id: '1', name: 'threat_model', arguments: { feature: 'Login' } })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Threat Model')
    expect(result.content).toContain('Spoofing')
    expect(result.content).toContain('Login')
    expect(store!.findByType('security').length).toBe(1)
  })

  it('check_accessibility flags an unlabelled image and persists a design artifact', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({
      id: '1',
      name: 'check_accessibility',
      arguments: { code: '<Image source={require("./a.png")} />' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('image-no-label')
    expect(store!.findByType('design').length).toBe(1)
  })

  it('extract_design_system extracts tokens and persists a design artifact', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({
      id: '1',
      name: 'extract_design_system',
      arguments: { code: "color: '#FF5500'\nfontSize: 16" },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('#ff5500')
    expect(store!.findByType('design').length).toBe(1)
  })

  it('generate_wireframe renders an ASCII wireframe and persists a design artifact', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({
      id: '1',
      name: 'generate_wireframe',
      arguments: { title: 'Login', sections: 'header, hero, list, footer' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('HEADER')
    expect(result.content).toContain('HERO')
    expect(store!.findByType('design').length).toBe(1)
  })
})
