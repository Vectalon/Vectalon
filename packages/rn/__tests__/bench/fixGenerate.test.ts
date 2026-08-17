/**
 * Phase V-5 benchmark — fix seam tests (upgrade-breakage + debugging).
 * Business Source License 1.1 (BSL-1.1)
 */
import { isFixScenario, fixGenerate } from '../../src/bench/fix'
import { runRubric } from '../../src/bench/rubric'
import { shouldRunScenario } from '../../src/bench/runner'
import { loadScenarios, defaultScenariosDir } from '../../src/bench/loader'
import type { BenchScenario } from '../../src/bench/types'

function fixScenario(overrides: Partial<BenchScenario> = {}): BenchScenario {
  return {
    id: 'rn-fix',
    specVersion: 1,
    suite: 'upgrades',
    title: 'Fix the project',
    prompt: 'Fix it.',
    scaffoldable: false,
    fixtures: {
      'android/build.gradle': 'buildscript {\n  compileSdkVersion = 34\n}\n',
      'src/App.tsx': "import { StatusBar } from 'react-native';\nexport function App() { return <StatusBar barStyle=\"dark-content\" />; }\n",
    },
    expect: { files: ['android/build.gradle', 'src/App.tsx'], behaviors: [] },
    correctness: { tests: false, typecheck: false, lint: false },
    axes: ['adherence', 'guardrails'],
    ...overrides,
  }
}

describe('fixGenerate', () => {
  it('isFixScenario is true only when fixEdits are declared', () => {
    expect(isFixScenario(fixScenario())).toBe(false)
    expect(isFixScenario(fixScenario({ fixEdits: [{ file: 'a', find: 'x', replace: 'y' }] }))).toBe(true)
  })

  it('applies every declared edit to the fixtures and emits changed files whole', () => {
    const s = fixScenario({
      fixEdits: [
        { file: 'android/build.gradle', find: 'compileSdkVersion = 34', replace: 'compileSdkVersion = 35' },
        { file: 'src/App.tsx', find: 'barStyle="dark-content"', replace: '' },
      ],
    })
    const files = fixGenerate(s)
    expect(files.map(f => f.path).sort()).toEqual(['android/build.gradle', 'src/App.tsx'])
    expect(files.find(f => f.path === 'android/build.gradle')?.content).toContain('compileSdkVersion = 35')
    expect(files.find(f => f.path === 'android/build.gradle')?.content).not.toContain('compileSdkVersion = 34')
    expect(files.find(f => f.path === 'src/App.tsx')?.content).not.toContain('barStyle')
  })

  it('applies multi-line insertions (replace contains find as its prefix)', () => {
    const s = fixScenario({
      fixtures: { 'android/settings.gradle': "rootProject.name = 'rn-bench-app'\ninclude ':app'\n" },
      fixEdits: [
        {
          file: 'android/settings.gradle',
          find: "rootProject.name = 'rn-bench-app'\ninclude ':app'\n",
          replace: "rootProject.name = 'rn-bench-app'\ninclude ':app'\ninclude ':react-native-vector-icons'\nproject(':react-native-vector-icons').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-vector-icons/android')\n",
        },
      ],
    })
    const files = fixGenerate(s)
    expect(files).toHaveLength(1)
    expect(files[0].content).toContain("include ':react-native-vector-icons'")
  })

  it('throws when an edit targets a file the fixtures do not define', () => {
    const s = fixScenario({ fixEdits: [{ file: 'ios/Podfile', find: 'x', replace: 'y' }] })
    expect(() => fixGenerate(s)).toThrow(/does not define/)
  })

  it('throws when a find is not present in its fixture', () => {
    const s = fixScenario({ fixEdits: [{ file: 'android/build.gradle', find: 'nonexistent', replace: 'y' }] })
    expect(() => fixGenerate(s)).toThrow(/not found/)
  })

  it('returns no files when fixEdits is empty', () => {
    expect(fixGenerate(fixScenario())).toEqual([])
  })

  it('fix-applied rubric check passes on seam output and fails on an unfixed file', () => {
    const s = fixScenario({
      fixEdits: [{ file: 'android/build.gradle', find: 'compileSdkVersion = 34', replace: 'compileSdkVersion = 35' }],
    })
    const fixed = runRubric(fixGenerate(s), { fixEdits: s.fixEdits })
    expect(fixed.overall).toBe(1)
    const unfixed = runRubric([{ path: 'android/build.gradle', content: 'compileSdkVersion = 34\n' }], { fixEdits: s.fixEdits })
    expect(unfixed.overall).toBe(0)
  })
})

describe('fix scenarios in the baseline filter', () => {
  it('fix scenarios run in the default no-model baseline, excluded by an explicit filter', () => {
    const loaded = loadScenarios(defaultScenariosDir())
    const fix = loaded.scenarios.find(s => s.id === 'rn-36-upgrade-compile-sdk')!
    expect(fix.scaffoldable).toBe(false)
    // The default baseline filter (scaffoldable=true + includeRemovals=true + includeFixes=true).
    const filter = { scaffoldable: true, includeRemovals: true, includeFixes: true }
    expect(shouldRunScenario(fix, filter)).toBe(true)
    // Without includeFixes, fix scenarios stay excluded (model-only).
    expect(shouldRunScenario(fix, { scaffoldable: true, includeRemovals: true })).toBe(false)
    // The shipped pack now has 43 scenarios.
    expect(loaded.scenarios.length).toBe(43)
  })
})
