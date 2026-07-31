import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { resetConfig } from '../../src/config'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: {} }),
}

describe('MCPServer DevOps/ops/analytics tools', () => {
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

  it('advertises the DevOps/ops/analytics tools', () => {
    const names = createServer(true).server.getToolList().map(t => t.name)
    expect(names).toEqual(
      expect.arrayContaining(['write_release_notes', 'analyze_incident', 'write_runbook', 'analyze_kpis'])
    )
  })

  it('write_release_notes categorizes changes and persists a devops artifact', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({
      id: '1',
      name: 'write_release_notes',
      arguments: { version: '1.2.0', changes: 'Add camera onboarding\nFix login crash' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('v1.2.0')
    expect(result.content).toContain('## Added')
    expect(result.content).toContain('## Fixed')
    expect(store!.findByType('devops').length).toBe(1)
  })

  it('analyze_incident classifies severity and persists an operations artifact', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({
      id: '1',
      name: 'analyze_incident',
      arguments: { title: 'Nightly outage', description: 'App is down for all users' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Incident Analysis')
    expect(result.content).toContain('sev1')
    expect(store!.findByType('operations').length).toBe(1)
  })

  it('write_runbook numbers the steps and persists an operations artifact', async () => {
    const { server, store } = createServer(true)
    const result = await server.handleToolCall({
      id: '1',
      name: 'write_runbook',
      arguments: { title: 'Restart the backend', steps: 'SSH to the host\nRestart the service' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('1. SSH to the host')
    expect(result.content).toContain('2. Restart the service')
    expect(store!.findByType('operations').length).toBe(1)
  })

  it('analyze_kpis evaluates JSON metrics and persists an analytics artifact', async () => {
    const { server, store } = createServer(true)
    const metrics = JSON.stringify([
      { name: 'Retention', current: 75, previous: 60, target: 70 },
      { name: 'Churn', current: 5 },
    ])
    const result = await server.handleToolCall({ id: '1', name: 'analyze_kpis', arguments: { metrics } })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('KPI Report')
    expect(result.content).toContain('Retention')
    expect(result.content).toContain('on-track')
    expect(store!.findByType('analytics').length).toBe(1)
  })
})
