import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { TeamStore } from '../../src/knowledge/TeamStore'
import { resetConfig } from '../../src/config'
import { createTempProject, cleanup, useTempConfig, writeProjectFile } from '../helpers/tmp'
import { join } from 'path'

const PROJECT = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { 'react-native': '0.72.0' },
  }),
  'src/screens/PaymentScreen.tsx': 'export default function PaymentScreen() { return <View /> }',
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

describe('MCPServer team brain tools', () => {
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

  function createServer(artifactStore: ArtifactStore | null, teamStore: TeamStore | null, safeMode = false) {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    return new MCPServer(engine, router, 'mcp', artifactStore, teamStore, [], { root: dir, safeMode })
  }

  it('advertises team brain tools only when the matching service is present', () => {
    const withBoth = createServer(new ArtifactStore(dir), buildTeamStore())
    const names = withBoth.getToolList().map(t => t.name)
    expect(names).toEqual(expect.arrayContaining(['generate_team_brain', 'search_team_knowledge']))

    const withStoreOnly = createServer(new ArtifactStore(dir), null)
    const names2 = withStoreOnly.getToolList().map(t => t.name)
    expect(names2).toContain('generate_team_brain')
    expect(names2).not.toContain('search_team_knowledge')

    const withoutStore = createServer(null, null)
    const names3 = withoutStore.getToolList().map(t => t.name)
    expect(names3).not.toContain('generate_team_brain')
    expect(names3).not.toContain('search_team_knowledge')
  })

  it('hides generate_team_brain in safe mode but keeps the read-only search', () => {
    const server = createServer(new ArtifactStore(dir), buildTeamStore(), true)
    const names = server.getToolList().map(t => t.name)
    expect(names).not.toContain('generate_team_brain')
    expect(names).toContain('search_team_knowledge')
  })

  it('every team brain tool has a callable handler', async () => {
    const server = createServer(new ArtifactStore(dir), buildTeamStore())
    for (const tool of server.getToolList()) {
      if (tool.name !== 'generate_team_brain' && tool.name !== 'search_team_knowledge') continue
      const args: Record<string, unknown> = {}
      if (tool.name === 'search_team_knowledge') args.query = 'payment'

      const result = await server.handleToolCall({ id: '1', name: tool.name, arguments: args })
      expect(result.isError).not.toBe(true)
      expect(result.content.length).toBeGreaterThan(0)
    }
  })

  it('generate_team_brain seeds the knowledge base idempotently and writes docs', async () => {
    // A decision record so the ADR/decision index (042/048) has input.
    writeProjectFile(dir, join('docs', 'adr', '0001-use-stripe.md'), '# 1. Use Stripe as the payment gateway\n\nStatus: Accepted\n')
    const store = new ArtifactStore(dir)
    const server = createServer(store, buildTeamStore())

    const first = await server.handleToolCall({ id: '1', name: 'generate_team_brain', arguments: {} })
    expect(first.isError).not.toBe(true)
    const parsed = JSON.parse(first.content)
    expect(parsed.projectName).toBe('app')
    expect(parsed.glossaryTerms).toBeGreaterThanOrEqual(0)
    expect(parsed.decisionsIndexed).toBeGreaterThanOrEqual(1)
    expect(parsed.artifacts.created).toBeGreaterThan(0)
    expect(parsed.artifacts.total).toBeGreaterThanOrEqual(parsed.artifacts.created)
    // The seeded knowledge base is queryable via the existing search surface.
    expect(store.list().some(a => a.meta['vectalon-team'] === '1')).toBe(true)

    // Second run is idempotent — nothing new created or updated.
    const second = await server.handleToolCall({ id: '2', name: 'generate_team_brain', arguments: {} })
    const parsed2 = JSON.parse(second.content)
    expect(parsed2.artifacts.created).toBe(0)
    expect(parsed2.artifacts.updated).toBe(0)
  })

  it('search_team_knowledge returns ranked hits across projects', async () => {
    // Seed an artifact into the serve root so the local project is searchable.
    const store = new ArtifactStore(dir)
    store.add({ type: 'engineering', title: 'Coding Standards', content: 'Use TypeScript strict mode everywhere.' })
    const server = createServer(store, buildTeamStore())

    const result = await server.handleToolCall({
      id: '1',
      name: 'search_team_knowledge',
      arguments: { query: 'strict' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Coding Standards')
    expect(result.content).toContain('"project"')
  })

  it('search_team_knowledge scopes by team and type', async () => {
    // Team scoping reads .vectalon/team.json from disk: the local project
    // inherits the config team, a registered project overrides with its own.
    const paymentsDir = createTempProject({})
    tempDirs.push(paymentsDir)
    const paymentsStore = new ArtifactStore(paymentsDir)
    paymentsStore.add({ type: 'operations', title: 'Runbook: Payment Outage', content: 'Restart the payment service.' })
    writeProjectFile(dir, join('.vectalon', 'team.json'), JSON.stringify({
      team: 'mobile',
      projects: [{ name: 'payments', path: paymentsDir, team: 'backend' }],
    }))
    const store = new ArtifactStore(dir)
    store.add({ type: 'product', title: 'PRD: Camera Onboarding', content: 'Users capture their ID.' })
    const server = createServer(store, buildTeamStore())

    const byTeam = await server.handleToolCall({
      id: '1',
      name: 'search_team_knowledge',
      arguments: { query: 'users', team: 'mobile' },
    })
    expect(byTeam.isError).not.toBe(true)
    expect(byTeam.content).toContain('Camera Onboarding')
    // The payments project has team backend — excluded by the mobile scope.
    expect(byTeam.content).not.toContain('Runbook: Payment Outage')

    const byType = await server.handleToolCall({
      id: '1',
      name: 'search_team_knowledge',
      arguments: { query: 'users', type: 'operations' },
    })
    expect(byType.isError).not.toBe(true)
    expect(byType.content).not.toContain('Camera Onboarding')
  })

  it('search_team_knowledge validates missing query and unknown type', async () => {
    const server = createServer(new ArtifactStore(dir), buildTeamStore())

    const noQuery = await server.handleToolCall({ id: '1', name: 'search_team_knowledge', arguments: {} })
    expect(noQuery.isError).toBe(true)
    expect(noQuery.content).toContain('Invalid tool arguments')
    expect(noQuery.content).toContain('query')

    const badType = await server.handleToolCall({
      id: '1',
      name: 'search_team_knowledge',
      arguments: { query: 'payment', type: 'not-a-type' },
    })
    expect(badType.isError).toBe(true)
    expect(badType.content).toContain('Unknown artifact type')
  })

  it('search_team_knowledge reports no matches gracefully', async () => {
    const server = createServer(new ArtifactStore(dir), buildTeamStore())
    const result = await server.handleToolCall({
      id: '1',
      name: 'search_team_knowledge',
      arguments: { query: 'quantum-teleportation' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('No team knowledge matched')
  })

  it('search_team_knowledge surfaces scores on the hash-embedding path', async () => {
    // searchTeamBrain searches disk-backed stores at the serve root (not the
    // in-memory ctx.teamStore), so seed artifacts there directly.
    const store = new ArtifactStore(dir)
    store.add({ type: 'operations', title: 'Runbook', content: 'restart the billing and checkout services on outage' })

    const server = createServer(store, buildTeamStore())
    const result = await server.handleToolCall({
      id: '1',
      name: 'search_team_knowledge',
      arguments: { query: 'payment service down' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Runbook')
    expect(result.content).toContain('"score"')
    expect(result.content).not.toContain('No team knowledge matched')
  })
})
