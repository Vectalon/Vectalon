/**
 * vectalon governance — Enterprise Governance Agent (Roadmap 083) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { runGovScan, writeGovReport } from '../../src/governance'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('governance: runGovScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('passes when the governance evidence is present', () => {
    dir = createTempProject({
      'package.json': '{}',
      'package-lock.json': '{}',
      'LICENSE': 'MIT License\nCopyright (c) 2026\n',
      'SECURITY.md': '# Security\nReport vulnerabilities privately.\n',
      'CONTRIBUTING.md': '# Contributing\n',
      'CODEOWNERS': '* @core-team\n',
      '.github/pull_request_template.md': '# PR\n',
      '.github/dependabot.yml': 'version: 2\n',
    })
    const report = runGovScan(dir)
    expect(report.findings.filter(f => f.severity === 'warning')).toHaveLength(0)
    expect(report.verdict).toBe('approved')
    const license = report.checks.find(c => c.id === 'license')
    expect(license?.status).toBe('pass')
  })

  it('flags missing license and security policy as warnings', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runGovScan(dir)
    expect(report.findings.some(f => f.id === 'missing-license' && f.severity === 'warning')).toBe(true)
    expect(report.findings.some(f => f.id === 'missing-security-policy' && f.severity === 'warning')).toBe(true)
    expect(report.findings.some(f => f.id === 'missing-lockfile')).toBe(true)
    expect(report.verdict).toBe('needs-attention')
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runGovScan(dir)
    const { mdPath, jsonPath } = writeGovReport(dir, report)
    expect(mdPath).toContain('governance')
    expect(jsonPath).toContain('report.json')
  })
})
