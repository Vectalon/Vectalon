import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  runSecurityReview,
  writeSecurityReport,
  renderSecurityMarkdown,
  verdictOf,
  auditSeverity,
  securityDocsDir,
} from '../../src/security'
import { scanSecrets, redact, walkSecretFiles } from '../../src/security/scan'
import { scanUnsafe } from '../../src/security/unsafe'
import { parseNpmAudit } from '../../src/security/audit'
import { createTempProject, cleanup } from '../helpers/tmp'
import type { SecurityAudit, SecurityFinding } from '../../src/security/types'

/**
 * Build a fake Stripe key at runtime so no real key-shaped literal ever
 * appears in the test source (keeps GitHub push protection quiet while still
 * exercising the scanner's stripe-secret regex end to end).
 */
const fakeStripeKey = (): string => ['sk', 'test', 'abcdefghijklmnopqrstuvwx'].join('_')

describe('sec: verdicts', () => {
  it('changes-requested on errors, needs-attention on warnings, approved otherwise', () => {
    const finding = (severity: SecurityFinding['severity']): SecurityFinding =>
      ({ id: 'x', category: 'secrets', severity, file: 'a.ts', line: 1, target: 't', message: '', suggestion: '' })
    expect(verdictOf([finding('error')])).toBe('changes-requested')
    expect(verdictOf([finding('warning')])).toBe('needs-attention')
    expect(verdictOf([finding('info')])).toBe('approved')
    expect(verdictOf([])).toBe('approved')
  })

  it('maps npm audit severities onto the review scale', () => {
    expect(auditSeverity('critical')).toBe('error')
    expect(auditSeverity('high')).toBe('warning')
    expect(auditSeverity('moderate')).toBe('info')
    expect(auditSeverity('low')).toBe('info')
  })
})

describe('sec: secrets scanner', () => {
  it('flags provider tokens as errors and redacts the value', () => {
    const findings = scanSecrets('src/keys.ts', "const aws = 'AKIAIOSFODNN7EXAMPLE'\n")
    const aws = findings.find(f => f.id === 'aws-access-key')
    expect(aws).toBeDefined()
    expect(aws!.severity).toBe('error')
    expect(aws!.line).toBe(1)
    // Redacted: never the full token in a report.
    expect(aws!.target).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(aws!.target).toBe(redact('AKIAIOSFODNN7EXAMPLE'))
  })

  it('flags generic secrets and passwords as warnings', () => {
    const findings = scanSecrets(
      'src/api.ts',
      "const apiKey = 'abcdefghijklmnopqrst'\nconst password = 's3cretPa55word'\n",
    )
    expect(findings.some(f => f.id === 'hardcoded-api-key' && f.line === 1)).toBe(true)
    expect(findings.some(f => f.id === 'hardcoded-password' && f.line === 2)).toBe(true)
    expect(findings.every(f => f.severity === 'warning')).toBe(true)
  })

  it('ignores placeholder values and short strings', () => {
    const findings = scanSecrets(
      'src/api.ts',
      "const apiKey = 'changeme'\nconst password = 'your_password_here'\nconst token = 'abc'\n",
    )
    expect(findings.filter(f => f.category === 'secrets')).toHaveLength(0)
  })

  it('scans .env dotfiles', () => {
    const dir = createTempProject({
      '.env': 'STRIPE_SECRET=' + fakeStripeKey() + '\n',
      'src/index.ts': 'export const ok = true\n',
      '.gitignore': 'node_modules/\n',
    })
    try {
      expect(walkSecretFiles(dir)).toContain('.env')
      expect(walkSecretFiles(dir)).not.toContain('.gitignore')
      const content = readFileSync(join(dir, '.env'), 'utf-8')
      const findings = scanSecrets('.env', content)
      expect(findings.some(f => f.id === 'stripe-secret' && f.severity === 'error')).toBe(true)
    } finally {
      cleanup(dir)
    }
  })
})

describe('sec: unsafe pattern scanner', () => {
  it('flags eval, shell interpolation, and disabled TLS', () => {
    const findings = scanUnsafe('src/app.ts', [
      "eval(userInput)",
      "exec('ls ' + dir)",
      "https.request(url, { rejectUnauthorized: false })",
      "const url = 'http://example.com/api'",
    ].join('\n'))
    expect(findings.some(f => f.id === 'dynamic-code-execution' && f.line === 1)).toBe(true)
    expect(findings.some(f => f.id === 'shell-command-injection' && f.line === 2)).toBe(true)
    expect(findings.some(f => f.id === 'tls-verification-disabled' && f.line === 3)).toBe(true)
    expect(findings.some(f => f.id === 'cleartext-http' && f.line === 4)).toBe(true)
  })

  it('flags Math.random only when security material is on the line', () => {
    const bad = scanUnsafe('src/a.ts', "const otp = String(Math.random())\n")
    expect(bad.some(f => f.id === 'insecure-random')).toBe(true)
    const fine = scanUnsafe('src/b.ts', "const index = Math.random() * list.length\n")
    expect(fine.some(f => f.id === 'insecure-random')).toBe(false)
  })

  it('flags SQL concatenation and weak hashes', () => {
    const findings = scanUnsafe('src/db.ts', "db.query('SELECT * FROM users WHERE id = ' + id)\nconst h = md5(password)\n")
    expect(findings.some(f => f.id === 'sql-injection' && f.line === 1)).toBe(true)
    expect(findings.some(f => f.id === 'weak-hash' && f.line === 2)).toBe(true)
  })
})

describe('sec: npm audit parsing', () => {
  it('parses a vulnerable audit report', () => {
    const audit = parseNpmAudit(JSON.stringify({
      metadata: { vulnerabilities: { info: 0, low: 1, moderate: 0, high: 1, critical: 1, total: 3 } },
      vulnerabilities: {
        lodash: { name: 'lodash', severity: 'high', isDirect: true, via: [{ title: 'Prototype Pollution' }] },
        'transitive-dep': { name: 'transitive-dep', severity: 'critical', isDirect: false, via: [{ title: 'RCE' }, { title: 'XSS' }] },
      },
    }))
    expect(audit).not.toBeNull()
    expect(audit!.total).toBe(3)
    expect(audit!.critical).toBe(1)
    expect(audit!.vulnerabilities).toHaveLength(2)
    const lodash = audit!.vulnerabilities.find(v => v.package === 'lodash')
    expect(lodash!.severity).toBe('high')
    expect(lodash!.isDirect).toBe(true)
    expect(lodash!.advisoryCount).toBe(1)
    const transitive = audit!.vulnerabilities.find(v => v.package === 'transitive-dep')
    expect(transitive!.isDirect).toBe(false)
    expect(transitive!.advisoryCount).toBe(2)
  })

  it('returns null for empty or unparseable output', () => {
    expect(parseNpmAudit('')).toBeNull()
    expect(parseNpmAudit('some npm error text')).toBeNull()
  })
})

describe('sec: runSecurityReview', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('flags a committed secret and returns changes-requested', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
      'src/config.ts': "export const apiKey = '" + fakeStripeKey() + "'\n",
    })
    const report = await runSecurityReview(dir, { skipAudit: true })
    expect(report.verdict).toBe('changes-requested')
    expect(report.summary.bySeverity.error).toBeGreaterThan(0)
    expect(report.summary.byCategory.secrets).toBeGreaterThan(0)
  })

  it('flags unsafe patterns with a needs-attention verdict', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
      'src/app.ts': "eval(input)\n",
    })
    const report = await runSecurityReview(dir, { skipAudit: true })
    expect(report.summary.byCategory.unsafe).toBeGreaterThan(0)
    expect(report.verdict).toBe('needs-attention')
  })

  it('reports critical audit vulnerabilities as errors via the injected runner', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { lodash: '^4.17.0' } }),
      'package-lock.json': '{}',
      'src/index.ts': 'export const ok = true\n',
    })
    const fakeAudit: SecurityAudit = {
      ran: true, total: 1, critical: 1, high: 0, moderate: 0, low: 0,
      vulnerabilities: [{ package: 'lodash', severity: 'critical', isDirect: true, advisoryCount: 2 }],
    }
    const report = await runSecurityReview(dir, { auditRunner: async () => fakeAudit })
    expect(report.summary.byCategory.deps).toBeGreaterThan(0)
    expect(report.verdict).toBe('changes-requested')
    expect(report.findings.some(f => f.id === 'dependency-vulnerability' && f.target === 'lodash')).toBe(true)
  })

  it('skipped audits and --no-audit contribute no deps findings', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { lodash: '^4.17.0' } }),
      'package-lock.json': '{}',
      'src/index.ts': 'export const ok = true\n',
    })
    const skipped: SecurityAudit = { ran: false, skippedReason: 'no network', total: 0, critical: 0, high: 0, moderate: 0, low: 0, vulnerabilities: [] }
    const report = await runSecurityReview(dir, { auditRunner: async () => skipped })
    expect(report.audit.ran).toBe(false)
    expect(report.findings.some(f => f.category === 'deps' && f.id === 'dependency-vulnerability')).toBe(false)
    expect(report.verdict).toBe('approved')
  })

  it('approves a clean project with a clean audit', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
      'package-lock.json': '{}',
      'src/index.ts': 'export const ok = true\n',
    })
    const clean: SecurityAudit = { ran: true, total: 0, critical: 0, high: 0, moderate: 0, low: 0, vulnerabilities: [] }
    const report = await runSecurityReview(dir, { auditRunner: async () => clean })
    expect(report.verdict).toBe('approved')
    // A clean audit still produces its info-level confirmation.
    expect(report.findings.some(f => f.id === 'clean-audit')).toBe(true)
  })

  it('warns about unpinned dependencies when no lockfile exists', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { lodash: '^4.17.0' } }),
      'src/index.ts': 'export const ok = true\n',
    })
    const report = await runSecurityReview(dir, { skipAudit: true })
    expect(report.findings.some(f => f.id === 'unlocked-dependencies')).toBe(true)
  })
})

describe('sec: report writing', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('writes report.json and report.md to docs/vectalon/sec/', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
      'package-lock.json': '{}',
      'src/index.ts': 'export const ok = true\n',
    })
    const report = await runSecurityReview(dir, { skipAudit: true })
    const { jsonPath, mdPath } = writeSecurityReport(dir, report)
    expect(jsonPath).toBe(join(securityDocsDir(dir), 'report.json'))
    expect(mdPath).toBe(join(securityDocsDir(dir), 'report.md'))
    expect(existsSync(jsonPath)).toBe(true)
    expect(existsSync(mdPath)).toBe(true)
    const md = readFileSync(mdPath, 'utf-8')
    expect(md).toContain('# vectalon sec — Security Review')
    expect(md).toContain('## Dependency audit')
  })

  it('renders redacted secrets and audit tables in markdown', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
      'package-lock.json': '{}',
      'src/config.ts': "export const apiKey = '" + fakeStripeKey() + "'\n",
    })
    const fakeAudit: SecurityAudit = {
      ran: true, total: 2, critical: 1, high: 1, moderate: 0, low: 0,
      vulnerabilities: [
        { package: 'lodash', severity: 'high', isDirect: true, advisoryCount: 1 },
        { package: 'tar', severity: 'critical', isDirect: false, advisoryCount: 1 },
      ],
    }
    const report = await runSecurityReview(dir, { auditRunner: async () => fakeAudit })
    const md = renderSecurityMarkdown(report)
    expect(md).toContain('| lodash | high | yes | 1 |')
    expect(md).toContain('| tar | critical | no | 1 |')
    // The full secret must never appear in the report.
    expect(md).not.toContain(fakeStripeKey())
    expect(md).toContain('### [ERROR] stripe-secret')
  })
})
