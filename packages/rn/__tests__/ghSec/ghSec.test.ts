/**
 * vectalon gh-sec — GitHub Security Posture Agent (Roadmap 093) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { analyzeSec, runGhSec, loadSecExport } from '../../src/ghSec'
import type { GhSecInput } from '../../src/ghSec'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('ghSec: analyzeSec', () => {
  it('approves a hardened repo with protection + no alerts', () => {
    const input: GhSecInput = {
      dependabot: [{ severity: 'low', state: 'open' }],
      secretScanning: [],
      branchProtection: { enabled: true, requiredPullRequestReviews: { requiredApprovingReviewCount: 1 } },
    }
    const report = analyzeSec(input)
    expect(report.verdict).toBe('approved')
    expect(report.findings.some(f => f.id === 'protection-ok')).toBe(true)
    expect(report.dependabot.open).toBe(1)
  })

  it('blocks on critical/high dependabot alerts', () => {
    const report = analyzeSec({
      dependabot: [
        { severity: 'critical', state: 'open' },
        { severity: 'high', state: 'open' },
        { severity: 'medium', state: 'open' },
      ],
      secretScanning: [],
      branchProtection: { enabled: true, requiredPullRequestReviews: { requiredApprovingReviewCount: 1 } },
    })
    expect(report.verdict).toBe('changes-requested')
    expect(report.dependabot.critical).toBe(2)
    expect(report.findings.some(f => f.id === 'dependabot-critical')).toBe(true)
  })

  it('blocks on exposed secrets', () => {
    const report = analyzeSec({ secretScanning: [{ state: 'open' }] })
    expect(report.verdict).toBe('changes-requested')
    expect(report.secretScanning.open).toBe(1)
    expect(report.findings.some(f => f.id === 'secrets-exposed')).toBe(true)
  })

  it('warns when protection is disabled or reviews are not required', () => {
    const disabled = analyzeSec({})
    expect(disabled.findings.some(f => f.id === 'protection-disabled')).toBe(true)

    const noReviews = analyzeSec({ branchProtection: { enabled: true } })
    expect(noReviews.findings.some(f => f.id === 'review-not-required')).toBe(true)
  })

  it('ignores dismissed alerts and resolved secrets', () => {
    const report = analyzeSec({
      dependabot: [{ severity: 'critical', state: 'dismissed' }],
      secretScanning: [{ state: 'resolved' }],
      branchProtection: { enabled: true, requiredPullRequestReviews: { requiredApprovingReviewCount: 2 } },
    })
    expect(report.verdict).toBe('approved')
    expect(report.dependabot.open).toBe(0)
    expect(report.secretScanning.open).toBe(0)
  })
})

describe('ghSec: runGhSec data sources', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('degrades to an explicit no-data verdict when no data is available', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runGhSec(dir)
    expect(report.source).toBe('none')
    expect(report.verdict).toBe('changes-requested')
    expect(report.findings.some(f => f.id === 'no-data')).toBe(true)
  })

  it('reads the posture from a --file export', () => {
    dir = createTempProject({
      'sec.json': JSON.stringify({
        dependabot: [{ severity: 'high', state: 'open' }],
        secretScanning: [],
        branchProtection: { enabled: true, requiredPullRequestReviews: { requiredApprovingReviewCount: 1 } },
      }),
    })
    const report = runGhSec(dir, { file: `${dir}/sec.json` })
    expect(report.source).toBe('export-file')
    expect(report.dependabot.critical).toBe(1)
    expect(report.verdict).toBe('changes-requested')
  })

  it('reports an unreadable export file', () => {
    dir = createTempProject({})
    const report = runGhSec(dir, { file: `${dir}/missing.json` })
    expect(report.source).toBe('none')
    expect(report.findings.some(f => f.id === 'file-unreadable')).toBe(true)
  })

  it('loadSecExport returns null for a missing or malformed file', () => {
    dir = createTempProject({ 'bad.json': '{' })
    expect(loadSecExport(`${dir}/missing.json`)).toBeNull()
    expect(loadSecExport(`${dir}/bad.json`)).toBeNull()
  })
})
