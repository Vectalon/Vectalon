import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { TeamStore } from '../../src/knowledge/TeamStore'
import { resetConfig } from '../../src/config'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { 'react-native': '0.72.0' },
  }),
}

const tempDirs: string[] = []

function buildTeamStore(): TeamStore {
  const appDir = createTempProject({})
  tempDirs.push(appDir)
  const paymentsDir = createTempProject({})
  tempDirs.push(paymentsDir)
  const app = new ArtifactStore(appDir)
  const payments = new ArtifactStore(paymentsDir)
  app.add({ type: 'product', title: 'PRD: Camera Onboarding', content: 'Users capture their ID.' })
  payments.add({ type: 'operations', title: 'Runbook: Payment Outage', content: 'Restart the payment service.' })

  const team = new TeamStore()
  team.register({ name: 'app', team: 'mobile', store: app })
  team.register({ name: 'payments', team: 'backend', store: payments })
  return team
}

describe('MCPServer team tools', () => {
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
    for (const d of tempDirs) cleanup(d)
    tempDirs.length = 0
  })

  function createServer(teamStore: TeamStore | null) {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    const store = new ArtifactStore(dir)
    return new MCPServer(engine, router, 'mcp', store, teamStore)
  }

  it('advertises team tools only when a team store is provided', () => {
    const withTeam = createServer(buildTeamStore())
    const names = withTeam.getToolList().map(t => t.name)
    expect(names).toEqual(
      expect.arrayContaining(['get_team_context', 'search_knowledge'])
    )

    const withoutTeam = createServer(null)
    const names2 = withoutTeam.getToolList().map(t => t.name)
    expect(names2).not.toContain('get_team_context')
    expect(names2).not.toContain('search_knowledge')
  })

  it('every team tool has a callable handler', async () => {
    const server = createServer(buildTeamStore())
    for (const tool of server.getToolList()) {
      if (tool.name !== 'get_team_context' && tool.name !== 'search_knowledge') continue
      const args: Record<string, unknown> = {}
      if (tool.name === 'get_team_context') args.role = 'pm'
      if (tool.name === 'search_knowledge') args.query = 'payment'

      const result = await server.handleToolCall({ id: '1', name: tool.name, arguments: args })
      expect(result.isError).not.toBe(true)
      expect(result.content.length).toBeGreaterThan(0)
    }
  })

  it('get_team_context aggregates context across registered projects', async () => {
    const server = createServer(buildTeamStore())
    const result = await server.handleToolCall({ id: '1', name: 'get_team_context', arguments: {} })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('# Team knowledge context')
    expect(result.content).toContain('## app (mobile)')
    expect(result.content).toContain('## payments (backend)')
  })

  it('get_team_context scopes by project and role and rejects unknown roles', async () => {
    const server = createServer(buildTeamStore())

    const scoped = await server.handleToolCall({
      id: '1',
      name: 'get_team_context',
      arguments: { project: 'payments' },
    })
    expect(scoped.isError).not.toBe(true)
    expect(scoped.content).toContain('Runbook: Payment Outage')
    expect(scoped.content).not.toContain('Camera Onboarding')

    const unknown = await server.handleToolCall({
      id: '1',
      name: 'get_team_context',
      arguments: { role: 'nobody' },
    })
    expect(unknown.isError).toBe(true)
    expect(unknown.content).toContain('Unknown role')
  })

  it('search_knowledge returns ranked results across projects', async () => {
    const server = createServer(buildTeamStore())
    const result = await server.handleToolCall({
      id: '1',
      name: 'search_knowledge',
      arguments: { query: 'payment' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Runbook: Payment Outage')
    expect(result.content).toContain('"project": "payments"')
  })

  it('search_knowledge scopes by team and type', async () => {
    const server = createServer(buildTeamStore())

    const byTeam = await server.handleToolCall({
      id: '1',
      name: 'search_knowledge',
      arguments: { query: 'users', team: 'mobile' },
    })
    expect(byTeam.isError).not.toBe(true)
    expect(byTeam.content).toContain('Camera Onboarding')

    const byType = await server.handleToolCall({
      id: '1',
      name: 'search_knowledge',
      arguments: { query: 'users', type: 'operations' },
    })
    expect(byType.isError).not.toBe(true)
    expect(byType.content).not.toContain('Camera Onboarding')
  })

  it('search_knowledge returns helpful messages for empty queries and no matches', async () => {
    const server = createServer(buildTeamStore())

    const noQuery = await server.handleToolCall({ id: '1', name: 'search_knowledge', arguments: {} })
    expect(noQuery.isError).not.toBe(true)
    expect(noQuery.content).toContain('No query')

    const noMatch = await server.handleToolCall({
      id: '1',
      name: 'search_knowledge',
      arguments: { query: 'quantum-teleportation' },
    })
    expect(noMatch.isError).not.toBe(true)
    expect(noMatch.content).toContain('No artifacts matched')
  })

  it('search_knowledge rejects unknown artifact types', async () => {
    const server = createServer(buildTeamStore())
    const result = await server.handleToolCall({
      id: '1',
      name: 'search_knowledge',
      arguments: { query: 'payment', type: 'not-a-type' },
    })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('Unknown artifact type')
  })
})
