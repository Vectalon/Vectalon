/**
 * vectalon sales-demo — hermetic tests: the five-act structure, the live fix
 * beat, the Zustand decision card, and the narration script. Runs against a
 * minimal fixture project; the fix verification is a stubbed runner (no real
 * builds).
 * Business Source License 1.1 (BSL-1.1)
 */
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { salesDemoCommand, writeSalesDemoScript } from '../../src/cli/commands/salesDemo'

const stubRun = async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })

const ZUSTAND_ADR = `# Zustand for client state management

## Decision

Performance + simplicity. Zustand gives the screens a minimal, hook-first state store with no provider nesting, and its selectors re-render only the components that subscribe.

## Context

We evaluated Redux Toolkit, MobX, and Jotai. For a navigation-heavy app with per-screen data and a shared cart, Zustand keeps re-renders scoped.

## Status

Accepted March 2026

Approved by: Architecture Team

Related: Cart, Checkout, Profile
`

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'vectalon-sales-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: root })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'demo-app', version: '1.0.0', dependencies: { react: '18.3.1', 'react-native': '0.76.5' } }, null, 2) + '\n'
  )
  mkdirSync(join(root, 'src', 'screens'), { recursive: true })
  writeFileSync(join(root, 'src', 'screens', 'Home.tsx'), "import { View } from 'react-native'\nexport const Home = () => <View />\n")
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true })
  writeFileSync(join(root, 'docs', 'adr', 'adr-017-zustand.md'), ZUSTAND_ADR)
  return root
}

async function runJson(root: string, question = 'Why did we choose Zustand?'): Promise<Array<{ id: string; minutes: string; lines: string[]; verdict: string }>> {
  const writes: string[] = []
  const orig = process.stdout.write
  process.stdout.write = ((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await salesDemoCommand(root, { json: true, question, run: stubRun })
  } finally {
    process.stdout.write = orig
  }
  return JSON.parse(writes.join('')) as Array<{ id: string; minutes: string; lines: string[]; verdict: string }>
}

describe('sales-demo', () => {
  let root: string
  beforeEach(() => {
    root = fixture()
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('runs the five acts in the sales narrative order with minute markers', async () => {
    const acts = await runJson(root)
    expect(acts.map(a => a.id)).toEqual(['init', 'intel', 'fix', 'brain', 'outcomes'])
    expect(acts.map(a => a.minutes)).toEqual(['0–5', '5–10', '10–20', '20–25', '25–30'])
  })

  it('act 1 shows the real scan census + health', async () => {
    const acts = await runJson(root)
    const init = acts.find(a => a.id === 'init')!
    expect(init.lines.join('\n')).toContain('Scanning React Native project')
    expect(init.lines.join('\n')).toMatch(/✓ \d+ files/)
    expect(init.lines.join('\n')).toMatch(/Health Score/)
  })

  it('act 2 shows the application model (screens/navigation/dependencies)', async () => {
    const acts = await runJson(root)
    const intel = acts.find(a => a.id === 'intel')!
    const text = intel.lines.join('\n')
    expect(text).toContain('application')
    expect(text).toContain('screens')
    expect(text).toContain('dependency graph')
  })

  it('act 3 runs the real fix pipeline on a committed failure and shows the sandbox fix', async () => {
    const acts = await runJson(root)
    const fix = acts.find(a => a.id === 'fix')!
    const text = fix.lines.join('\n')
    expect(text).toContain('Real injected failure')
    expect(text).toContain('Root cause')
    expect(text).toContain('Diagnose → fix → verify')
    expect(text).toMatch(/\d+ edits applied in sandbox/)
  })

  it('act 4 answers the Zustand question from the real ADR', async () => {
    const acts = await runJson(root)
    const brain = acts.find(a => a.id === 'brain')!
    const text = brain.lines.join('\n')
    expect(text).toContain('adr-017')
    expect(text).toContain('Zustand for client state management')
    expect(text).toContain('Approved by: Architecture Team')
    expect(text).toContain('Reviewed: March 2026')
  })

  it('act 5 reports the outcomes ledger honestly (empty until agents run)', async () => {
    const acts = await runJson(root)
    const outcomes = acts.find(a => a.id === 'outcomes')!
    const text = outcomes.lines.join('\n')
    expect(text).toContain('No outcomes yet')
  })

  it('writes the full 30-minute narration script', () => {
    const scriptPath = writeSalesDemoScript(root, 'Why did we choose Zustand?')
    const content = readFileSync(scriptPath, 'utf-8')
    for (const minute of ['Minute 0–5', 'Minute 5–10', 'Minute 10–20', 'Minute 20–25', 'Minute 25–30']) {
      expect(content).toContain(minute)
    }
    expect(content).toContain("Here's a real React Native repository.")
    expect(content).toContain('This is what Vectalon saved your team.')
  })
})
