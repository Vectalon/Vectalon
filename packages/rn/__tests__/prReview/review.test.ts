import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runPrReview, renderPrComment, verdictOf, PR_REVIEW_MARKER } from '../../src/prReview'
import type { PrReviewIssue, PrReviewReport } from '../../src/prReview'

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'vectalon-pr-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'pr-fixture', version: '1.0.0', dependencies: { react: '18.3.1', 'react-native': '0.76.5' } }, null, 2) + '\n'
  )
  // A known base Health Score — the health impact is deterministic.
  mkdirSync(join(root, 'docs', 'vectalon', 'score'), { recursive: true })
  writeFileSync(join(root, 'docs', 'vectalon', 'score', 'report.json'), JSON.stringify({ overall: 82 }, null, 2) + '\n')

  const files: Record<string, string> = {
    'src/App.tsx': "import { View } from 'react-native'\n\nexport const App = () => {\n  setLoading(true)\n  return <View />\n}\n",
    'src/App.test.tsx': "import { App } from './App'\nit('renders', () => {})\n",
    'src/api/client.ts': "export const client = {\n  apiKey: 'sk_live_1234567890abcdef',\n}\n",
    'src/api/client.test.ts': "import { client } from './client'\nit('has a client', () => {})\n",
    'src/components/Button.tsx': "import Home from '../screens/Home'\nexport const Button = Home\n",
    'src/components/Button.test.tsx': "import { Button } from './Button'\nit('renders', () => {})\n",
    'src/hooks/useCart.ts': 'export function useCart() {\n  return { items: [] }\n}\n',
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path.replace(/\/[^/]+$/, '')), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

/** A PR that introduces a secret, a render-phase setState, a layer violation, an untested hook, and an uninstalled dep. */
const PROBLEMATIC_DIFF = [
  'diff --git a/src/App.tsx b/src/App.tsx',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/App.tsx',
  '@@ -0,0 +1,5 @@',
  "+import { View } from 'react-native'",
  '+',
  '+export const App = () => {',
  '+  setLoading(true)',
  '+  return <View />',
  '+}',
  'diff --git a/src/App.test.tsx b/src/App.test.tsx',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/App.test.tsx',
  '@@ -0,0 +1,2 @@',
  "+import { App } from './App'",
  "+it('renders', () => {})",
  'diff --git a/src/api/client.ts b/src/api/client.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/api/client.ts',
  '@@ -0,0 +1,3 @@',
  '+export const client = {',
  "+  apiKey: 'sk_live_1234567890abcdef',",
  '+}',
  'diff --git a/src/api/client.test.ts b/src/api/client.test.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/api/client.test.ts',
  '@@ -0,0 +1,2 @@',
  "+import { client } from './client'",
  "+it('has a client', () => {})",
  'diff --git a/src/components/Button.tsx b/src/components/Button.tsx',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/components/Button.tsx',
  '@@ -0,0 +1,2 @@',
  "+import Home from '../screens/Home'",
  '+export const Button = Home',
  'diff --git a/src/components/Button.test.tsx b/src/components/Button.test.tsx',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/components/Button.test.tsx',
  '@@ -0,0 +1,2 @@',
  "+import { Button } from './Button'",
  "+it('renders', () => {})",
  'diff --git a/src/hooks/useCart.ts b/src/hooks/useCart.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/hooks/useCart.ts',
  '@@ -0,0 +1,3 @@',
  '+export function useCart() {',
  '+  return { items: [] }',
  '+}',
  'diff --git a/package.json b/package.json',
  'index 1111111..2222222 100644',
  '--- a/package.json',
  '+++ b/package.json',
  '@@ -1,4 +1,5 @@',
  ' {',
  '   "name": "pr-fixture",',
  '+  "react-native-ble": "^1.0.0",',
  '   "version": "1.0.0"',
  ' }',
  '',
].join('\n')

const CLEAN_DIFF = [
  'diff --git a/src/App.test.tsx b/src/App.test.tsx',
  '--- a/src/App.test.tsx',
  '+++ b/src/App.test.tsx',
  '@@ -1,2 +1,3 @@',
  " import { App } from './App'",
  " it('renders', () => {})",
  "+it('also renders', () => {})",
  '',
].join('\n')

describe('vc pr — the five-check review', () => {
  afterEach(() => {
    const memo = (globalThis as Record<string, unknown>)['__scoreMemo']
    void memo
  })

  it('flags every dimension on the problematic PR with the right priorities', async () => {
    const root = fixture()
    const report = await runPrReview(root, { diff: PROBLEMATIC_DIFF, number: 482, base: 'main' })

    expect(report.source).toBe('--diff')
    expect(report.number).toBe(482)
    expect(report.changedFiles).toContain('src/App.tsx')
    expect(report.additions).toBeGreaterThan(0)

    const byId = new Map(report.issues.map(i => [i.id, i]))
    // Security — provider secret is a hard P0.
    expect(byId.has('stripe-secret') || byId.has('hardcoded-api-key')).toBe(true)
    const sec = report.issues.find(i => i.dimension === 'security' && i.severity === 'error')
    expect(sec).toBeDefined()
    expect(sec!.priority).toBe('P0')
    expect(sec!.file).toBe('src/api/client.ts')
    // Performance — render-phase setState on the added line, P1 per the roadmap example.
    const perf = report.issues.find(i => i.id === 'set-state-during-render')
    expect(perf).toBeDefined()
    expect(perf!.priority).toBe('P1')
    expect(perf!.line).toBe(4)
    // Architecture — shared importing feature code.
    const arch = report.issues.find(i => i.id === 'layer-violation')
    expect(arch).toBeDefined()
    expect(arch!.file).toBe('src/components/Button.tsx')
    expect(arch!.severity).toBe('warning')
    // Testing — the untested hook, but the tested files are clean.
    const testIssues = report.issues.filter(i => i.dimension === 'testing')
    expect(testIssues.map(i => i.file)).toEqual(['src/hooks/useCart.ts'])
    // Dependencies — added but not installed + no lockfile.
    expect(byId.has('dep-not-installed')).toBe(true)
    expect(byId.has('dep-lockfile-missing')).toBe(true)

    // Scorecard rows.
    expect(report.checks.find(c => c.dimension === 'security')!.status).toBe('fail')
    expect(report.checks.find(c => c.dimension === 'dependencies')!.status).toBe('fail')
    expect(report.checks.find(c => c.dimension === 'performance')!.status).toBe('warn')
    expect(report.checks.find(c => c.dimension === 'testing')!.status).toBe('warn')
    expect(report.checks.find(c => c.dimension === 'architecture')!.status).toBe('warn')

    expect(report.verdict).toBe('changes-requested')

    // Health impact: 82 − (10+10+10+5+5+5+5) = 32 (three errors, four warnings).
    expect(report.baseScore).toBe(82)
    expect(report.projectedScore).toBe(32)

    rmSync(root, { recursive: true, force: true })
  })

  it('approves a clean test-only PR with no health impact', async () => {
    const root = fixture()
    const report = await runPrReview(root, { diff: CLEAN_DIFF })
    expect(report.issues).toEqual([])
    expect(report.verdict).toBe('approved')
    expect(report.baseScore).toBe(82)
    expect(report.projectedScore).toBe(82)
    expect(report.checks.every(c => c.status === 'pass')).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('posts the bot comment through the commenter seam', async () => {
    const root = fixture()
    let captured: { number: number; body: string } | null = null
    const report = await runPrReview(root, { diff: PROBLEMATIC_DIFF, number: 482 }, async (n, body) => {
      captured = { number: n, body }
    })
    expect(report.commentPosted).toBe(true)
    expect(captured!.number).toBe(482)

    const body = captured!.body
    expect(body).toContain(`<!-- ${PR_REVIEW_MARKER} -->`)
    expect(body).toContain('🤖 Vectalon — PR Review')
    expect(body).toContain('**PR #482**')
    expect(body).toContain('| Architecture | ⚠️')
    expect(body).toContain('| Security | ✗')
    expect(body).toContain('Health impact: 82 → 32')
    expect(body).toContain('[Fix automatically]')
    rmSync(root, { recursive: true, force: true })
  })

  it('renders an approved comment with the all-clear table', () => {
    const report: PrReviewReport = {
      scannedAt: 0, root: '/x', source: '--diff', number: 7, title: null, base: 'main',
      changedFiles: ['src/a.test.ts'], additions: 1, deletions: 0,
      checks: [
        { dimension: 'architecture', label: 'Architecture', status: 'pass', issueCount: 0 },
        { dimension: 'dependencies', label: 'Dependencies', status: 'pass', issueCount: 0 },
        { dimension: 'security', label: 'Security', status: 'pass', issueCount: 0 },
        { dimension: 'performance', label: 'Performance', status: 'pass', issueCount: 0 },
        { dimension: 'testing', label: 'Testing', status: 'pass', issueCount: 0 },
      ],
      issues: [] as PrReviewIssue[],
      baseScore: 82, projectedScore: 82, verdict: 'approved' as const, commentPosted: false,
    }
    const body = renderPrComment(report)
    expect(body).toContain('No issues found on the changed lines.')
    expect(body).toContain('Health impact: 82 → 82')
    expect(body).toContain('✅')
  })

  it('reports no-data when no diff can be resolved', async () => {
    const root = fixture()
    const report = await runPrReview(root, {})
    // No git repo + no diff input → explicit no-data verdict, not a guess.
    expect(report.issues.some(i => i.id === 'no-diff')).toBe(true)
    expect(report.verdict).toBe('needs-attention')
    expect(report.changedFiles).toEqual([])
    rmSync(root, { recursive: true, force: true })
  })

  it('derives the verdict from priorities (not raw scanner severity)', () => {
    const base = { id: 'x', dimension: 'security', file: 'a', line: 1, message: 'm', suggestion: 's' } as PrReviewIssue
    expect(verdictOf([{ ...base, severity: 'error', priority: 'P0' }])).toBe('changes-requested')
    expect(verdictOf([{ ...base, severity: 'error', priority: 'P1' }])).toBe('needs-attention') // static hint, demoted
    expect(verdictOf([{ ...base, severity: 'warning', priority: 'P1' }])).toBe('needs-attention')
    expect(verdictOf([{ ...base, severity: 'info', priority: 'P2' }])).toBe('needs-attention') // any finding = attention
    expect(verdictOf([])).toBe('approved')
  })
})
