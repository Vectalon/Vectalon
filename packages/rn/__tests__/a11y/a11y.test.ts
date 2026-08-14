import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { runA11yScan, writeA11yReport, renderA11yMarkdown, verdictOf, a11yDocsDir } from '../../src/a11y'
import { scanA11yFile } from '../../src/a11y/scan'
import { createTempProject, cleanup } from '../helpers/tmp'
import type { A11yFinding } from '../../src/a11y/types'

describe('a11y: verdicts', () => {
  it('changes-requested on errors, needs-attention on warnings, approved otherwise', () => {
    const finding = (severity: A11yFinding['severity']): A11yFinding =>
      ({ id: 'x', severity, file: 'a.tsx', line: 1, target: 't', message: 'm', suggestion: 's' })
    expect(verdictOf([finding('error')])).toBe('changes-requested')
    expect(verdictOf([finding('warning')])).toBe('needs-attention')
    expect(verdictOf([])).toBe('approved')
  })
})

describe('a11y: per-file scanners', () => {
  it('flags an unlabeled Image as an error', () => {
    const findings = scanA11yFile('src/a.tsx', 'export const Logo = () => <Image source={src} />\n')
    expect(findings.some(f => f.id === 'image-no-label' && f.severity === 'error')).toBe(true)
  })

  it('flags touchables without roles and unlabeled TextInputs as warnings', () => {
    const findings = scanA11yFile('src/a.tsx', [
      'export const Btn = () => <Pressable onPress={go}><Text>Go</Text></Pressable>',
      'export const Field = () => <TextInput value={v} onChangeText={set} />',
    ].join('\n'))
    expect(findings.some(f => f.id === 'touchable-no-role' && f.line === 1)).toBe(true)
    expect(findings.some(f => f.id === 'textinput-no-label' && f.line === 2)).toBe(true)
  })

  it('passes elements that declare their a11y attributes', () => {
    const findings = scanA11yFile('src/a.tsx', [
      'export const Logo = () => <Image source={src} accessibilityLabel="Logo" />',
      'export const Btn = () => <Pressable accessibilityRole="button" onPress={go}><Text>Go</Text></Pressable>',
      'export const Field = () => <TextInput accessibilityLabel="Email" value={v} onChangeText={set} />',
    ].join('\n'))
    expect(findings).toEqual([])
  })

  it('flags undersized touch targets', () => {
    const findings = scanA11yFile('src/a.tsx', 'export const Tiny = () => <Pressable style={{ width: 32, height: 32 }} onPress={go} />\n')
    const target = findings.find(f => f.id === 'touch-target-size')
    expect(target).toBeDefined()
    expect(target!.severity).toBe('warning')
    expect(target!.target).toBe('32×32pt')
    // A 48×48 target passes.
    const ok = scanA11yFile('src/b.tsx', 'export const Big = () => <Pressable style={{ width: 48, height: 48 }} onPress={go} />\n')
    expect(ok.some(f => f.id === 'touch-target-size')).toBe(false)
  })
})

describe('a11y: runA11yScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('scans component files and rolls findings into a verdict', () => {
    dir = createTempProject({
      'src/a.tsx': 'export const Logo = () => <Image source={src} />\n',
      'src/b.tsx': 'export const Btn = () => <Pressable accessibilityRole="button" onPress={go}><Text>Go</Text></Pressable>\n',
      'src/c.ts': 'export const x = 1\n',
    })
    const report = runA11yScan(dir)
    expect(report.fileCount).toBe(2) // only .tsx/.jsx
    expect(report.verdict).toBe('changes-requested')
    expect(report.findings.some(f => f.file === 'src/a.tsx')).toBe(true)
  })

  it('approves an accessible project', () => {
    dir = createTempProject({
      'src/a.tsx': 'export const Logo = () => <Image source={src} accessibilityLabel="Logo" />\n',
    })
    expect(runA11yScan(dir).verdict).toBe('approved')
  })
})

describe('a11y: report writing', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('writes report.json and report.md to docs/vectalon/a11y/', () => {
    dir = createTempProject({
      'src/a.tsx': 'export const Logo = () => <Image source={src} />\n',
    })
    const report = runA11yScan(dir)
    const { jsonPath, mdPath } = writeA11yReport(dir, report)
    expect(jsonPath).toBe(join(a11yDocsDir(dir), 'report.json'))
    expect(mdPath).toBe(join(a11yDocsDir(dir), 'report.md'))
    expect(existsSync(jsonPath)).toBe(true)
    expect(existsSync(mdPath)).toBe(true)
    const md = readFileSync(mdPath, 'utf-8')
    expect(md).toContain('# vectalon a11y — Accessibility Review')
    expect(md).toContain('### [ERROR] image-no-label')
  })

  it('renders a clean report', () => {
    dir = createTempProject({ 'src/a.tsx': 'export const Logo = () => <Image source={src} accessibilityLabel="Logo" />\n' })
    expect(renderA11yMarkdown(runA11yScan(dir))).toContain('No accessibility issues found')
  })
})
