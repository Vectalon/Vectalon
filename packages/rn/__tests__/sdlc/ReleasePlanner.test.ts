import { planRelease, renderReleasePlan, parseGitLog, detectBumpType, bumpVersion } from '../../src/sdlc/ReleasePlanner'

describe('parseGitLog', () => {
  it('parses hashed lines and un-hashed PR-style lines', () => {
    const commits = parseGitLog('a1b2c3d feat: add login\n* fix typo in settings\n\nabcdef1234567 chore: bump deps\n')
    expect(commits).toHaveLength(3)
    expect(commits[0]).toEqual({ hash: 'a1b2c3d', message: 'feat: add login', lower: 'feat: add login' })
    expect(commits[1].hash).toBe('')
    expect(commits[2].hash).toBe('abcdef1234567')
  })

  it('returns an empty array for empty input', () => {
    expect(parseGitLog('')).toEqual([])
  })
})

describe('detectBumpType', () => {
  it('detects major from breaking changes', () => {
    expect(detectBumpType(parseGitLog('a1b2c3d feat!: BREAKING CHANGE: new auth'))).toBe('major')
  })

  it('detects minor from features', () => {
    expect(detectBumpType(parseGitLog('a1b2c3d feat: add login screen'))).toBe('minor')
  })

  it('detects patch from fixes', () => {
    expect(detectBumpType(parseGitLog('a1b2c3d fix: crash on startup'))).toBe('patch')
  })

  it('returns none for empty history', () => {
    expect(detectBumpType([])).toBe('none')
  })
})

describe('bumpVersion', () => {
  it('increments each level', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
    expect(bumpVersion('1.2.3', 'none')).toBe('1.2.3')
  })

  it('handles a pre-release / unparseable version', () => {
    expect(bumpVersion('2.0.0-beta.1', 'patch')).toBe('2.0.1')
  })
})

describe('planRelease', () => {
  it('plans a minor bump with a categorized changelog', () => {
    const plan = planRelease(
      '1.2.3',
      'a1b2c3d feat: add biometric login\nf1e2d3c fix: handle empty list\n',
      '2026-08-06'
    )
    expect(plan.nextVersion).toBe('1.3.0')
    expect(plan.bump).toBe('minor')
    expect(plan.changelog).toContain('# Release Notes — v1.3.0')
    expect(plan.changelog).toContain('Release date: 2026-08-06')
    expect(plan.changelog).toContain('## Added')
    expect(plan.changelog).toContain('- feat: add biometric login')
    expect(plan.changelog).toContain('## Fixed')
    expect(plan.changelog).toContain('- fix: handle empty list')
  })

  it('renderReleasePlan includes the next stages', () => {
    const plan = planRelease('0.9.0', 'a1b2c3d feat: onboarding\n')
    const report = renderReleasePlan(plan)
    expect(report).toContain('## 🚀 Release plan')
    expect(report).toContain('0.9.0 → **0.10.0**')
    expect(report).toContain('Monitor 24h')
  })
})
