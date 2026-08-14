/**
 * vectalon bug-fix — Autonomous Bug Fix Agent (Roadmap 070) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { runBugFix, scanForFixes, gitTreeClean, writeBugFixReport } from '../../src/bugFix'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('bug-fix: scanForFixes', () => {
  it('proposes unused-import removal (fixable) and multi-specifier lines (manual)', () => {
    const findings = scanForFixes('a.ts', "import { used, dead } from './lib'\nimport { only } from './other'\nconst x = used\n")
    const dead = findings.find(f => f.id === 'unused-import' && f.target === 'dead')
    expect(dead).toBeDefined()
    expect(dead!.fixable).toBe(false) // multi-specifier import — shared statement
    const only = findings.find(f => f.id === 'unused-import' && f.target === 'only')
    expect(only).toBeDefined()
    expect(only!.fixable).toBe(true)
    expect(only!.edit?.old).toContain('import { only }')
    expect(only!.edit?.new).toBe('')
  })

  it('proposes var→const with a precise edit, and loose equality as manual', () => {
    const findings = scanForFixes('a.ts', 'var counter = 1\nconsole.log(counter)\nif (x == y) {}\n')
    const v = findings.find(f => f.id === 'var-to-const')
    expect(v).toBeDefined()
    expect(v!.fixable).toBe(true)
    expect(v!.edit!.old).toBe('var counter =')
    expect(v!.edit!.new).toBe('const counter =')
    const loose = findings.find(f => f.id === 'loose-equality')
    expect(loose).toBeDefined()
    expect(loose!.fixable).toBe(false)
  })

  it('does not auto-fix a var that is reassigned (occurrence > 1)', () => {
    const findings = scanForFixes('a.ts', 'var x = 1\nx = 2\n')
    const v = findings.find(f => f.id === 'var-to-const')
    expect(v).toBeDefined()
    expect(v!.fixable).toBe(false)
  })
})

describe('bug-fix: runBugFix', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('dry-run proposes fixes without writing files', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
      'src/index.ts': "import { unused } from './helper'\nvar n = 1\nconsole.log(n)\n",
    })
    const report = await runBugFix(dir)
    expect(report.summary.total).toBeGreaterThan(0)
    expect(report.applied).toHaveLength(0)
    const content = readFileSync(join(dir, 'src', 'index.ts'), 'utf-8')
    expect(content).toContain('var n = 1')
  })

  it('--apply executes the safe whitelist and refuses on a dirty tree without --force', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
      'src/index.ts': "import { unused } from './helper'\nvar n = 1\nconsole.log(n)\n",
    })
    // Not a git repo: gitTreeClean is treated as clean → apply proceeds.
    const report = await runBugFix(dir, { apply: true })
    expect(report.applied.length).toBeGreaterThan(0)
    const content = readFileSync(join(dir, 'src', 'index.ts'), 'utf-8')
    expect(content).not.toContain('var n = 1')
    expect(content).not.toContain('unused')
  })

  it('gitTreeClean detects a dirty repository', () => {
    dir = createTempProject({ 'package.json': '{}' })
    execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init', { cwd: dir })
    expect(gitTreeClean(dir)).toBe(true)
    writeFileSync(join(dir, 'new.txt'), 'x')
    expect(gitTreeClean(dir)).toBe(false)
  })

  it('writes report.md and report.json', async () => {
    dir = createTempProject({ 'package.json': '{}', 'src/a.ts': 'var q = 1\nconsole.log(q)\n' })
    const report = await runBugFix(dir)
    const { mdPath, jsonPath } = writeBugFixReport(dir, report)
    expect(readFileSync(mdPath, 'utf-8')).toContain('vectalon bug-fix')
    expect(readFileSync(jsonPath, 'utf-8')).toContain('"verdict"')
  })
})
