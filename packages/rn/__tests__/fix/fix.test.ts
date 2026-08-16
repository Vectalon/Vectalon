import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  runFix,
  writeFixReport,
  renderFixMarkdown,
} from '../../src/fix'
import {
  diagnose,
  readProjectContext,
  readKotlinRequirement,
  routeIssue,
  requirementsForRn,
} from '../../src/fix/diagnose'
import { planEdits } from '../../src/fix/planner'
import { makeSandbox, applyEdits, diffEdits } from '../../src/fix/apply'
import { unifiedDiff } from '../../src/fix/diff'
import { computeConfidence } from '../../src/fix/confidence'
import type { FixFinding } from '../../src/fix'

function writeFixture(root: string): void {
  mkdirSync(join(root, 'android', 'gradle', 'wrapper'), { recursive: true })
  mkdirSync(join(root, 'android', 'app'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture-app',
      version: '1.0.0',
      dependencies: {
        react: '18.3.1',
        'react-native': '0.76.5',
        'react-native-ble': '^1.0.0',
        '@react-native-community/slider': '^4.0.0',
      },
      devDependencies: { jest: '^29.0.0', typescript: '^5.0.0' },
    }, null, 2) + '\n'
  )
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }, null, 2) + '\n')
  writeFileSync(
    join(root, 'android', 'build.gradle'),
    [
      'buildscript {',
      '    ext {',
      '        minSdkVersion = 24',
      '        compileSdkVersion = 34',
      '        targetSdkVersion = 34',
      '        ndkVersion = "26.1.10909125"',
      '        kotlinVersion = "1.8.0"',
      '    }',
      '    dependencies {',
      '        classpath("com.android.tools.build:gradle:8.1.0")',
      '    }',
      '}',
      '',
    ].join('\n')
  )
  writeFileSync(
    join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'),
    'distributionBase=GRADLE_USER_HOME\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.4-bin.zip\n'
  )
  writeFileSync(join(root, 'android', 'gradle.properties'), 'org.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=512m\n')
}

function tempFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'vc-fix-test-'))
  writeFixture(root)
  return root
}

/** A project already at the RN-required versions — the "nothing wrong" case. */
function writeCleanFixture(root: string): void {
  writeFixture(root)
  const bg = readFileSync(join(root, 'android', 'build.gradle'), 'utf-8')
    .replace('compileSdkVersion = 34', 'compileSdkVersion = 35')
    .replace('kotlinVersion = "1.8.0"', 'kotlinVersion = "1.9.24"')
    .replace('com.android.tools.build:gradle:8.1.0', 'com.android.tools.build:gradle:8.6.0')
  writeFileSync(join(root, 'android', 'build.gradle'), bg)
  writeFileSync(
    join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'),
    'distributionBase=GRADLE_USER_HOME\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.10.2-bin.zip\n'
  )
}

function stubRun(success: boolean) {
  return async () => ({ success, stdout: '', stderr: success ? '' : 'FAILED: build failed with an exception', exitCode: success ? 0 : 1 })
}

describe('vc fix — diagnose', () => {
  it('routes an Android upgrade issue to gradle', () => {
    expect(routeIssue('Android build started failing after upgrading RN')).toBe('gradle')
    expect(routeIssue('iOS pods are failing to install')).toBe('xcode')
    expect(routeIssue('Metro cannot resolve module foo')).toBe('metro')
  })

  it('parses "requires Kotlin >= X" from the issue text', () => {
    expect(readKotlinRequirement('react-native-x requires Kotlin >= 1.9.24')).toBe('1.9.24')
    expect(readKotlinRequirement('Kotlin 2.0 or higher is required')).toBeNull()
  })

  it('knows the RN-required build versions', () => {
    const req = requirementsForRn(0.76)
    expect(req).toEqual({ compileSdk: 35, kotlin: '1.9.24', gradle: '8.10.2', agp: '8.6.0', ndk: '26.1.10909125' })
    expect(requirementsForRn(0.71)?.compileSdk).toBe(33)
  })

  it('reads the project native context', () => {
    const root = tempFixture()
    try {
      const ctx = readProjectContext(root)
      expect(ctx.flavor).toBe('rn-cli')
      expect(ctx.rnVersion).toBe(0.76)
      expect(ctx.compileSdk).toBe(34)
      expect(ctx.kotlinVersion).toBe('1.8.0')
      expect(ctx.agpVersion).toBe('8.1.0')
      expect(ctx.gradleVersion).toBe('8.4')
      expect(ctx.nativeModules).toContain('react-native-ble')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('finds the Kotlin root cause for the killer-workflow issue', () => {
    const root = tempFixture()
    try {
      const { kind, findings } = diagnose(root, { issue: 'Android build started failing after upgrading RN — react-native-x requires Kotlin >= 1.9.24' })
      expect(kind).toBe('gradle')
      const kotlin = findings.find(f => f.id === 'kotlin-version')
      expect(kotlin).toBeDefined()
      expect(kotlin!.rootCause).toBe(true)
      expect(kotlin!.severity).toBe('error')
      expect(kotlin!.evidence[0].file).toBe('android/build.gradle')
      expect(kotlin!.message).toContain('1.9.24')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('classifies a Gradle log root cause', () => {
    const root = tempFixture()
    try {
      const logPath = join(root, 'build.log')
      writeFileSync(logPath, 'FAILURE: Build failed with an exception.\nMinimum supported Gradle version is 8.10.2. Current version is 8.4.\n')
      const { findings } = diagnose(root, { log: logPath })
      const agp = findings.find(f => f.id === 'agp-version')
      expect(agp).toBeDefined()
      expect(agp!.rootCause).toBe(true)
      expect(agp!.evidence[0].line).toBe(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('vc fix — planner', () => {
  it('emits exact literal edits for every auto-fixable finding', () => {
    const root = tempFixture()
    try {
      const ctx = readProjectContext(root)
      const { findings } = diagnose(root, { issue: 'Android build started failing after upgrading RN — react-native-x requires Kotlin >= 1.9.24' })
      const edits = planEdits(root, findings, ctx)

      expect(edits.some(e => e.summary.includes('Raise compileSdkVersion 34 → 35'))).toBe(true)
      expect(edits.some(e => e.summary.includes('Upgrade Kotlin 1.8.0 → 1.9.24'))).toBe(true)
      expect(edits.some(e => e.summary.includes('Bump AGP 8.1.0 → 8.6.0'))).toBe(true)
      expect(edits.some(e => e.summary.includes('Bump Gradle wrapper 8.4 → 8.10.2'))).toBe(true)

      // Every edit's `from` exists verbatim in the file (never a guess).
      for (const e of edits) {
        const content = readFileSync(join(root, e.file), 'utf-8')
        expect(content).toContain(e.from)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('raises the Gradle daemon heap for an OOM root cause', () => {
    const root = tempFixture()
    try {
      const logPath = join(root, 'build.log')
      writeFileSync(logPath, 'FAILURE: Build failed with an exception.\nOutOfMemoryError: Java heap space\n')
      const { findings } = diagnose(root, { log: logPath })
      const edits = planEdits(root, findings)
      expect(edits.some(e => e.summary.includes('daemon heap'))).toBe(true)
      expect(edits.find(e => e.file === 'android/gradle.properties')?.to).toContain('Xmx4g')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('vc fix — sandbox apply + diff', () => {
  it('applies edits in the sandbox copy, leaves the real tree untouched, and produces a diff', () => {
    const root = tempFixture()
    try {
      const ctx = readProjectContext(root)
      const { findings } = diagnose(root, { issue: 'Android build started failing after upgrading RN — react-native-x requires Kotlin >= 1.9.24' })
      const edits = planEdits(root, findings, ctx)

      const original = readFileSync(join(root, 'android', 'build.gradle'), 'utf-8')
      const sandbox = makeSandbox(root)
      try {
        const { applied } = applyEdits(sandbox, edits)
        expect(applied.length).toBeGreaterThanOrEqual(4)
        // Real tree untouched.
        expect(readFileSync(join(root, 'android', 'build.gradle'), 'utf-8')).toBe(original)
        // Sandbox has the new values.
        const newContent = readFileSync(join(sandbox, 'android', 'build.gradle'), 'utf-8')
        expect(newContent).toContain('compileSdkVersion = 35')
        expect(newContent).toContain('kotlinVersion = "1.9.24"')
        expect(newContent).toContain('com.android.tools.build:gradle:8.6.0')

        const diff = diffEdits(root, sandbox, applied)
        expect(diff).toContain('--- a/android/build.gradle')
        expect(diff).toMatch(/\+\s*compileSdkVersion = 35/)
        expect(diff).toMatch(/-\s*compileSdkVersion = 34/)
      } finally {
        rmSync(sandbox, { recursive: true, force: true })
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('skips an edit whose anchor is gone (no silent corruption)', () => {
    const root = tempFixture()
    try {
      const fake: FixFinding = {
        id: 'compile-sdk-version',
        severity: 'error',
        rootCause: true,
        title: 't',
        message: 't',
        recommendedFix: 'Raise it',
        evidence: [],
        impact: [],
        applied: 'no-change',
        confidence: 80,
        edit: { file: 'android/build.gradle', op: 'replace', from: 'compileSdkVersion = 99', to: 'compileSdkVersion = 35', summary: 'bump' },
      }
      const sandbox = makeSandbox(root)
      try {
        const { applied, skipped } = applyEdits(sandbox, [fake.edit!])
        expect(applied).toHaveLength(0)
        expect(skipped).toHaveLength(1)
      } finally {
        rmSync(sandbox, { recursive: true, force: true })
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('vc fix — runFix end-to-end', () => {
  it('runs the full loop: root cause → edits → verification → confidence, real tree untouched', async () => {
    const root = tempFixture()
    try {
      const report = await runFix(root, {
        issue: 'Android build started failing after upgrading RN — react-native-x requires Kotlin >= 1.9.24',
        run: stubRun(true),
      })

      expect(report.verdict).toBe('changes-requested')
      expect(report.appliedToTree).toBe(false)
      const rootFinding = report.findings.find(f => f.rootCause)
      expect(rootFinding?.id).toBe('kotlin-version')
      expect(rootFinding?.message).toContain('1.9.24')
      expect(report.findings.some(f => f.applied === 'applied')).toBe(true)
      // Impact: the native modules.
      expect(rootFinding!.impact.length).toBeGreaterThan(0)
      // Verification all passed (stubbed).
      expect(report.verification.filter(v => v.status === 'pass').length).toBe(2) // TypeScript + Jest
      expect(report.verification.find(v => v.name === 'Gradle')?.status).toBe('skipped')
      expect(report.confidence).toBeGreaterThanOrEqual(90)
      expect(report.diff).toMatch(/\+\s*compileSdkVersion = 35/)
      // The real tree is byte-identical (sandbox only).
      expect(readFileSync(join(root, 'android', 'build.gradle'), 'utf-8')).toContain('compileSdkVersion = 34')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('lowers confidence when verification fails', async () => {
    const root = tempFixture()
    try {
      const report = await runFix(root, {
        issue: 'Android build started failing after upgrading RN — react-native-x requires Kotlin >= 1.9.24',
        run: stubRun(false),
      })
      expect(report.verification.find(v => v.name === 'TypeScript')?.status).toBe('fail')
      expect(report.confidence).toBeLessThan(90)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('writes report.json + report.md', async () => {
    const root = tempFixture()
    try {
      const report = await runFix(root, { issue: 'android kotlin too old', run: stubRun(true) })
      const { jsonPath, mdPath } = writeFixReport(root, report)
      expect(existsSync(jsonPath)).toBe(true)
      expect(existsSync(mdPath)).toBe(true)
      expect(readFileSync(mdPath, 'utf-8')).toContain('Root cause')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reports approved + no diff when nothing is wrong', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vc-fix-clean-'))
    writeCleanFixture(root)
    try {
      const report = await runFix(root, { issue: 'all good', run: stubRun(true) })
      expect(report.verdict).toBe('approved')
      expect(report.diff).toBe('')
      expect(report.confidence).toBe(100)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('vc fix — diff + confidence helpers', () => {
  it('produces a correct unified diff', () => {
    const d = unifiedDiff('a.txt', 'line1\nold\nline3\n', 'line1\nnew\nline3\n')
    expect(d).toContain('--- a/a.txt')
    expect(d).toContain('-old')
    expect(d).toContain('+new')
  })

  it('computes confidence from findings + verification', () => {
    const finding: FixFinding = {
      id: 'x', severity: 'error', rootCause: true, title: 't', message: 't',
      recommendedFix: 'fix', evidence: [{ file: 'android/build.gradle', line: 42, detail: 'd' }],
      impact: [], applied: 'applied', confidence: 90,
    }
    expect(computeConfidence([finding], [{ name: 'TypeScript', status: 'pass', detail: '' }])).toBeGreaterThan(90)
    expect(computeConfidence([finding], [{ name: 'TypeScript', status: 'fail', detail: '' }])).toBeLessThan(90)
  })

  it('renders markdown with the structured verdict sections', () => {
    const md = renderFixMarkdown({
      scannedAt: 0, root: '/tmp/x', issue: 'android kotlin too old', kind: 'gradle',
      verdict: 'changes-requested', confidence: 92, appliedToTree: false,
      findings: [{
        id: 'kotlin-version', severity: 'error', rootCause: true, title: 'Kotlin too old',
        message: 'Kotlin 1.8.0 is below 1.9.24', recommendedFix: 'Upgrade Kotlin to 1.9.24',
        evidence: [{ file: 'android/build.gradle', line: 8, detail: 'kotlinVersion' }],
        impact: ['react-native-ble'], applied: 'applied', confidence: 92,
        edit: { file: 'android/build.gradle', op: 'replace', from: 'x', to: 'y', summary: 'Upgrade Kotlin' },
      }],
      edits: [], diff: '--- a/x\n+++ b/x\n', verification: [{ name: 'TypeScript', status: 'pass', detail: 'clean' }],
    })
    expect(md).toContain('## Root cause')
    expect(md).toContain('## Applied')
    expect(md).toContain('## Verification')
    expect(md).toContain('## Diff')
  })
})
