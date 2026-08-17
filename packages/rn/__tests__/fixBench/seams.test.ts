/**
 * vc fix-bench — hermetic tests for the deterministic edit seams and the
 * product targets (≥ 80% diagnosis, ≥ 50% fix). Each test materializes the
 * healthy base, overlays the broken files, runs the REAL runFix pipeline
 * (diagnose → plan → sandbox-apply) with a stubbed command runner, and scores
 * the fix accuracy exactly as `vc fix-bench` does.
 * Business Source License 1.1 (BSL-1.1)
 */
import { runFixScenario, runFixBenchmarkFromDir } from '../../src/fixBench/runner'
import { loadFixBenchScenarios } from '../../src/fixBench/loader'
import type { FixBenchScenario } from '../../src/fixBench/types'

const stubRun = async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })

function scenario(id: string): FixBenchScenario {
  const { scenarios, problems } = loadFixBenchScenarios()
  const found = scenarios.find(s => s.id === id)
  if (!found) throw new Error(`scenario ${id} missing (loader problems: ${problems.map(p => p.problems.join('; ')).join(' | ')})`)
  return found
}

describe('fix-bench deterministic seams', () => {
  it.each([
    ['fx-kotlin-01', 'kotlin-version pin bumped to the RN-required version'],
    ['fx-agp-01', 'AGP classpath bumped to the RN-required version'],
    ['fx-gradle-04', 'minSdkVersion raised to the merger floor'],
    ['fx-gradle-09', 'Gradle daemon heap raised to -Xmx4g'],
    ['fx-upgrade-10', 'AGP-8 namespace added to android/app/build.gradle'],
    ['fx-pod-01', 'missing pod inserted into ios/Podfile'],
    ['fx-metro-02', 'missing package added to package.json dependencies'],
    ['fx-metro-08', 'Metro heap raised via NODE_OPTIONS in the start script'],
    ['fx-hermes-10', 'hermes-engine aligned to the react-native version'],
    ['fx-link-01', 'native module included in android/settings.gradle'],
    ['fx-link-08', 'New Architecture disabled (newArchEnabled=false)'],
    ['fx-ts-01', 'TS2307 import specifier resolved to the on-disk module'],
    ['fx-ts-08', 'TS17004 JSX rewritten to React.createElement'],
    ['fx-ts-02', 'TS2304 unknown identifier filled from the app manifest'],
    ['fx-ts-05', 'TS2739 missing JSX props added from the compiler list'],
    ['fx-ts-10', 'TS7006 bare parameter annotated with : unknown'],
    ['fx-ts-06', 'TS2305 renamed export applied from the tsc "Did you mean" suggestion'],
  ])('%s — %s', async (id) => {
    const run = await runFixScenario(scenario(id), { run: stubRun })
    expect(run.diagnosis).toBe(true)
    expect(run.fix).toBe(true)
    expect(run.note).toBeUndefined()
  })

  it('never scores a fix without a declared fixed-file expectation (honest gate)', async () => {
    // fx-xcode-01 (code signing) declares no mustContain — even if a stray edit
    // touched the Podfile, it must not count as a fix.
    const run = await runFixScenario(scenario('fx-xcode-01'), { run: stubRun })
    expect(run.diagnosis).toBe(true)
    expect(run.fix).toBe(false)
  })

  it('diagnosis-only scenarios (manual fix) never report a fix', async () => {
    const run = await runFixScenario(scenario('fx-gradle-08'), { run: stubRun }) // network failure — manual
    expect(run.diagnosis).toBe(true)
    expect(run.fix).toBe(false)
  })
})

describe('fix-bench product targets (full 100-scenario pack)', () => {
  it(
    'clears 80% diagnosis and 50% fix accuracy with zero false positives',
    async () => {
      const { summary, problems } = await runFixBenchmarkFromDir({ run: stubRun })
      expect(problems).toHaveLength(0)
      expect(summary.total).toBe(100)
      expect(summary.diagnosisAccuracy).toBeGreaterThanOrEqual(0.8)
      expect(summary.fixAccuracy).toBeGreaterThanOrEqual(0.5)
      expect(summary.falsePositiveRate).toBe(0)
      // Sanity: every suite contributes at least one auto-fix.
      for (const suite of summary.suites) {
        expect(suite.fix).toBeGreaterThanOrEqual(1)
      }
      // The typescript suite is 10/10 via the honest seams — unknown-param
      // annotation, missing-prop insertion, the manifest-identifier fill, and
      // the TS2305 rename from tsc's own "Did you mean" suggestion. Lock it
      // in as a regression gate.
      const ts = summary.suites.find(s => s.suite === 'typescript')
      expect(ts).toBeDefined()
      expect(ts!.fix / ts!.total).toBeGreaterThanOrEqual(0.7)
    },
    120_000
  )
})
