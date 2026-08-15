/**
 * vectalon figma — Figma-to-code Sync Agent (Roadmap 080) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { parseFigmaExport, runFigmaSync, writeFigmaReport, findDesignFile } from '../../src/figma'
import { createTempProject, cleanup } from '../helpers/tmp'

const DESIGN = {
  documents: [
    {
      name: 'Home',
      type: 'FRAME',
      fills: [{ type: 'SOLID', color: { r: 1, g: 0.1, b: 0.1 } }],
      children: [
        { name: 'PrimaryButton', type: 'COMPONENT', fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 1 } }] },
        { name: 'Headline', type: 'TEXT', fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }] },
      ],
    },
  ],
}

describe('figma: parseFigmaExport', () => {
  it('collects colors and components from the node tree', () => {
    const { colors, components } = parseFigmaExport(DESIGN)
    expect(colors.length).toBeGreaterThanOrEqual(3)
    expect(colors.some(c => c.hex === '#1A1AFF')).toBe(true)
    expect(components.some(c => c.name === 'PrimaryButton' && c.type === 'component')).toBe(true)
    expect(components.some(c => c.name === 'Home' && c.type === 'frame')).toBe(true)
  })

  it('tolerates empty exports', () => {
    expect(parseFigmaExport({})).toEqual({ colors: [], components: [] })
  })
})

describe('figma: runFigmaSync', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('flags design colors never referenced in source', () => {
    dir = createTempProject({
      'package.json': '{}',
      'figma.json': JSON.stringify(DESIGN),
      'src/theme.ts': "export const accent = '#FF1A1A'\nexport const PrimaryButton = () => null\n",
    })
    const report = runFigmaSync(dir)
    expect(findDesignFile(dir)).not.toBeNull()
    // #1A1AFF is in the design but never in source.
    expect(report.findings.some(f => f.id === 'missing-token' && f.message.includes('#1A1AFF'))).toBe(true)
    expect(report.verdict).toBe('needs-attention')
  })

  it('approved when every design color is referenced', () => {
    dir = createTempProject({
      'package.json': '{}',
      'figma.json': JSON.stringify(DESIGN),
      'src/theme.ts': "export const a = '#FF1A1A'\nexport const b = '#1A1AFF'\nexport const c = '#000000'\nexport const PrimaryButton = () => null\n",
    })
    const report = runFigmaSync(dir)
    expect(report.findings.filter(f => f.severity === 'warning')).toHaveLength(0)
  })

  it('reports when no design export exists', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runFigmaSync(dir)
    expect(findDesignFile(dir)).toBeNull()
    expect(report.findings.some(f => f.id === 'missing-token')).toBe(true)
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runFigmaSync(dir)
    const { mdPath, jsonPath } = writeFigmaReport(dir, report)
    expect(mdPath).toContain('figma')
    expect(jsonPath).toContain('report.json')
  })
})
