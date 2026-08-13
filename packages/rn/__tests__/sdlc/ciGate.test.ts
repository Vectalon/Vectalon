import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { fileCiGateIncident, rollbackFor } from '../../src/sdlc'
import type { ParsedCrash } from '../../src/knowledge/telemetry'

function crash(id: string): ParsedCrash {
  return {
    kind: 'crash',
    id,
    source: 'sentry',
    exceptionType: 'NSInvalidArgumentException',
    message: 'unrecognized selector sent to instance',
    timestamp: Date.now(),
    frames: [],
  }
}

describe('fileCiGateIncident', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vectalon-cigate-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('triages the failure and suggests a revert on the default branch', () => {
    const result = fileCiGateIncident({
      gate: 'quality',
      step: 'Lint',
      command: 'yarn lint',
      exitCode: 1,
      output: 'error: unused variable x',
      branch: 'main',
      commit: 'abc1234',
    })
    expect(result.incident.severity).toBe('sev2')
    expect(result.incident.actions.length).toBeGreaterThan(0)
    expect(result.rollback.command).toBe('git revert abc1234')
    expect(result.report).toContain('CI gate incident — quality')
    expect(result.report).toContain('Lint')
    expect(result.report).toContain('Rollback')
    expect(result.artifactId).toBeNull()
  })

  it('suggests fixing the PR branch instead of reverting', () => {
    const result = fileCiGateIncident({ gate: 'visual-regression', branch: 'feature/login', commit: 'def5678' })
    expect(result.rollback.command).toBeNull()
    expect(result.rollback.note).toContain('feature/login')
    expect(result.rollback.note).toContain('do not merge')
  })

  it('persists an operations artifact when a store is given', () => {
    const store = new ArtifactStore(root, { engine: 'json' })
    const result = fileCiGateIncident({ gate: 'bundle-budget', branch: 'main', commit: 'abc1234' }, store)
    expect(result.artifactId).toBeTruthy()
    const artifact = store.get(result.artifactId!)
    expect(artifact?.type).toBe('operations')
    expect(artifact?.meta.kind).toBe('ci-gate')
    expect(artifact?.meta.gate).toBe('bundle-budget')
    expect(artifact?.meta.branch).toBe('main')
    expect(artifact?.content).toContain('Rollback')
  })

  it('correlates crash telemetry into severity and impact', () => {
    const crashes = Array.from({ length: 6 }, (_, i) => crash(`c${i}`))
    const result = fileCiGateIncident({ gate: 'quality', branch: 'main', crashes })
    // 5+ crashes of an NSInvalidArgumentException-class exception escalate to sev1.
    expect(result.incident.severity).toBe('sev1')
    expect(result.incident.impact).toContain('6 crash report(s)')
    expect(result.incident.causeBucket).toBeTruthy()
  })

  it('honors an explicit severity override', () => {
    const result = fileCiGateIncident({ gate: 'quality', branch: 'main', severity: 'sev3' })
    expect(result.incident.severity).toBe('sev3')
  })

  it('truncates long output in the persisted report', () => {
    const result = fileCiGateIncident({ gate: 'quality', branch: 'main', output: 'x'.repeat(5000) })
    expect(result.report).toContain('(truncated)')
    expect(result.report.length).toBeLessThan(5000 + 2000)
  })

  it('never throws on a missing store or odd inputs', () => {
    expect(() => fileCiGateIncident({ gate: 'quality' })).not.toThrow()
    expect(() => fileCiGateIncident({ gate: 'quality', commit: 'a'.repeat(50) })).not.toThrow()
  })
})

describe('rollbackFor', () => {
  it('reverts on default branches (main/master and their prefixes)', () => {
    expect(rollbackFor({ branch: 'main', commit: 'abc' }).command).toBe('git revert abc')
    expect(rollbackFor({ branch: 'master', commit: 'abc' }).command).toBe('git revert abc')
    expect(rollbackFor({ branch: 'release/main', commit: 'abc' }).command).toBe('git revert abc')
  })

  it('never reverts on a PR branch', () => {
    expect(rollbackFor({ branch: 'feature/x', commit: 'abc' }).command).toBeNull()
    expect(rollbackFor({ branch: 'feature/x' }).note).toContain('do not merge')
  })
})
