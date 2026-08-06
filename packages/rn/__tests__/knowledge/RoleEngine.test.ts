import { RoleEngine } from '../../src/knowledge/RoleEngine'
import type { Artifact } from '../../src/knowledge/artifactTypes'

function artifact(overrides: Partial<Artifact> & { type: Artifact['type']; title: string }): Artifact {
  return {
    id: `art-${Math.random().toString(36).slice(2, 8)}`,
    content: '',
    source: 'import',
    status: 'draft',
    createdAt: 1000,
    updatedAt: 2000,
    version: 1,
    meta: {},
    links: [],
    checksum: 'abc',
    history: [],
    ...overrides,
  }
}

describe('RoleEngine', () => {
  it('returns a header for the requested role even with no artifacts', () => {
    const context = new RoleEngine().buildContext('ba', [])
    expect(context).toContain('# Knowledge context for ba')
  })

  it('includes only role-relevant artifact types', () => {
    const prd = artifact({ type: 'product', title: 'PRD' })
    const story = artifact({ type: 'requirements', title: 'Story' })
    const threat = artifact({ type: 'security', title: 'Threat Model' })

    const context = new RoleEngine().buildContext('ba', [prd, story, threat])
    expect(context).toContain('PRD')
    expect(context).toContain('Story')
    expect(context).not.toContain('Threat Model')
  })

  it('renders status and update date per artifact', () => {
    const prd = artifact({ type: 'product', title: 'PRD', status: 'active', updatedAt: new Date('2026-07-01').getTime() })
    const context = new RoleEngine().buildContext('pm', [prd])
    expect(context).toContain('[active] PRD')
    expect(context).toContain('2026-07-01')
  })

  it('groups artifacts under their artifact type heading', () => {
    const prd = artifact({ type: 'product', title: 'PRD' })
    const context = new RoleEngine().buildContext('pm', [prd])
    expect(context).toContain('## product (1)')
  })

  it('throws for an unknown role', () => {
    expect(() => new RoleEngine().buildContext('unknown' as never, [])).toThrow(/Unknown role/)
  })
})
