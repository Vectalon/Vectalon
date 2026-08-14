/**
 * vectalon arch-score — Mobile Architecture Scorecard (Roadmap 072) —
 * hermetic tests. Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync } from 'fs'
import { scoreArchitecture, verdictOf, writeArchScoreReport } from '../../src/archScore'
import { createTempProject, cleanup } from '../helpers/tmp'

function baseProject(): Record<string, string> {
  const files: Record<string, string> = { 'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }) }
  files['src/App.tsx'] = "import Home from './screens/Home'\nexport default () => Home\n"
  files['src/screens/Home.tsx'] = "import Button from '../components/Button'\nexport default () => null\n"
  files['src/components/Button.tsx'] = 'export default () => null\n'
  files['src/__tests__/App.test.ts'] = "import { render } from '@testing-library/react-native'\n"
  return files
}

describe('arch-score: scoring', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('scores a clean layered project near the top', () => {
    dir = createTempProject(baseProject())
    const report = scoreArchitecture(dir)
    expect(report.dimensions).toHaveLength(6)
    expect(report.total).toBeGreaterThanOrEqual(85)
    expect(report.verdict).toBe('approved')
    expect(report.grade).toBe('A')
  })

  it('penalizes cycles hard', () => {
    const files = baseProject()
    files['src/a.ts'] = "import { b } from './b'\nexport const a = b\n"
    files['src/b.ts'] = "import { a } from './a'\nexport const b = a\n"
    dir = createTempProject(files)
    const report = scoreArchitecture(dir)
    const cycles = report.dimensions.find(d => d.id === 'cycles')
    expect(cycles!.score).toBeLessThan(100)
    expect(report.verdict).not.toBe('approved')
  })

  it('flags shared→feature layering violations', () => {
    const files = baseProject()
    files['src/utils/helper.ts'] = "import Home from '../screens/Home'\n"
    dir = createTempProject(files)
    const report = scoreArchitecture(dir)
    const layering = report.dimensions.find(d => d.id === 'layering')
    expect(layering!.score).toBeLessThan(100)
    expect(report.topImprovements.some(i => i.includes('layering') || i.includes('shared→feature'))).toBe(true)
  })

  it('verdict thresholds', () => {
    expect(verdictOf(90)).toBe('approved')
    expect(verdictOf(75)).toBe('needs-attention')
    expect(verdictOf(60)).toBe('changes-requested')
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject(baseProject())
    const report = scoreArchitecture(dir)
    const { mdPath, jsonPath } = writeArchScoreReport(dir, report)
    expect(readFileSync(mdPath, 'utf-8')).toContain('arch-score')
    expect(readFileSync(jsonPath, 'utf-8')).toContain('"total"')
  })
})
