import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { runRefactorScan, writeRefactorReport, renderRefactorMarkdown, verdictOf, refactorDocsDir } from '../../src/refactor'
import { scanRefactorFile } from '../../src/refactor/scan'
import { createTempProject, cleanup } from '../helpers/tmp'
import type { RefactorFinding } from '../../src/refactor/types'

describe('refactor: verdicts', () => {
  it('needs-attention on warnings, approved on info-only and empty', () => {
    const finding = (severity: RefactorFinding['severity']): RefactorFinding =>
      ({ id: 'x', category: 'modernization', severity, file: 'a.ts', line: 1, target: 't', message: 'm', suggestion: 's' })
    expect(verdictOf([finding('warning')])).toBe('needs-attention')
    expect(verdictOf([finding('info')])).toBe('approved')
    expect(verdictOf([])).toBe('approved')
    expect(verdictOf([finding('error')])).toBe('changes-requested')
  })
})

describe('refactor: per-file scanners', () => {
  it('flags an unused import via the AST scanner', () => {
    const findings = scanRefactorFile('src/a.ts', "import { unusedHelper } from './helper'\nexport const used = true\n")
    const unused = findings.find(f => f.id === 'unused-import')
    expect(unused).toBeDefined()
    expect(unused!.severity).toBe('warning')
    expect(unused!.target).toBe('unusedHelper')
    expect(unused!.line).toBe(1)
  })

  it('does not flag imports that are used in JSX or code', () => {
    const used = scanRefactorFile('src/a.tsx', "import { Card } from './Card'\nexport const el = <Card />\n")
    expect(used.some(f => f.id === 'unused-import')).toBe(false)
    const usedInCode = scanRefactorFile('src/b.ts', "import { helper } from './helper'\nexport const x = helper()\n")
    expect(usedInCode.some(f => f.id === 'unused-import')).toBe(false)
  })

  it('flags unused variables and unreachable code', () => {
    const findings = scanRefactorFile('src/a.ts', [
      'export const x = 1',
      'const neverUsed = 2',
      'export function f() {',
      '  return true;',
      '  const dead = 1',
      '}',
    ].join('\n'))
    expect(findings.some(f => f.id === 'unused-variable' && f.target === 'neverUsed')).toBe(true)
    expect(findings.some(f => f.id === 'unreachable-code' && f.line === 5)).toBe(true)
  })

  it('flags duplicated 5-line blocks', () => {
    const block = ['  const a = 1', '  const b = 2', '  const c = 3', '  const d = 4', '  const e = 5']
    const findings = scanRefactorFile('src/a.ts', [
      'export function one() {',
      ...block,
      '  return a + b + c + d + e',
      '}',
      'export function two() {',
      ...block,
      '  return a + b + c + d + e',
      '}',
    ].join('\n'))
    expect(findings.some(f => f.id === 'duplicated-block')).toBe(true)
  })

  it('flags modernization opportunities: optional chaining, includes, loose equality, var', () => {
    const findings = scanRefactorFile('src/a.ts', [
      'export function pick(user: any) {',
      '  const name = user && user.name',
      '  const hasRole = roles.indexOf("admin") !== -1',
      '  if (name != null) return name',
      '  var legacy = 1',
      '  return hasRole',
      '}',
    ].join('\n'))
    expect(findings.some(f => f.id === 'optional-chaining')).toBe(true)
    expect(findings.some(f => f.id === 'use-includes')).toBe(true)
    expect(findings.some(f => f.id === 'loose-equality')).toBe(true)
    expect(findings.some(f => f.id === 'var-usage')).toBe(true)
  })

  it('flags type smells and inline styles', () => {
    const anyFindings = scanRefactorFile('src/a.ts', 'export function f(x: any) { return x }\n')
    expect(anyFindings.some(f => f.id === 'any-type' && f.severity === 'warning')).toBe(true)

    const ignoreFindings = scanRefactorFile('src/b.ts', '// @ts-ignore\nconst x = 1\nexport { x }\n')
    expect(ignoreFindings.some(f => f.id === 'ts-ignore' && f.severity === 'warning')).toBe(true)

    const styleFindings = scanRefactorFile('src/c.tsx', 'export const Btn = () => <View style={{ width: 100, height: 50 }} />\n')
    expect(styleFindings.some(f => f.id === 'inline-style')).toBe(true)
  })

  it('flags long functions and oversized files via the shared suggester', () => {
    const lines = ['export function big() {']
    for (let i = 0; i < 28; i++) lines.push(`  const v${i} = ${i}`)
    lines.push('  return ' + Array.from({ length: 28 }, (_, i) => `v${i}`).join(' + '))
    lines.push('}')
    const findings = scanRefactorFile('src/a.ts', lines.join('\n'))
    expect(findings.some(f => f.id === 'long-function' && f.target === 'big')).toBe(true)
  })

  it('leaves a clean file untouched', () => {
    const findings = scanRefactorFile('src/a.ts', 'export const clean = true\n')
    expect(findings).toEqual([])
  })
})

describe('refactor: runRefactorScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('scans the project and rolls findings into a needs-attention verdict', () => {
    dir = createTempProject({
      'src/a.ts': "import { unusedHelper } from './helper'\nexport const used = true\n",
      'src/b.ts': 'export const clean = true\n',
    })
    const report = runRefactorScan(dir)
    expect(report.fileCount).toBe(2)
    expect(report.verdict).toBe('needs-attention')
    expect(report.summary.byCategory['dead-code']).toBeGreaterThan(0)
    expect(report.findings.some(f => f.id === 'unused-import' && f.file === 'src/a.ts')).toBe(true)
  })

  it('approves a clean project', () => {
    dir = createTempProject({
      'src/a.ts': 'export const clean = true\n',
    })
    expect(runRefactorScan(dir).verdict).toBe('approved')
  })
})

describe('refactor: report writing', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('writes report.json and report.md to docs/vectalon/refactor/', () => {
    dir = createTempProject({
      'src/a.ts': "import { unusedHelper } from './helper'\nexport const used = true\n",
    })
    const report = runRefactorScan(dir)
    const { jsonPath, mdPath } = writeRefactorReport(dir, report)
    expect(jsonPath).toBe(join(refactorDocsDir(dir), 'report.json'))
    expect(mdPath).toBe(join(refactorDocsDir(dir), 'report.md'))
    expect(existsSync(jsonPath)).toBe(true)
    expect(existsSync(mdPath)).toBe(true)
    expect(JSON.parse(readFileSync(jsonPath, 'utf-8')).verdict).toBe('needs-attention')
    const md = readFileSync(mdPath, 'utf-8')
    expect(md).toContain('# vectalon refactor — Refactor Opportunities')
    expect(md).toContain('### [WARNING] unused-import')
  })

  it('renders a clean report', () => {
    dir = createTempProject({ 'src/a.ts': 'export const clean = true\n' })
    expect(renderRefactorMarkdown(runRefactorScan(dir))).toContain('No refactor opportunities found')
  })
})
