import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { resetConfig } from '../../src/config'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { 'react-native': '0.72.0' },
  }),
}

describe('MCPServer knowledge tools', () => {
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

  function createServerWithKnowledge() {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    const store = new ArtifactStore(dir)
    const prd = store.add({ type: 'product', title: 'PRD', content: '# PRD' })
    const story = store.add({ type: 'requirements', title: 'Story', content: 'As a user' })
    store.link(prd.id, story.id)
    return { server: new MCPServer(engine, router, 'mcp', store), store }
  }

  it('advertises the knowledge tools when a store is provided', () => {
    const { server } = createServerWithKnowledge()
    const names = server.getToolList().map(t => t.name)
    expect(names).toEqual(
      expect.arrayContaining(['list_artifacts', 'get_artifact', 'get_knowledge_context', 'link_artifacts'])
    )
  })

  it('list_artifacts returns the stored artifacts', async () => {
    const { server } = createServerWithKnowledge()
    const result = await server.handleToolCall({ id: '1', name: 'list_artifacts', arguments: {} })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('PRD')
    expect(result.content).toContain('Story')
  })

  it('get_artifact returns an artifact by id and errors for unknown ids', async () => {
    const { server, store } = createServerWithKnowledge()
    const prd = store.findByType('product')[0]

    const found = await server.handleToolCall({ id: '1', name: 'get_artifact', arguments: { id: prd.id } })
    expect(found.isError).not.toBe(true)
    expect(found.content).toContain('# PRD')

    const missing = await server.handleToolCall({ id: '1', name: 'get_artifact', arguments: { id: 'nope' } })
    expect(missing.isError).toBe(true)
    expect(missing.content).toContain('Artifact not found')
  })

  it('get_knowledge_context builds a role context and errors for unknown roles', async () => {
    const { server } = createServerWithKnowledge()

    const ba = await server.handleToolCall({ id: '1', name: 'get_knowledge_context', arguments: { role: 'ba' } })
    expect(ba.isError).not.toBe(true)
    expect(ba.content).toContain('# Knowledge context for ba')
    expect(ba.content).toContain('PRD')

    const unknown = await server.handleToolCall({ id: '1', name: 'get_knowledge_context', arguments: { role: 'nobody' } })
    expect(unknown.isError).toBe(true)
    expect(unknown.content).toContain('Unknown role')
  })

  it('link_artifacts links two artifacts', async () => {
    const { server, store } = createServerWithKnowledge()
    const prd = store.findByType('product')[0]
    const task = store.add({ type: 'engineering', title: 'Task', content: 'implement' })

    const result = await server.handleToolCall({
      id: '1',
      name: 'link_artifacts',
      arguments: { parentId: prd.id, childId: task.id },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Linked')
    expect(store.get(prd.id)?.links).toContain(task.id)

    const missing = await server.handleToolCall({
      id: '1',
      name: 'link_artifacts',
      arguments: { parentId: 'nope', childId: task.id },
    })
    expect(missing.isError).toBe(true)
  })
})
