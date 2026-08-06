import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { resetConfig } from '../../src/config'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: {} }),
}

describe('MCPServer BA tools', () => {
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

  it('advertises the BA tools alongside the knowledge tools', () => {
    const { server } = createServer(true)
    const names = server.getToolList().map(t => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'write_prd',
        'write_user_stories',
        'define_acceptance_criteria',
        'analyze_support_tickets',
        'run_gap_analysis',
      ])
    )
  })

  it('write_prd returns a deterministic PRD scaffold', async () => {
    const { server } = createServer(false)
    const result = await server.handleToolCall({
      id: '1',
      name: 'write_prd',
      arguments: { projectName: 'Acme', feature: 'Camera Onboarding', featureIdeas: 'one-tap selfie' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Camera Onboarding')
    expect(result.content).toContain('Acme')
    expect(result.content).toContain('one-tap selfie')
    expect(result.content).toContain('## Success Metrics')
  })

  it('write_prd persists a product artifact when a store exists', async () => {
    const { server, store } = createServer(true)
    await server.handleToolCall({ id: '1', name: 'write_prd', arguments: { feature: 'Camera Onboarding' } })
    const prds = store!.findByType('product')
    expect(prds).toHaveLength(1)
    expect(prds[0].source).toBe('generated')
    expect(prds[0].content).toContain('Camera Onboarding')
  })

  it('write_prd can enhance the scaffold through the model layer when asked', async () => {
    const { server } = createServer(false)
    const result = await server.handleToolCall({
      id: '1',
      name: 'write_prd',
      arguments: { feature: 'Onboarding', enhance: true },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Expand the following')
  })

  it('write_user_stories returns deterministic story cards for each persona', async () => {
    const { server } = createServer(false)
    const result = await server.handleToolCall({
      id: '1',
      name: 'write_user_stories',
      arguments: { feature: 'Onboarding', personas: 'new user, returning user' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('As a new user, I want to Onboarding')
    expect(result.content).toContain('As a returning user, I want to Onboarding')
  })

  it('write_user_stories links to a parent artifact via parentId', async () => {
    const { server, store } = createServer(true)
    const prd = store!.add({ type: 'product', title: 'PRD', content: 'x' })
    await server.handleToolCall({
      id: '1',
      name: 'write_user_stories',
      arguments: { feature: 'Onboarding', parentId: prd.id },
    })
    const stories = store!.findByType('requirements')
    expect(stories).toHaveLength(1)
    expect(store!.get(prd.id)?.links).toContain(stories[0].id)
  })

  it('define_acceptance_criteria extracts the want from a story', async () => {
    const { server } = createServer(false)
    const result = await server.handleToolCall({
      id: '1',
      name: 'define_acceptance_criteria',
      arguments: { story: 'As a user, I want to reset my password so that I can regain access' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('reset my password')
    expect(result.content).toContain('Given')
    expect(result.content).toContain('when')
  })

  it('analyze_support_tickets groups tickets into themes', async () => {
    const { server } = createServer(false)
    const tickets = 'App crashed on startup\nApp crashed again after login\nPassword reset email not arriving'
    const result = await server.handleToolCall({ id: '1', name: 'analyze_support_tickets', arguments: { tickets } })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('crash (2)')
    expect(result.content).toContain('Total tickets: 3')
  })

  it('analyze_support_tickets persists a research artifact when a store exists', async () => {
    const { server, store } = createServer(true)
    await server.handleToolCall({ id: '1', name: 'analyze_support_tickets', arguments: { tickets: 'crashed' } })
    expect(store!.findByType('research').length).toBe(1)
  })

  it('run_gap_analysis reports missing and met capabilities', async () => {
    const { server } = createServer(false)
    const result = await server.handleToolCall({
      id: '1',
      name: 'run_gap_analysis',
      arguments: { desired: 'camera, sync', current: 'camera' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Missing')
    expect(result.content).toContain('sync')
    expect(result.content).toContain('Met')
    expect(result.content).toContain('camera')
  })
})
