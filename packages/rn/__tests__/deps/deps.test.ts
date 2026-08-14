import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { runDepsScan, writeDepsReport, renderDepsMarkdown, verdictOf, depsDocsDir } from '../../src/deps'
import { createTempProject, cleanup } from '../helpers/tmp'
import type { DepFinding } from '../../src/deps/types'

describe('deps: verdicts', () => {
  it('changes-requested on errors, needs-attention on warnings, approved otherwise', () => {
    const finding = (severity: DepFinding['severity']): DepFinding =>
      ({ id: 'x', category: 'pairing', severity, package: 'p', current: '1.0.0', message: 'm', suggestion: 's' })
    expect(verdictOf([finding('error')])).toBe('changes-requested')
    expect(verdictOf([finding('warning')])).toBe('needs-attention')
    expect(verdictOf([finding('info')])).toBe('approved')
    expect(verdictOf([])).toBe('approved')
  })
})

describe('deps: runDepsScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('flags an RN/react floor mismatch as an error', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { 'react-native': '0.80.0', react: '17.0.2' } }),
    })
    const report = await runDepsScan(dir, { skipAudit: true })
    const floor = report.findings.find(f => f.id === 'react-floor')
    expect(floor).toBeDefined()
    expect(floor!.severity).toBe('error')
    expect(floor!.suggestion).toContain('react 18.3.x')
    expect(report.verdict).toBe('changes-requested')
  })

  it('flags an Expo SDK ↔ RN misalignment as a warning', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { 'react-native': '0.76.5', react: '18.3.1', expo: '54.0.0' } }),
    })
    const report = await runDepsScan(dir, { skipAudit: true })
    const alignment = report.findings.find(f => f.id === 'expo-rn-alignment')
    expect(alignment).toBeDefined()
    expect(alignment!.severity).toBe('warning')
    expect(alignment!.suggestion).toContain('npx expo install')
    expect(report.verdict).toBe('needs-attention')
  })

  it('detects duplicate versions across workspace members', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'mono', version: '1.0.0', workspaces: ['apps/*'], dependencies: { 'react-native': '0.80.0', react: '18.3.1' } }),
      'apps/a/package.json': JSON.stringify({ name: 'app-a', dependencies: { lodash: '^4.17.0' } }),
      'apps/b/package.json': JSON.stringify({ name: 'app-b', dependencies: { lodash: '^4.17.21' } }),
    })
    const report = await runDepsScan(dir, { skipAudit: true })
    const dup = report.findings.find(f => f.id.startsWith('duplicate-lodash'))
    expect(dup).toBeDefined()
    expect(dup!.severity).toBe('warning')
    expect(dup!.current).toContain('^4.17.0')
  })

  it('maps audit critical vulnerabilities to errors via the injected runner', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { 'react-native': '0.80.0', react: '18.3.1' } }),
      'package-lock.json': '{}',
    })
    const fakeAudit = { ran: true, total: 1, critical: 1, high: 0, moderate: 0, low: 0, vulnerabilities: [{ package: 'tar', severity: 'critical', isDirect: false }] }
    const report = await runDepsScan(dir, { auditRunner: async () => fakeAudit })
    expect(report.audit.ran).toBe(true)
    const vuln = report.findings.find(f => f.id === 'vulnerability' && f.package === 'tar')
    expect(vuln).toBeDefined()
    expect(vuln!.severity).toBe('error')
    expect(vuln!.suggestion).toContain('npm audit fix')
  })

  it('approves an aligned project with a clean audit', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { 'react-native': '0.80.0', react: '18.3.1' } }),
      'package-lock.json': '{}',
    })
    const cleanAudit = { ran: true, total: 0, critical: 0, high: 0, moderate: 0, low: 0, vulnerabilities: [] }
    const report = await runDepsScan(dir, { auditRunner: async () => cleanAudit })
    expect(report.verdict).toBe('approved')
  })
})

describe('deps: report writing', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('writes report.json and report.md to docs/vectalon/deps/', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { 'react-native': '0.80.0', react: '17.0.2' } }),
    })
    const report = await runDepsScan(dir, { skipAudit: true })
    const { jsonPath, mdPath } = writeDepsReport(dir, report)
    expect(jsonPath).toBe(join(depsDocsDir(dir), 'report.json'))
    expect(mdPath).toBe(join(depsDocsDir(dir), 'report.md'))
    expect(existsSync(jsonPath)).toBe(true)
    expect(existsSync(mdPath)).toBe(true)
    const md = readFileSync(mdPath, 'utf-8')
    expect(md).toContain('# vectalon deps — Dependency Upgrade Plan')
    expect(md).toContain('### [ERROR] react-floor')
  })

  it('renders a clean report', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { 'react-native': '0.80.0', react: '18.3.1' } }),
    })
    const report = await runDepsScan(dir, { skipAudit: true })
    expect(renderDepsMarkdown(report)).toContain('No dependency issues found')
  })
})
