import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PIPELINE, HEAL_LOOP, findPriorRun, renderPipeline, renderHealLoop } from '../../src/cli/commands/demo'

describe('vc demo — the flagship workflow', () => {
  it('has the full 14-stage pipeline in the hero order', () => {
    expect(PIPELINE.map(p => p.id)).toEqual([
      'prd', 'scope', 'impact', 'design', 'architecture', 'tasks', 'tests',
      'implementation', 'code-review', 'verification', 'readiness', 'pr', 'documentation', 'close',
    ])
    // The directive's hero story is present.
    const labels = PIPELINE.map(p => p.label)
    expect(labels).toContain('Requirement')
    expect(labels).toContain('Architecture decision')
    expect(labels).toContain('Affected files')
    expect(labels).toContain('Implementation plan')
    expect(labels).toContain('Code')
    expect(labels).toContain('Tests')
    expect(labels).toContain('Review')
    expect(labels).toContain('Build verification')
    expect(labels).toContain('PR')
  })

  it('has the self-healing loop: build failed → diagnose → modify → rebuild → verify', () => {
    expect(HEAL_LOOP.map(h => h.label)).toEqual(['Build failed', 'diagnose', 'modify', 'rebuild', 'verify'])
  })

  it('renders the pipeline with the feature prompt and all stages', () => {
    const lines = renderPipeline(null).join('\n')
    expect(lines).toContain('vectalon feature "Build a Login feature."')
    expect(lines).toContain('Requirement')
    expect(lines).toContain('PR')
    // No run → all stages are un-marked dots.
    expect(lines).toContain('·')
    expect(lines).not.toContain('✓')
  })

  it('renders the heal loop as a cycle with details', () => {
    const lines = renderHealLoop().join('\n')
    expect(lines).toContain('Self-healing loop')
    // Every stage label + its detail appear (labels are ANSI-wrapped, so
    // assert the plain detail text which is not styled).
    for (const h of HEAL_LOOP) {
      expect(lines).toContain(h.detail)
    }
    // The cycle arrow form is present once per transition.
    expect((lines.match(/→/g) ?? []).length).toBe(HEAL_LOOP.length - 1)
  })

  it('finds and reads a real prior workflow run', () => {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-demo-'))
    const runDir = join(root, 'docs', 'vectalon', 'feature-development', 'login-abc123')
    mkdirSync(runDir, { recursive: true })
    writeFileSync(join(runDir, 'workflow-state.json'), JSON.stringify({
      id: 'login-abc123',
      prompt: 'create a login screen with email password',
      status: 'completed',
      createdAt: 1700000000000,
      phases: [
        { id: 'prd', name: 'PRD', status: 'completed', artifacts: [{ type: 'document' }] },
        { id: 'implementation', name: 'Implementation', status: 'completed', artifacts: [{ type: 'file', path: '/x/src/screens/LoginScreen.tsx' }] },
        { id: 'verification', name: 'Verification', status: 'completed', artifacts: [{ type: 'file', path: '/x/src/screens/LoginScreen.test.tsx' }] },
      ],
    }))
    const run = findPriorRun(root)
    expect(run).not.toBeNull()
    expect(run!.prompt).toBe('create a login screen with email password')
    expect(run!.status).toBe('completed')
    expect(run!.files).toEqual(['/x/src/screens/LoginScreen.tsx', '/x/src/screens/LoginScreen.test.tsx'])
    rmSync(root, { recursive: true, force: true })
  })

  it('marks completed stages in the pipeline render from a real run', () => {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-demo-'))
    const runDir = join(root, 'docs', 'vectalon', 'feature-development', 'login-abc123')
    mkdirSync(runDir, { recursive: true })
    writeFileSync(join(runDir, 'workflow-state.json'), JSON.stringify({
      id: 'login-abc123', prompt: 'login', status: 'completed', createdAt: 1700000000000,
      phases: [
        { id: 'prd', name: 'PRD', status: 'completed' },
        { id: 'verification', name: 'Verification', status: 'completed' },
      ],
    }))
    const run = findPriorRun(root)
    const text = renderPipeline(run).join('\n')
    // Completed stages get ✓ marks; un-run stages stay as dots.
    expect(text).toContain('✓')
    expect(text).toContain('Requirement')
    rmSync(root, { recursive: true, force: true })
  })

  it('returns null when no prior run exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-demo-'))
    expect(findPriorRun(root)).toBeNull()
    rmSync(root, { recursive: true, force: true })
  })
})
