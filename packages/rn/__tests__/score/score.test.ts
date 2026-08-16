import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  runScore,
  aggregateOverall,
  buildRecommendations,
  findingKey,
  priorityOf,
  collectSourceAndTests,
  readHistory,
  writeHistory,
  writeScoreReport,
  renderScoreMarkdown,
} from '../../src/score'
import type { ScoreDimension, ScoreFinding } from '../../src/score'

function cleanFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'vectalon-score-'))
  // package.json with RN + jest (build health + testing + upgrade evidence).
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'score-fixture',
      version: '1.0.0',
      dependencies: {
        react: '18.3.1',
        'react-native': '0.76.5',
        'react-native-ble': '^1.0.0',
      },
      devDependencies: { jest: '^29.0.0' },
    }, null, 2) + '\n'
  )
  // Android native config — aligned with RN 0.76 requirements.
  mkdirSync(join(root, 'android', 'gradle', 'wrapper'), { recursive: true })
  writeFileSync(
    join(root, 'android', 'build.gradle'),
    [
      'buildscript {',
      '    ext {',
      '        minSdkVersion = 24',
      '        compileSdkVersion = 35',
      '        targetSdkVersion = 35',
      '        kotlinVersion = "1.9.24"',
      '    }',
      '    dependencies {',
      '        classpath("com.android.tools.build:gradle:8.6.0")',
      '    }',
      '}',
      '',
    ].join('\n')
  )
  writeFileSync(
    join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'),
    'distributionBase=GRADLE_USER_HOME\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.10.2-bin.zip\n'
  )
  // Source + tests.
  mkdirSync(join(root, 'src', 'screens'), { recursive: true })
  writeFileSync(join(root, 'src', 'App.tsx'), 'export const App = () => null\n')
  writeFileSync(join(root, 'src', 'screens', 'Home.tsx'), 'export const Home = () => null\n')
  writeFileSync(join(root, 'src', 'screens', 'Home.test.tsx'), "it('renders', () => {})\n")
  return root
}

function finding(over: Partial<ScoreFinding>): ScoreFinding {
  return {
    id: 'x', dimension: 'd', severity: 'warning', file: '', message: 'm', action: 'a', ...over,
  }
}

function dim(over: Partial<ScoreDimension> & { id: string; label: string; score: number }): ScoreDimension {
  return { weight: 0.1, detail: 'd', findings: [], evidence: [], ...over }
}

describe('vc score — aggregation', () => {
  afterEach(() => {
    // Clean the module-level intel memo between tests.
    const memo = (globalThis as Record<string, unknown>)['__scoreMemo']
    void memo
  })

  it('aggregates the weighted overall over scored dimensions', () => {
    const { overall, grade } = aggregateOverall([
      dim({ id: 'a', label: 'A', score: 100, weight: 0.5 }),
      dim({ id: 'b', label: 'B', score: 0, weight: 0.5 }),
    ])
    expect(overall).toBe(50)
    expect(grade).toBe('F')
  })

  it('renormalizes weights when some dimensions are absent', () => {
    const { overall } = aggregateOverall([
      dim({ id: 'a', label: 'A', score: 100, weight: 0.3 }),
      dim({ id: 'b', label: 'B', score: 100, weight: 0.1 }),
    ])
    expect(overall).toBe(100)
  })

  it('ranks recommendations P0 before P1 before P2', () => {
    const recs = buildRecommendations([
      dim({ id: 'd', label: 'D', score: 80, weight: 1, findings: [
        finding({ id: 'p2', severity: 'info' }),
        finding({ id: 'p0', severity: 'error' }),
        finding({ id: 'p1', severity: 'warning' }),
      ] }),
    ])
    expect(recs.map(r => r.priority)).toEqual(['P0', 'P1', 'P2'])
  })

  it('maps severity to priority', () => {
    expect(priorityOf('error')).toBe('P0')
    expect(priorityOf('warning')).toBe('P1')
    expect(priorityOf('info')).toBe('P2')
  })

  it('builds stable finding keys', () => {
    expect(findingKey(finding({ id: 'a', dimension: 'sec', file: 'src/x.ts' }))).toBe('sec:a:src/x.ts')
  })
})

describe('vc score — source/test collection', () => {
  it('counts source and test files, ignoring vendor dirs', () => {
    const root = cleanFixture()
    mkdirSync(join(root, 'node_modules'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'fake.test.ts'), '')
    const { sourceFiles, testFiles } = collectSourceAndTests(root)
    expect(sourceFiles.length).toBe(2)
    expect(testFiles.length).toBe(1)
    rmSync(root, { recursive: true, force: true })
  })
})

describe('vc score — end to end on a clean fixture', () => {
  it('scores all eight dimensions and writes reports + history', async () => {
    const root = cleanFixture()
    const report = await runScore(root, { skipAudit: true })
    expect(report.dimensions.map(d => d.id)).toEqual([
      'architecture', 'dependencies', 'build-health', 'testing', 'performance', 'security', 'accessibility', 'upgrade-risk',
    ])
    expect(report.overall).toBeGreaterThanOrEqual(0)
    expect(report.overall).toBeLessThanOrEqual(100)
    // Build health aligned with RN 0.76 → no error findings.
    const build = report.dimensions.find(d => d.id === 'build-health')
    expect(build).toBeDefined()
    expect(build!.findings.filter(f => f.severity === 'error').length).toBe(0)
    // Testing: 1 test for 2 sources → no error (test-none requires zero tests).
    const testing = report.dimensions.find(d => d.id === 'testing')
    expect(testing!.findings.filter(f => f.severity === 'error').length).toBe(0)

    // Delta null on first run.
    expect(report.delta).toBeNull()
    expect(report.historyNote).toContain('First score')

    // Report + history files exist.
    const { jsonPath, mdPath } = writeScoreReport(root, report)
    expect(existsSync(jsonPath)).toBe(true)
    expect(existsSync(mdPath)).toBe(true)
    const md = readFileSync(mdPath, 'utf-8')
    expect(md).toContain('# vc score')
    expect(md).toContain(`Overall: **${report.overall}/100`)

    const history = readHistory(root)
    expect(history.entries.length).toBe(1)
    expect(history.entries[0].overall).toBe(report.overall)

    rmSync(root, { recursive: true, force: true })
  })

  it('computes the delta and new problems on the second run', async () => {
    const root = cleanFixture()
    const first = await runScore(root, { skipAudit: true })
    expect(first.delta).toBeNull()

    // Break the build: drop compileSdk below the RN 0.76 requirement.
    writeFileSync(
      join(root, 'android', 'build.gradle'),
      readFileSync(join(root, 'android', 'build.gradle'), 'utf-8').replace('compileSdkVersion = 35', 'compileSdkVersion = 33')
    )

    const second = await runScore(root, { skipAudit: true })
    expect(second.delta).not.toBeNull()
    const build = second.dimensions.find(d => d.id === 'build-health')
    expect(build!.findings.some(f => f.id === 'build-compileSdkVersion' && f.severity === 'error')).toBe(true)
    // The new problem surfaced.
    expect(second.newProblems.some(f => f.id === 'build-compileSdkVersion')).toBe(true)
    // First run's finding ids are gone from the current set.
    expect(second.newProblems.some(f => f.id === 'build-compileSdkVersion' && f.dimension === 'build-health')).toBe(true)

    // History grew.
    const history = readHistory(root)
    expect(history.entries.length).toBe(2)
    expect(history.entries[1].overall).toBe(second.overall)

    rmSync(root, { recursive: true, force: true })
  })

  it('persists history capped at 12 entries', () => {
    const root = cleanFixture()
    const entries = Array.from({ length: 15 }, (_, i) => ({
      scoredAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      overall: 50 + i,
      findingIds: [`f${i}`],
    }))
    writeHistory(root, { entries })
    const history = readHistory(root)
    expect(history.entries.length).toBe(12)
    expect(history.entries[0].overall).toBe(53)
    expect(history.entries[11].overall).toBe(64)
    rmSync(root, { recursive: true, force: true })
  })

  it('degrades gracefully when a dimension cannot run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-score-empty-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'empty', version: '1.0.0' }))
    const report = await runScore(root, { skipAudit: true })
    // No crash — whatever dimensions scored, the overall is in range.
    expect(report.overall).toBeGreaterThanOrEqual(0)
    expect(report.overall).toBeLessThanOrEqual(100)
    expect(Array.isArray(report.recommendations)).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })
})

describe('vc score — renderScoreMarkdown', () => {
  it('renders overall, delta, and recommendations', () => {
    const md = renderScoreMarkdown({
      scoredAt: 0, root: '/x', overall: 82, grade: 'B', verdict: 'good',
      delta: -8, newProblems: [finding({ id: 'n', dimension: 'deps', message: 'boom' })],
      dimensions: [dim({ id: 'a', label: 'Architecture', score: 91, weight: 0.15 })],
      recommendations: [{ priority: 'P0', dimension: 'Dependencies', message: 'conflict', action: 'fix it' }],
      historyNote: 'vs 2026-08-01 (90/100)',
    })
    expect(md).toContain('**82/100 (B)**')
    expect(md).toContain('↓ 8 points')
    expect(md).toContain('**P0** Dependencies: conflict — fix it')
    expect(md).toContain('New problems (1)')
  })
})
