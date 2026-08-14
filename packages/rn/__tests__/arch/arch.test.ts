import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { runArchReview, writeArchReport, renderArchMarkdown, verdictOf, archDocsDir } from '../../src/arch'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('arch: verdicts', () => {
  it('changes-requested on errors, needs-attention on warnings, approved otherwise', () => {
    expect(verdictOf([{ id: 'x', category: 'structure', severity: 'error', module: 'a', file: 'a.ts', message: '', suggestion: '' }]))
      .toBe('changes-requested')
    expect(verdictOf([{ id: 'x', category: 'structure', severity: 'warning', module: 'a', file: 'a.ts', message: '', suggestion: '' }]))
      .toBe('needs-attention')
    expect(verdictOf([{ id: 'x', category: 'structure', severity: 'info', module: 'a', file: 'a.ts', message: '', suggestion: '' }]))
      .toBe('approved')
    expect(verdictOf([])).toBe('approved')
  })
})

describe('arch: runArchReview', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('flags a circular dependency as an error', () => {
    dir = createTempProject({
      'src/a.ts': "import { b } from './b'\nexport const a = b\n",
      'src/b.ts': "import { a } from './a'\nexport const b = a\n",
    })
    const report = runArchReview(dir)
    const cycle = report.findings.find(f => f.id === 'circular-dependency')
    expect(cycle).toBeDefined()
    expect(cycle!.severity).toBe('error')
    expect(cycle!.file).toContain('src/a.ts')
    expect(report.verdict).toBe('changes-requested')
    expect(report.summary.bySeverity.error).toBeGreaterThan(0)
  })

  it('flags shared code importing feature code as a layering violation', () => {
    dir = createTempProject({
      'src/utils/format.ts': "import { CheckoutScreen } from '../screens/CheckoutScreen'\nexport const format = CheckoutScreen\n",
      'src/screens/CheckoutScreen.tsx': 'export const CheckoutScreen = true\n',
    })
    const report = runArchReview(dir)
    const layering = report.findings.find(f => f.id === 'layering-violation')
    expect(layering).toBeDefined()
    expect(layering!.severity).toBe('warning')
    expect(layering!.module).toBe('utils')
    expect(layering!.file).toBe('src/utils/format.ts')
    expect(report.verdict).toBe('needs-attention')
  })

  it('does not flag feature code importing shared code', () => {
    dir = createTempProject({
      'src/screens/HomeScreen.tsx': "import { format } from '../utils/format'\nexport const HomeScreen = format\n",
      'src/utils/format.ts': 'export const format = true\n',
    })
    const report = runArchReview(dir)
    expect(report.findings.filter(f => f.id === 'layering-violation')).toHaveLength(0)
  })

  it('flags a god module by fan-out and by size', () => {
    const deps = Array.from({ length: 13 }, (_, i) => `import { v${i} } from './dep${i}'\n`).join('')
    const depFiles: Record<string, string> = {}
    for (let i = 0; i < 13; i++) depFiles[`src/dep${i}.ts`] = `export const v${i} = ${i}\n`
    dir = createTempProject({
      'src/God.ts': `${deps}export const god = true\n`,
      ...depFiles,
    })
    const report = runArchReview(dir)
    const god = report.findings.find(f => f.id === 'god-module')
    expect(god).toBeDefined()
    expect(god!.file).toBe('src/God.ts')
    expect(god!.severity).toBe('warning')

    // Size-based god module: short import list, but 650 lines.
    const bigLines = Array.from({ length: 650 }, (_, i) => `const x${i} = ${i}`).join('\n')
    dir = createTempProject({
      'src/Big.ts': `${bigLines}\n`,
    })
    const report2 = runArchReview(dir)
    expect(report2.findings.some(f => f.id === 'god-module' && f.file === 'src/Big.ts')).toBe(true)
  })

  it('flags a module importing from many siblings as over-coupled', () => {
    const imports = Array.from({ length: 9 }, (_, i) => `import { v${i} } from '../mod${i}/index'\n`).join('')
    const mods: Record<string, string> = {}
    for (let i = 0; i < 9; i++) mods[`src/mod${i}/index.ts`] = `export const v${i} = ${i}\n`
    dir = createTempProject({
      'src/feature/All.ts': `${imports}export const all = true\n`,
      ...mods,
    })
    const report = runArchReview(dir)
    const coupling = report.findings.find(f => f.id === 'module-coupling')
    expect(coupling).toBeDefined()
    expect(coupling!.module).toBe('feature')
    expect(coupling!.severity).toBe('warning')
  })

  it('flags files trapped in unreachable subgraphs as orphans', () => {
    dir = createTempProject({
      'src/index.ts': "import { used } from './used'\nexport { used }\n",
      'src/used.ts': 'export const used = true\n',
      'src/lost.ts': "import { lost2 } from './lost2'\nexport const lost = lost2\n",
      'src/lost2.ts': "import { lost } from './lost'\nexport const lost2 = lost\n",
    })
    const report = runArchReview(dir)
    // lost/lost2 form a closed subgraph nothing imports — unreachable dead code.
    const orphan = report.findings.find(f => f.id === 'orphan-module' && f.file === 'src/lost.ts')
    expect(orphan).toBeDefined()
    expect(orphan!.severity).toBe('info')
    // The reachable side stays clean of orphan flags.
    expect(report.findings.filter(f => f.id === 'orphan-module' && f.file.startsWith('src/used'))).toHaveLength(0)
  })

  it('reports deep nesting beyond the depth cap', () => {
    dir = createTempProject({
      'src/a/b/c/d/e/Deep.ts': 'export const deep = true\n',
    })
    const report = runArchReview(dir)
    expect(report.findings.some(f => f.id === 'deep-nesting' && f.file === 'src/a/b/c/d/e/Deep.ts')).toBe(true)
    // Depth cap is configurable.
    const lenient = runArchReview(dir, { maxDepth: 10 })
    expect(lenient.findings.some(f => f.id === 'deep-nesting')).toBe(false)
  })

  it('approves a clean module graph', () => {
    dir = createTempProject({
      'src/index.ts': "import { format } from './utils/format'\nexport { format }\n",
      'src/utils/format.ts': 'export const format = true\n',
    })
    const report = runArchReview(dir)
    expect(report.verdict).toBe('approved')
    expect(report.modules.some(m => m.path === 'utils')).toBe(true)
  })

  it('honors an explicit srcDir and returns no findings on a missing one', () => {
    dir = createTempProject({
      'lib/a.ts': "import { b } from './b'\nexport const a = b\n",
      'lib/b.ts': "import { a } from './a'\nexport const b = a\n",
    })
    expect(runArchReview(dir, { srcDir: 'lib' }).verdict).toBe('changes-requested')
    expect(runArchReview(dir, { srcDir: 'nonexistent' }).findings).toEqual([])
  })
})

describe('arch: report writing', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('writes report.json and report.md to docs/vectalon/arch/', () => {
    dir = createTempProject({
      'src/index.ts': 'export const ok = true\n',
    })
    const report = runArchReview(dir)
    const { jsonPath, mdPath } = writeArchReport(dir, report)
    expect(jsonPath).toBe(join(archDocsDir(dir), 'report.json'))
    expect(mdPath).toBe(join(archDocsDir(dir), 'report.md'))
    expect(existsSync(jsonPath)).toBe(true)
    expect(existsSync(mdPath)).toBe(true)
    expect(JSON.parse(readFileSync(jsonPath, 'utf-8')).verdict).toBe('approved')
    const md = readFileSync(mdPath, 'utf-8')
    expect(md).toContain('# vectalon arch — Architecture Review')
    expect(md).toContain('No architecture issues found')
  })

  it('renders the modules table and findings in markdown', () => {
    dir = createTempProject({
      'src/m1/a.ts': "import { b } from '../m2/b'\nexport const a = b\n",
      'src/m2/b.ts': "import { a } from '../m1/a'\nexport const b = a\n",
    })
    const md = renderArchMarkdown(runArchReview(dir))
    expect(md).toContain('## Modules')
    expect(md).toContain('| m1 |')
    expect(md).toContain('| m2 |')
    expect(md).toContain('### [ERROR] circular-dependency')
    expect(md).toContain('**Fix:** Break the cycle')
  })
})
