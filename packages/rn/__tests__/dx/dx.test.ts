/**
 * vectalon dx — DX Scoring Agent (Roadmap 100) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { runDx, complexityRatio } from '../../src/dx'
import { createTempProject, cleanup } from '../helpers/tmp'

function greatProject(): Record<string, string> {
  return {
    'package.json': JSON.stringify({ name: 'app', version: '1.0.0', jest: { preset: 'react-native' } }),
    'README.md': '# App\n',
    'CONTRIBUTING.md': '# Contributing\n',
    'docs/index.md': '# Docs\n',
    '.github/workflows/ci.yml': 'name: ci\non: [push]\n',
    '__tests__/x.test.ts': 'it("works", () => expect(1).toBe(1))\n',
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'eslint.config.js': 'module.exports = []\n',
    '.prettierrc': '{}\n',
    'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }),
    'CHANGELOG.md': '# Changelog\n',
    'docs/vectalon/team/README.md': '# Team\n',
    'src/App.tsx': 'export const App = () => null\n',
  }
}

describe('dx: runDx', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('scores a well-furnished project A / approved', () => {
    dir = createTempProject(greatProject())
    const report = runDx(dir)
    expect(report.score).toBeGreaterThanOrEqual(85)
    expect(report.grade).toBe('A')
    expect(report.verdict).toBe('approved')
    expect(report.axes.every(a => a.score === 100)).toBe(true)
    expect(report.improvements).toHaveLength(0)
  })

  it('scores a bare project changes-requested', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runDx(dir)
    expect(report.score).toBeLessThan(50)
    expect(report.verdict).toBe('changes-requested')
    expect(report.improvements.length).toBeGreaterThan(0)
  })

  it('scores a partially-furnished project needs-attention', () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', jest: { preset: 'react-native' } }),
      'README.md': '# App\n',
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'eslint.config.js': 'module.exports = []\n',
      '.prettierrc': '{}\n',
      'CHANGELOG.md': '# Changelog\n',
      'docs/index.md': '# Docs\n',
      'src/a.ts': 'export const a = 1\n',
    })
    const report = runDx(dir)
    expect(report.score).toBeGreaterThanOrEqual(50)
    expect(report.score).toBeLessThan(70)
    expect(report.verdict).toBe('needs-attention')
  })
})

describe('dx: complexityRatio', () => {
  it('returns 0 for an empty project', () => {
    const dir = createTempProject({})
    expect(complexityRatio(dir)).toEqual({ ratio: 0, avgLines: 0 })
    cleanup(dir)
  })

  it('penalizes giant files', () => {
    const longFile = Array.from({ length: 400 }, (_, i) => `const v${i} = ${i}`).join('\n')
    const dir = createTempProject({ 'src/a.ts': longFile })
    const { ratio, avgLines } = complexityRatio(dir)
    expect(avgLines).toBe(400)
    expect(ratio).toBeLessThan(0.5)
    cleanup(dir)
  })
})
