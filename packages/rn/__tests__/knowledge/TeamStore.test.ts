import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { TeamStore } from '../../src/knowledge/TeamStore'
import { HashEmbeddingProvider } from '../../src/knowledge/embeddings'
import type { RemoteEmbeddingProvider } from '../../src/knowledge/remoteEmbeddings'
import { createTempProject, cleanup } from '../helpers/tmp'

const tempDirs: string[] = []

function projectStore(artifacts: Array<{ type: string; title: string; content: string }>): ArtifactStore {
  const dir = createTempProject({})
  tempDirs.push(dir)
  const store = new ArtifactStore(dir)
  for (const a of artifacts) {
    store.add({ type: a.type as never, title: a.title, content: a.content })
  }
  return store
}

describe('TeamStore', () => {
  let appStore: ArtifactStore
  let paymentsStore: ArtifactStore

  beforeEach(() => {
    appStore = projectStore([
      { type: 'product', title: 'PRD: Camera Onboarding', content: 'Users capture their ID for onboarding.' },
      { type: 'requirements', title: 'Story: Capture ID', content: 'As a new user, I want to capture my ID so I can verify my identity.' },
      { type: 'analytics', title: 'KPI: Retention', content: 'Track weekly retention after onboarding.' },
    ])
    paymentsStore = projectStore([
      { type: 'architecture', title: 'ADR: Payment Gateway', content: 'Use Stripe for checkout flows.' },
      { type: 'operations', title: 'Runbook: Payment Outage', content: 'Restart the payment service when checkout is down.' },
    ])
  })

  afterEach(() => {
    for (const dir of tempDirs) cleanup(dir)
    tempDirs.length = 0
  })

  it('registers projects and summarizes them with artifact counts', () => {
    const team = new TeamStore()
    team.register({ name: 'app', team: 'mobile', store: appStore })
    team.register({ name: 'payments', team: 'backend', store: paymentsStore })

    expect(team.projects()).toEqual([
      { name: 'app', team: 'mobile', artifactCount: 3 },
      { name: 'payments', team: 'backend', artifactCount: 2 },
    ])
  })

  it('replaces a previously registered project with the same name', () => {
    const team = new TeamStore()
    team.register({ name: 'app', store: appStore })
    team.register({ name: 'app', store: paymentsStore })

    expect(team.projects()).toHaveLength(1)
    expect(team.projects()[0].artifactCount).toBe(2)
  })

  it('searches across projects with project and team context', () => {
    const team = new TeamStore()
    team.register({ name: 'app', team: 'mobile', store: appStore })
    team.register({ name: 'payments', team: 'backend', store: paymentsStore })

    const results = team.search({ query: 'retention' })
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ project: 'app', team: 'mobile' })
    expect(results[0].artifact.title).toContain('Retention')
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('scopes search results by team', () => {
    const team = new TeamStore()
    team.register({ name: 'app', team: 'mobile', store: appStore })
    team.register({ name: 'payments', team: 'backend', store: paymentsStore })

    const results = team.search({ query: 'restart', team: 'backend' })
    expect(results).toHaveLength(1)
    expect(results[0].team).toBe('backend')
    expect(results[0].artifact.title).toBe('Runbook: Payment Outage')
  })

  it('scopes search results by project', () => {
    const team = new TeamStore()
    team.register({ name: 'app', team: 'mobile', store: appStore })
    team.register({ name: 'payments', team: 'backend', store: paymentsStore })

    const results = team.search({ query: 'onboarding', project: 'app' })
    expect(results).toHaveLength(2)
    expect(results.every(r => r.project === 'app')).toBe(true)
  })

  it('scopes search results by artifact type', () => {
    const team = new TeamStore()
    team.register({ name: 'app', team: 'mobile', store: appStore })

    const results = team.search({ query: 'users', type: 'product' })
    expect(results).toHaveLength(1)
    expect(results[0].artifact.type).toBe('product')
    expect(results[0].artifact.title).toContain('PRD')
  })

  it('ranks title matches above content matches', () => {
    const team = new TeamStore()
    team.register({ name: 'titled', store: projectStore([{ type: 'product', title: 'Retention Strategy', content: 'growth work' }]) })
    team.register({ name: 'contented', store: projectStore([{ type: 'product', title: 'Roadmap', content: 'retention is our north star' }]) })

    const results = team.search({ query: 'retention' })
    expect(results[0].project).toBe('titled')
  })

  it('respects the limit and returns no results for an empty query', () => {
    const team = new TeamStore()
    team.register({ name: 'app', store: appStore })
    team.register({ name: 'payments', store: paymentsStore })

    expect(team.search({ query: '' })).toEqual([])
    expect(team.search({ query: 'service' })).toHaveLength(1)
    expect(team.search({ query: 'service', limit: 0 })).toEqual([])
  })

  it('builds an aggregated context grouped by project', () => {
    const team = new TeamStore()
    team.register({ name: 'app', team: 'mobile', store: appStore })
    team.register({ name: 'payments', team: 'backend', store: paymentsStore })

    const ctx = team.context()
    expect(ctx).toContain('# Team knowledge context')
    expect(ctx).toContain('## app (mobile)')
    expect(ctx).toContain('## payments (backend)')
    expect(ctx).toContain('PRD: Camera Onboarding')
    expect(ctx).toContain('Runbook: Payment Outage')
  })

  it('scopes the context by project and team', () => {
    const team = new TeamStore()
    team.register({ name: 'app', team: 'mobile', store: appStore })
    team.register({ name: 'payments', team: 'backend', store: paymentsStore })

    const ctx = team.context({ project: 'app' })
    expect(ctx).toContain('## app')
    expect(ctx).not.toContain('payments')

    const backendOnly = team.context({ team: 'backend' })
    expect(backendOnly).toContain('payments')
    expect(backendOnly).not.toContain('PRD: Camera Onboarding')
  })

  it('scopes the context by role using the role-to-type map', () => {
    const team = new TeamStore()
    team.register({ name: 'app', store: appStore })

    const engineer = team.context({ role: 'engineer' })
    expect(engineer).toContain('Story: Capture ID')
    expect(engineer).not.toContain('PRD: Camera Onboarding')

    const pm = team.context({ role: 'pm' })
    expect(pm).toContain('PRD: Camera Onboarding')
    expect(pm).not.toContain('Story: Capture ID')
  })

  it('reports no projects until one is registered', () => {
    const team = new TeamStore()
    expect(team.projects()).toEqual([])
    expect(team.context()).toContain('# Team knowledge context')
    expect(team.search({ query: 'anything' })).toEqual([])
  })

  it('merges semantic scores when an embedding provider is attached', () => {
    const team = new TeamStore({ embeddingProvider: new HashEmbeddingProvider(), semanticWeight: 0.5 })
    team.register({ name: 'app', team: 'mobile', store: appStore })

    const results = team.search({ query: 'onboarding' })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].semanticScore).not.toBeNull()
    expect(results[0].semanticScore as number).toBeGreaterThan(0)
    expect(results[0].score).toBeGreaterThan(0)
    expect(results[0]).toMatchObject({ project: 'app', team: 'mobile' })
  })

  it('stays purely lexical without an embedding provider', () => {
    const team = new TeamStore()
    team.register({ name: 'app', store: appStore })

    const results = team.search({ query: 'retention' })
    expect(results).toHaveLength(1)
    expect(results[0].semanticScore).toBeNull()
    expect(results[0].lexicalScore).toBeGreaterThan(0)
  })

  it('searchRemote uses the real embedding provider and falls back without one', async () => {
    const remote: RemoteEmbeddingProvider = {
      name: 'fake-remote',
      embed: jest.fn(async (text: string) => {
        // Discriminating fake: docs containing 'retention' get a matching
        // vector; everything else gets an orthogonal one so only the matching
        // doc survives the semantic filter.
        const match = text.toLowerCase().includes('retention')
        return new Array<number>(8).fill(match ? 1 : 0)
      }),
    }
    const team = new TeamStore({
      embeddingProvider: new HashEmbeddingProvider(),
      remoteEmbeddingProvider: remote,
      semanticWeight: 0.5,
    })
    team.register({ name: 'app', team: 'mobile', store: appStore })

    const results = await team.searchRemote({ query: 'retention', team: 'mobile' })
    expect(results).toHaveLength(1)
    expect(results[0].semanticScore).not.toBeNull()
    expect(results[0].semanticScore as number).toBeGreaterThan(0)
    expect((remote.embed as jest.Mock).mock.calls.length).toBeGreaterThan(0)

    // Without a remote provider, searchRemote mirrors sync search.
    const plain = new TeamStore()
    plain.register({ name: 'app', store: appStore })
    const fallback = await plain.searchRemote({ query: 'retention' })
    expect(fallback).toHaveLength(1)
    expect(fallback[0].semanticScore).toBeNull()
  })
})
