import {
  loadScenarios,
  defaultScenariosDir,
  removalGenerate,
  isRemovalScenario,
  runScenario,
  runBenchmarkFromDir,
  shouldRunScenario,
  runRubric,
} from '../../src/bench'
import type { BenchScenario } from '../../src/bench'

function rn11(): BenchScenario {
  const loaded = loadScenarios(defaultScenariosDir())
  const scenario = loaded.scenarios.find(s => s.id === 'rn-11-remove-dependency-native')
  if (!scenario) throw new Error('rn-11 scenario not found — is the benchmark pack loaded?')
  return scenario
}

describe('removalGenerate — dependency-removal seam', () => {
  it('classifies removal scenarios', () => {
    expect(isRemovalScenario(rn11())).toBe(true)
  })

  it('emits the changed fixture files with the package purged', () => {
    const files = removalGenerate(rn11())
    const byPath = new Map(files.map(f => [f.path, f.content]))

    // Exactly the touched files, in the expected set.
    expect(files.map(f => f.path).sort()).toEqual([
      'android/app/src/main/AndroidManifest.xml',
      'android/settings.gradle',
      'ios/Podfile',
      'package.json',
    ])

    // package.json: appcenter + companion appcenter-analytics gone, rest kept.
    const pkg = JSON.parse(byPath.get('package.json') as string)
    expect(pkg.dependencies).not.toHaveProperty('appcenter')
    expect(pkg.dependencies).not.toHaveProperty('appcenter-analytics')
    expect(pkg.dependencies).toHaveProperty('react')
    expect(pkg.dependencies).toHaveProperty('react-native')

    // Podfile: AppCenter pod gone, React pod kept.
    const podfile = byPath.get('ios/Podfile') as string
    expect(podfile).not.toMatch(/AppCenter/)
    expect(podfile).toMatch(/pod 'React'/)

    // settings.gradle: include + projectDir gone, :app kept.
    const gradle = byPath.get('android/settings.gradle') as string
    expect(gradle).not.toMatch(/appcenter/i)
    expect(gradle).toMatch(/include ':app'/)

    // AndroidManifest: provider gone, manifest + application kept and valid.
    const manifest = byPath.get('android/app/src/main/AndroidManifest.xml') as string
    expect(manifest).not.toMatch(/appcenter/i)
    expect(manifest).toMatch(/<manifest/)
    expect(manifest).toMatch(/<application/)
    expect(manifest).toMatch(/<\/manifest>/)
  })

  it('scores non-null adherence + guardrails + composite (no more n/a)', async () => {
    const scenario = rn11()
    const run = await runScenario(scenario)
    expect(run.generatedFiles.length).toBeGreaterThan(0)
    expect(run.axes.correctness).toBeNull() // disabled for removals by design
    expect(run.axes.adherence).not.toBeNull()
    expect(run.axes.guardrails).not.toBeNull()
    expect(run.composite).not.toBeNull()
    // The emitted files must pass the rubric's no-removed-native-traces check
    // (and the other applicable checks) — the same bar the human reference
    // scores 1.0 on.
    expect(run.axes.adherence).toBeGreaterThanOrEqual(0.9)
  })

  it('passes the no-removed-native-traces rubric check explicitly', () => {
    const files = removalGenerate(rn11())
    const result = runRubric(files, { removedDependencies: ['appcenter'] })
    expect(result.overall).not.toBeNull()
    expect(result.overall).toBeGreaterThanOrEqual(0.9)
    const nativeFile = files.find(f => f.path === 'ios/Podfile')
    expect(nativeFile).toBeDefined()
  })

  it('returns no files when nothing is removed', () => {
    const loaded = loadScenarios(defaultScenariosDir())
    const addScenario = loaded.scenarios.find(s => s.id === 'rn-01-login-screen')
    if (addScenario) expect(removalGenerate(addScenario)).toEqual([])
  })

  it('removes a scoped package (@sentry/react-native) from every native surface', () => {
    const loaded = loadScenarios(defaultScenariosDir())
    const scenario = loaded.scenarios.find(s => s.id === 'rn-34-remove-sentry-sdk')
    expect(scenario).toBeDefined()
    const files = removalGenerate(scenario as BenchScenario)
    const byPath = new Map(files.map(f => [f.path, f.content]))

    expect(files.map(f => f.path).sort()).toEqual([
      'android/app/build.gradle',
      'android/app/src/main/AndroidManifest.xml',
      'android/settings.gradle',
      'ios/Info.plist',
      'ios/Podfile',
      'ios/vectalon.xcodeproj/project.pbxproj',
      'package.json',
    ])

    const pkg = JSON.parse(byPath.get('package.json') as string)
    expect(pkg.dependencies).not.toHaveProperty('@sentry/react-native')
    expect(byPath.get('ios/Podfile')).not.toMatch(/RNSentry|sentry/i)
    expect(byPath.get('ios/Info.plist')).not.toMatch(/sentry/i)
    expect(byPath.get('ios/Info.plist')).toMatch(/CFBundleDisplayName/)
    expect(byPath.get('ios/vectalon.xcodeproj/project.pbxproj')).not.toMatch(/sentry/i)
    expect(byPath.get('android/settings.gradle')).not.toMatch(/sentry|react-native-sentry/i)
    expect(byPath.get('android/app/build.gradle')).not.toMatch(/sentry/i)
    expect(byPath.get('android/app/src/main/AndroidManifest.xml')).not.toMatch(/sentry/i)

    // And it scores like the reference: rubric 1.0, non-null composite.
    const result = runRubric(files, { removedDependencies: ['@sentry/react-native'] })
    expect(result.overall).toBe(1)
  })

  it('drops multi-line nested XML elements for a scoped multi-dep removal (firebase)', async () => {
    const loaded = loadScenarios(defaultScenariosDir())
    const scenario = loaded.scenarios.find(s => s.id === 'rn-35-remove-firebase-sdk')
    expect(scenario).toBeDefined()
    const files = removalGenerate(scenario as BenchScenario)
    const byPath = new Map(files.map(f => [f.path, f.content]))

    // The provider is a multi-line element and the service nests an
    // intent-filter — both must be dropped as whole elements, leaving a
    // well-formed manifest.
    const manifest = byPath.get('android/app/src/main/AndroidManifest.xml') as string
    expect(manifest).not.toMatch(/firebase|provider|service/i)
    expect(manifest).toMatch(/<manifest/)
    expect(manifest).toMatch(/<application android:label="rn-bench-app">\n {2}<\/application>/)
    expect(manifest).toMatch(/<\/manifest>/)

    const pkg = JSON.parse(byPath.get('package.json') as string)
    expect(pkg.dependencies).not.toHaveProperty('@react-native-firebase/app')
    expect(pkg.dependencies).not.toHaveProperty('@react-native-firebase/messaging')
    expect(byPath.get('ios/Podfile')).not.toMatch(/firebase|RNFB/i)
    expect(byPath.get('android/settings.gradle')).not.toMatch(/firebase/i)
    expect(byPath.get('android/app/build.gradle')).not.toMatch(/firebase/i)

    const run = await runScenario(scenario as BenchScenario)
    expect(run.axes.adherence).toBe(1)
    expect(run.composite).not.toBeNull()
  })
})

describe('removal scenarios in the benchmark run', () => {
  it('baseline filter includes removal scenarios alongside scaffoldable ones', () => {
    const scenario = rn11()
    const addScenario = loadScenarios(defaultScenariosDir()).scenarios.find(s => s.id === 'rn-01-login-screen') as BenchScenario
    // The default baseline filter: scaffoldable=true + includeRemovals=true.
    const filter = { scaffoldable: true, includeRemovals: true }
    expect(shouldRunScenario(addScenario, filter)).toBe(true)
    expect(shouldRunScenario(scenario, filter)).toBe(true)
    // Without includeRemovals, removals stay excluded (model-only scenarios).
    expect(shouldRunScenario(scenario, { scaffoldable: true })).toBe(false)
  })

  it('end-to-end baseline run scores rn-11 instead of n/a', async () => {
    const { summary } = await runBenchmarkFromDir({})
    const rn11Run = summary.runs.find(r => r.id === 'rn-11-remove-dependency-native')
    expect(rn11Run).toBeDefined()
    expect(rn11Run?.composite).not.toBeNull()
    expect(rn11Run?.axes.adherence).not.toBeNull()
    expect(rn11Run?.axes.guardrails).not.toBeNull()
    // And the reference side still scores (M6 relative-to-human).
    expect(rn11Run?.reference?.composite).not.toBeNull()
  })
})
