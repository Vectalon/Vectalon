import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { parseGitDiff } from '../../src/review/gitDiff'
import { runReview, writeReviewReport, verdictOf, renderReview, reviewDocsDir } from '../../src/review'
import { standardsCheck } from '../../src/review/standards'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'
import type { CodingStandard } from '../../src/teamBrain/types'
import type { ReviewFileResult } from '../../src/review/types'

const PROJECT = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { 'react-native': '0.72.0', typescript: '5.0.0' },
  }),
  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }),
}

const SAMPLE_DIFF = `diff --git a/src/PaymentScreen.tsx b/src/PaymentScreen.tsx
index abc123..def456 100644
--- a/src/PaymentScreen.tsx
+++ b/src/PaymentScreen.tsx
@@ -10,7 +10,9 @@ export function PaymentScreen() {
   const amount = 100
-  const old = legacyCall()
+  const result = calculateFee(amount)
+  console.log(result)
+  const apiKey = 'sk-abcdefghijklmnop'
   return (
     <View>
-      <Legacy />
+      <Pressable onPress={submit}>
+        <Text>Submit</Text>
+      </Pressable>
     </View>
   )
 }
`

describe('review: git diff parsing', () => {
  it('extracts added lines with real new-file line numbers', () => {
    const files = parseGitDiff(SAMPLE_DIFF)
    expect(files.length).toBe(1)
    const file = files[0]
    expect(file.path).toBe('src/PaymentScreen.tsx')
    expect(file.addedLines.map(a => a.line)).toEqual([11, 12, 13, 16, 17, 18])
    expect(file.addedLines[0].text).toBe('  const result = calculateFee(amount)')
    // Context lines advance the counter: 10 (ctx) + 1 removed + 3 added +
    // 2 ctx (`return (`, `<View>`) + 3 added = 16, 17, 18.
    expect(file.addedLines[3].text).toBe('      <Pressable onPress={submit}>')
    expect(file.addedLines[5].text).toBe('      </Pressable>')
  })

  it('handles multiple hunks and files', () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
index 1..2 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,0 +1,2 @@
+line one
+line two
diff --git a/src/b.ts b/src/b.ts
index 3..4 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -5,0 +6,1 @@
+only here
`
    const files = parseGitDiff(diff)
    expect(files.map(f => f.path)).toEqual(['src/a.ts', 'src/b.ts'])
    expect(files[0].addedLines.map(a => a.line)).toEqual([1, 2])
    expect(files[1].addedLines.map(a => a.line)).toEqual([6])
  })

  it('skips deletions and files with no added lines', () => {
    const diff = `diff --git a/src/removed.ts b/src/removed.ts
index 1..2 100644
--- a/src/removed.ts
+++ b/src/removed.ts
@@ -3,2 +0,0 @@
-  const gone = true
-  const goneToo = true
diff --git a/src/kept.ts b/src/kept.ts
index 3..4 100644
--- a/src/kept.ts
+++ b/src/kept.ts
@@ -1,0 +1,1 @@
+kept
`
    const files = parseGitDiff(diff)
    expect(files.length).toBe(1)
    expect(files[0].path).toBe('src/kept.ts')
  })

  it('returns an empty list for an empty diff', () => {
    expect(parseGitDiff('')).toEqual([])
  })
})

describe('review: runReview', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
    dir = createTempProject(PROJECT)
    configDir = useTempConfig()
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  it('flags deterministic issues in the diff with real line numbers', async () => {
    const result = await runReview(dir, { gitDiffOutput: SAMPLE_DIFF })
    expect(result.base).toBe('working-tree')
    expect(result.files.length).toBe(1)
    const file = result.files[0]
    // console.log (warning), hardcoded secret (error), missing-key (info):
    // the added `<Pressable>` line is fine.
    expect(file.findings.some(f => f.rule === 'no-console-log')).toBe(true)
    expect(file.findings.some(f => f.rule === 'no-hardcoded-secrets')).toBe(true)
    expect(file.findings.some(f => f.rule === 'missing-accessibility')).toBe(true)
    // console.log is on added line 12; the secret on line 13.
    const consoleLog = file.findings.find(f => f.rule === 'no-console-log')!
    expect(consoleLog.line).toBe(12)
    const secret = file.findings.find(f => f.rule === 'no-hardcoded-secrets')!
    expect(secret.line).toBe(13)
    expect(result.verdict).toBe('changes-requested')
    expect(result.summary.errors).toBeGreaterThan(0)
  })

  it('cross-checks team-brain standards against the diff', async () => {
    // strict TS standard is derived from tsconfig.json; `any` in the diff
    // must trigger the standards probe.
    const diff = `diff --git a/src/User.ts b/src/User.ts
index 1..2 100644
--- a/src/User.ts
+++ b/src/User.ts
@@ -1,0 +1,2 @@
+function loadUser(): any {
+  return fetch('/user') as any
+}
`
    const result = await runReview(dir, { gitDiffOutput: diff })
    const file = result.files[0]
    const standard = file.standardFindings.find(f => f.rule === 'standard-strict-types')
    expect(standard).toBeDefined()
    expect(standard!.message).toContain('Project standard')
  })

  it('skips the standards probe when the project has no strict TS standard', async () => {
    const lax = createTempProject({
      'package.json': JSON.stringify({ name: 'lax', version: '1.0.0' }),
    })
    const diff = `diff --git a/src/User.ts b/src/User.ts
index 1..2 100644
--- a/src/User.ts
+++ b/src/User.ts
@@ -1,0 +1,1 @@
+function loadUser(): any {}
`
    const result = await runReview(lax, { gitDiffOutput: diff })
    expect(result.files[0].standardFindings).toEqual([])
    cleanup(lax)
  })

  it('renders an empty-review message for an empty diff', async () => {
    const result = await runReview(dir, { gitDiffOutput: '' })
    expect(result.files).toEqual([])
    expect(result.verdict).toBe('approved')
    expect(renderReview(result)).toContain('No changes to review')
  })

  it('writes report.json and review.md to docs/vectalon/review/', async () => {
    const result = await runReview(dir, { gitDiffOutput: SAMPLE_DIFF })
    const { mdPath, jsonPath } = writeReviewReport(dir, result)
    expect(mdPath).toBe(join(reviewDocsDir(dir), 'review.md'))
    expect(existsSync(mdPath)).toBe(true)
    expect(existsSync(jsonPath)).toBe(true)
    const md = readFileSync(mdPath, 'utf-8')
    expect(md).toContain('PR Review')
    expect(md).toContain('src/PaymentScreen.tsx')
    expect(md).toContain('no-hardcoded-secrets')
    const json = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    expect(json.verdict).toBe('changes-requested')
    expect(json.summary.files).toBe(1)
  })

  it('is deterministic and idempotent across runs', async () => {
    const a = await runReview(dir, { gitDiffOutput: SAMPLE_DIFF })
    const b = await runReview(dir, { gitDiffOutput: SAMPLE_DIFF })
    expect(a.summary).toEqual(b.summary)
    expect(a.files[0].findings).toEqual(b.files[0].findings)
  })
})

describe('review: verdicts', () => {
  const finding = (severity: 'error' | 'warning' | 'info', rule = 'x'): ReviewFileResult['findings'][number] => ({ severity, rule, message: 'm', line: 1 })

  it('changes-requested on error findings', () => {
    expect(verdictOf([{ path: 'a', addedLines: 1, findings: [finding('error')], standardFindings: [] }])).toBe('changes-requested')
  })

  it('needs-attention on warnings or standards findings', () => {
    expect(verdictOf([{ path: 'a', addedLines: 1, findings: [finding('warning')], standardFindings: [] }])).toBe('needs-attention')
    expect(verdictOf([{ path: 'a', addedLines: 1, findings: [], standardFindings: [finding('info', 'standard-x')] }])).toBe('needs-attention')
  })

  it('approved when clean, unless the LLM requests changes', () => {
    expect(verdictOf([{ path: 'a', addedLines: 1, findings: [], standardFindings: [] }])).toBe('approved')
    expect(
      verdictOf([{ path: 'a', addedLines: 1, findings: [], standardFindings: [], llm: { verdict: 'changes-requested', summary: 's', findings: [], source: 'llm' } }])
    ).toBe('changes-requested')
  })
})

describe('review: standards check', () => {
  const standard = (rule: string, status: CodingStandard['status'], detail = 'x'): CodingStandard => ({ rule, status, detail })

  it('enforces strict-typing probes only on adopted standards', () => {
    const adopted = standardsCheck(
      [standard('TypeScript is the source of truth', 'enforced', 'tsconfig.json present with "strict": true')],
      [{ line: 1, text: 'function f(): any {}' }]
    )
    expect(adopted.some(f => f.rule === 'standard-strict-types')).toBe(true)

    const recommended = standardsCheck(
      [standard('Add TypeScript for type safety', 'recommended', 'No TypeScript config detected.')],
      [{ line: 1, text: 'function f(): any {}' }]
    )
    expect(recommended).toEqual([])
  })

  it('emits one file-level test note per file, not per line', () => {
    const notes = standardsCheck(
      [standard('Unit tests: Jest + React Native Testing Library', 'enforced')],
      [
        { line: 1, text: 'export const a = 1' },
        { line: 2, text: 'export const b = 2' },
      ]
    )
    expect(notes.filter(f => f.rule === 'standard-tests').length).toBe(1)
    expect(notes[0].line).toBe(1)
  })
})
