/**
 * vc outcomes — outcomes ledger tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import os from 'os'
import {
  collectOutcomes,
  hoursSaved,
  savingsEstimate,
  blendedRate,
  EMPTY_COUNTS,
} from '../../src/outcomes/ledger'
import { renderOutcomeLines } from '../../src/cli/commands/outcomes'

function scratch(): string {
  return join(os.tmpdir(), `vectalon-outcomes-${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
}

function writeReport(root: string, agent: string, report: unknown): void {
  const dir = join(root, 'docs', 'vectalon', agent)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report))
}

describe('collectOutcomes', () => {
  let root: string
  beforeEach(() => {
    root = scratch()
    mkdirSync(root, { recursive: true })
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('returns an empty ledger when no reports exist', () => {
    expect(collectOutcomes(root)).toEqual(EMPTY_COUNTS)
  })

  it('counts build failures diagnosed and fixed from build-fix reports', () => {
    writeReport(root, 'build-fix', {
      verdict: 'changes-requested',
      findings: [
        { severity: 'error', title: 'Module resolution failure' },
        { severity: 'warning', title: 'Asset resolution failure' },
        { severity: 'info', title: 'cosmetic' },
      ],
    })
    const counts = collectOutcomes(root)
    expect(counts.buildFailuresDiagnosed).toBe(2) // error + warning only
    expect(counts.buildFailuresFixed).toBe(0)
  })

  it('counts a build failure as fixed when the verdict passes', () => {
    writeReport(root, 'build-fix', { verdict: 'approved', findings: [{ severity: 'error' }] })
    const counts = collectOutcomes(root)
    expect(counts.buildFailuresDiagnosed).toBe(1)
    expect(counts.buildFailuresFixed).toBe(1)
  })

  it('counts fix/bug-fix reports with applied:true as build failures fixed', () => {
    writeReport(root, 'bug-fix', { verdict: 'changes-requested', applied: true, findings: [{ severity: 'error' }] })
    writeReport(root, 'fix', { verdict: 'approved', applied: true, findings: [{ severity: 'warning' }] })
    const counts = collectOutcomes(root)
    expect(counts.buildFailuresFixed).toBe(2)
  })

  it('counts PR review issues caught from review reports', () => {
    writeReport(root, 'review', {
      verdict: 'changes-requested',
      findings: [{ severity: 'error' }, { severity: 'warning' }, { severity: 'info' }],
    })
    expect(collectOutcomes(root).prIssuesCaught).toBe(2)
  })

  it('counts perf regressions from the score performance dimension', () => {
    writeReport(root, 'score', {
      verdict: 'good',
      overall: 73,
      newProblems: ['perf:render'],
      dimensions: [
        { id: 'performance', findings: [{ severity: 'error' }, { severity: 'warning' }] },
        { id: 'architecture', findings: [{ severity: 'warning' }] },
      ],
    })
    const counts = collectOutcomes(root)
    expect(counts.perfRegressionsDetected).toBe(2)
    expect(counts.issuesPrevented).toBe(1) // one new problem
  })

  it('counts issues detected across sec/arch/a11y scans', () => {
    writeReport(root, 'sec', { verdict: 'needs-attention', findings: [{ severity: 'error' }, { severity: 'warning' }, { severity: 'info' }] })
    writeReport(root, 'arch', { verdict: 'needs-attention', findings: [{ severity: 'warning' }] })
    writeReport(root, 'a11y', { verdict: 'approved', findings: [] })
    const counts = collectOutcomes(root)
    expect(counts.issuesDetected).toBe(3) // 2 (sec error+warning) + 1 (arch warning)
    expect(counts.issuesPrevented).toBe(1) // a11y approved → one scan that found nothing
  })

  it('counts RN upgrades completed from .vectalon/upgrades provenance dirs', () => {
    const u1 = join(root, '.vectalon', 'upgrades', '2026-08-01T00:00:00')
    const u2 = join(root, '.vectalon', 'upgrades', '2026-08-02T00:00:00')
    mkdirSync(u1, { recursive: true })
    mkdirSync(u2, { recursive: true })
    writeFileSync(join(u1, 'UPGRADE.md'), '# upgrade')
    writeFileSync(join(u2, 'UPGRADE.md'), '# upgrade')
    // a dir without UPGRADE.md is not counted
    mkdirSync(join(root, '.vectalon', 'upgrades', 'stale'), { recursive: true })
    expect(collectOutcomes(root).rnUpgradesCompleted).toBe(2)
  })

  it('counts tests generated from feature-development run docs', () => {
    const run = join(root, 'docs', 'vectalon', 'feature-development', 'create-login-abc123')
    mkdirSync(join(run, 'tests'), { recursive: true })
    writeFileSync(join(run, 'tests', 'LoginScreen.test.tsx'), 'test')
    writeFileSync(join(run, 'tests', 'useAuth.spec.ts'), 'test')
    writeFileSync(join(run, 'tests', 'helper.ts'), 'not a test')
    expect(collectOutcomes(root).testsGenerated).toBe(2)
  })

  it('ignores malformed report.json files without crashing', () => {
    writeReport(root, 'sec', { not: 'json' } as unknown as object)
    const brokenDir = join(root, 'docs', 'vectalon', 'broken')
    mkdirSync(brokenDir, { recursive: true })
    writeFileSync(join(brokenDir, 'report.json'), '{nope')
    expect(collectOutcomes(root)).toEqual(EMPTY_COUNTS)
  })
})

describe('hours + savings model', () => {
  it('sums per-outcome hours and multiplies by the rate', () => {
    const counts: typeof EMPTY_COUNTS = {
      buildFailuresDiagnosed: 10,
      buildFailuresFixed: 4,
      prIssuesCaught: 20,
      rnUpgradesCompleted: 1,
      testsGenerated: 12,
      perfRegressionsDetected: 3,
      issuesDetected: 100,
      issuesPrevented: 30,
    }
    const hours = hoursSaved(counts)
    // 10*0.5 + 4*1 + 20*0.25 + 1*8 + 12*0.5 + 3*1 + 100*0.25 + 30*0.5 = 5+4+5+8+6+3+25+15 = 71
    expect(hours).toBeCloseTo(71, 5)
    expect(savingsEstimate(counts, 100)).toBe(7100)
    expect(savingsEstimate(counts, 75)).toBe(5325)
  })

  it('uses the default blended rate unless VECTALON_BLENDED_RATE is set', () => {
    expect(blendedRate()).toBe(75)
    process.env.VECTALON_BLENDED_RATE = '120'
    expect(blendedRate()).toBe(120)
    process.env.VECTALON_BLENDED_RATE = 'garbage'
    expect(blendedRate()).toBe(75)
    delete process.env.VECTALON_BLENDED_RATE
  })
})

describe('renderOutcomeLines', () => {
  it('renders the Acme-style ledger with the savings line', () => {
    const counts: typeof EMPTY_COUNTS = {
      buildFailuresDiagnosed: 14,
      buildFailuresFixed: 10,
      prIssuesCaught: 23,
      rnUpgradesCompleted: 1,
      testsGenerated: 40,
      perfRegressionsDetected: 6,
      issuesDetected: 127,
      issuesPrevented: 31,
    }
    // eslint-disable-next-line no-control-regex
    const ansi = /\u001b\[[0-9;]*m/g
    const lines = renderOutcomeLines(counts, 100, 7400, 74).map(l => l.replace(ansi, '').trim())
    const joined = lines.join('\n')
    expect(joined).toContain('127 issues detected')
    expect(joined).toContain('23 issues caught in PR review')
    expect(joined).toContain('14 build failures diagnosed')
    expect(joined).toContain('10 build failures resolved')
    expect(joined).toContain('1 RN upgrades completed')
    expect(joined).toContain('40 tests generated')
    expect(joined).toContain('6 performance regressions detected')
    expect(joined).toContain('31 regressions prevented')
    expect(joined).toContain('$7,400')
    expect(joined).toContain('100.0 developer-hours at $74/hr')
  })
})
