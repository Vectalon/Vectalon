/**
 * vectalon tokens — Design Token Sync Agent (Roadmap 076) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync } from 'fs'
import { flattenTokens, findTokenFile, runTokenScan, writeTokenReport } from '../../src/tokens'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('tokens: flattenTokens', () => {
  it('flattens nested style-dictionary tokens with path joins', () => {
    const tokens = flattenTokens({ color: { primary: { value: '#1a1a1a' }, spacing: { md: { value: '16' } } } })
    expect(tokens).toHaveLength(2)
    expect(tokens[0].path).toEqual(['color', 'primary'])
    expect(tokens[0].pascal).toBe('ColorPrimary')
    expect(tokens[0].camel).toBe('colorPrimary')
  })
})

describe('tokens: runTokenScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('flags orphaned tokens and hardcoded colors', () => {
    dir = createTempProject({
      'package.json': '{}',
      'tokens.json': JSON.stringify({ color: { primary: { value: '#1a1a1a' }, unused: { value: '#2b2b2b' } } }),
      'src/theme.ts': "export const theme = { primary: '#1a1a1a' }\nconst stray = '#ff0000'\n",
    })
    const report = runTokenScan(dir)
    expect(report.tokenCount).toBe(2)
    expect(report.findings.some(f => f.id === 'orphan-token' && f.token === 'color.unused')).toBe(true)
    expect(report.findings.some(f => f.id === 'hardcoded-value' && f.token === '#ff0000')).toBe(true)
    expect(report.verdict).toBe('needs-attention')
  })

  it('flags duplicate token values', () => {
    dir = createTempProject({
      'package.json': '{}',
      'tokens.json': JSON.stringify({ color: { a: { value: '#111111' }, b: { value: '#111111' } } }),
      'src/theme.ts': "export const theme = { a: '#111111' }\n",
    })
    const report = runTokenScan(dir)
    expect(report.findings.some(f => f.id === 'duplicate-value')).toBe(true)
  })

  it('approved when tokens are all referenced and values are tokenized', () => {
    dir = createTempProject({
      'package.json': '{}',
      'tokens.json': JSON.stringify({ color: { primary: { value: '#1a1a1a' } } }),
      'src/theme.ts': "import tokens from '../tokens.json'\nexport const c = tokens.color.primary\n",
    })
    const report = runTokenScan(dir)
    expect(report.findings.filter(f => f.severity === 'warning')).toHaveLength(0)
  })

  it('reports cleanly when no token file exists', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runTokenScan(dir)
    expect(findTokenFile(dir)).toBeNull()
    expect(report.tokenCount).toBe(0)
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}', 'tokens.json': '{}', 'src/a.ts': 'export const x = 1\n' })
    const report = runTokenScan(dir)
    const { mdPath, jsonPath } = writeTokenReport(dir, report)
    expect(readFileSync(mdPath, 'utf-8')).toContain('tokens')
    expect(readFileSync(jsonPath, 'utf-8')).toContain('"tokenCount"')
  })
})
