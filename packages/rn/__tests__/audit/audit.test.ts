/**
 * vectalon audit — Org-wide Audit Trail Agent (Roadmap 084) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { parseAuditLine, runAuditScan, looksLikeSecret, writeAuditReport } from '../../src/audit'
import { createTempProject, cleanup } from '../helpers/tmp'

const secretKey = ['sk', 'live', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'].join('_')

describe('audit: parseAuditLine', () => {
  it('parses a valid entry and fills the line number', () => {
    const entry = parseAuditLine(JSON.stringify({ seq: 1, actor: 'ci', action: 'build', outcome: 'pass' }), 4)
    expect(entry?.seq).toBe(1)
    expect(entry?.actor).toBe('ci')
    expect(entry?.action).toBe('build')
    expect(entry?.line).toBe(4)
  })

  it('returns null for malformed lines', () => {
    expect(parseAuditLine('not json', 1)).toBeNull()
    expect(parseAuditLine(JSON.stringify({}), 1)).toBeNull()
  })
})

describe('audit: looksLikeSecret', () => {
  it('detects key-shaped and private-key strings', () => {
    expect(looksLikeSecret(secretKey)).toBe(true)
    expect(looksLikeSecret('AKIA1234567890ABCDEF')).toBe(true)
    expect(looksLikeSecret('-----BEGIN RSA PRIVATE KEY-----')).toBe(true)
    expect(looksLikeSecret('a normal message')).toBe(false)
  })
})

describe('audit: runAuditScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('validates a clean trail and summarizes actors', () => {
    const lines = [
      { seq: 1, actor: 'ci', action: 'build', outcome: 'pass', timestamp: 1786450000000 },
      { seq: 2, actor: 'dev', action: 'commit', outcome: 'pass', timestamp: 1786450001000 },
      { seq: 3, actor: 'ci', action: 'release', outcome: 'pass', timestamp: 1786450002000 },
    ]
    dir = createTempProject({ 'package.json': '{}', '.vectalon/audit/trail.jsonl': lines.map(l => JSON.stringify(l)).join('\n') + '\n' })
    const report = runAuditScan(dir)
    expect(report.summary.entries).toBe(3)
    expect(report.summary.files).toBe(1)
    expect(report.findings.filter(f => f.severity === 'warning')).toHaveLength(0)
    expect(report.summary.actors.some(a => a.actor === 'ci' && a.count === 2)).toBe(true)
  })

  it('flags sequence gaps, malformed lines, and secrets', () => {
    const secretLine = JSON.stringify({ seq: 2, actor: 'hacker', action: 'export', details: { token: secretKey } })
    dir = createTempProject({
      'package.json': '{}',
      '.vectalon/audit/trail.jsonl': [
        JSON.stringify({ seq: 1, actor: 'ci', action: 'build' }),
        'this is not json',
        secretLine,
        JSON.stringify({ seq: 7, actor: 'ci', action: 'build' }),
      ].join('\n') + '\n',
    })
    const report = runAuditScan(dir)
    expect(report.findings.some(f => f.id === 'malformed-entry')).toBe(true)
    expect(report.findings.some(f => f.id === 'trail-gap')).toBe(true)
    expect(report.findings.some(f => f.id === 'secret-in-trail')).toBe(true)
    expect(report.verdict).toBe('needs-attention')
  })

  it('reports when no audit directory exists', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runAuditScan(dir)
    expect(report.findings.some(f => f.id === 'no-trail')).toBe(true)
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runAuditScan(dir)
    const { mdPath, jsonPath } = writeAuditReport(dir, report)
    expect(mdPath).toContain('audit')
    expect(jsonPath).toContain('report.json')
  })
})
