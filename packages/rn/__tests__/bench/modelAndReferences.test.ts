import {
  SCENARIO_SPEC_VERSION,
  loadReferences,
  defaultReferencesDir,
  loadScenarios,
  defaultScenariosDir,
  createModelGenerate,
  runScenario,
  runBenchmark,
  runBenchmarkFromDir,
  formatBenchmarkReport,
} from '../../src/bench'
import { parseModelOutput } from '../../src/workflows/phases/implementationPhase'
import type { BenchScenario, ModelGenerateOptions } from '../../src/bench'
import { createTempProject, cleanup } from '../helpers/tmp'

function validScenario(overrides: Partial<BenchScenario> = {}): BenchScenario {
  return {
    id: 'rn-01-login-screen',
    specVersion: SCENARIO_SPEC_VERSION,
    suite: 'forms-security',
    title: 'Login screen with auth API',
    prompt: 'Create a login screen',
    scaffoldable: true,
    fixtures: {},
    expect: { files: [], behaviors: [] },
    correctness: { tests: false, typecheck: false, lint: false },
    axes: ['adherence', 'guardrails'],
    ...overrides,
  }
}

/** Minimal ModelRouter stub: returns the given content from generate. */
function stubRouter(content: string): ModelGenerateOptions['modelRouter'] {
  return {
    generate: async () => ({ content, provider: 'test' }),
    initialize: () => undefined,
    getProviderStatus: async () => ({ local: true, openai: false, anthropic: false }),
    isLocalFallback: () => false,
  } as unknown as ModelGenerateOptions['modelRouter']
}

describe('bench reference solutions (M6)', () => {
  it('loads all 35 shipped references without problems', () => {
    const { references, problems } = loadReferences(defaultReferencesDir())
    expect(problems).toEqual([])
    expect(references.size).toBe(35)
    for (const files of references.values()) {
      expect(files.length).toBeGreaterThan(0)
      for (const file of files) {
        expect(file.path.length).toBeGreaterThan(0)
        expect(typeof file.content).toBe('string')
      }
    }
  })

  it('returns a problem for a missing directory', () => {
    const { references, problems } = loadReferences('/nonexistent/references')
    expect(references.size).toBe(0)
    expect(problems.length).toBeGreaterThan(0)
  })

  it('skips malformed reference files', () => {
    const dir = createTempProject({
      'good.json': JSON.stringify({
        id: 'rn-good',
        files: [{ path: 'src/a.ts', content: 'export const a = 1;' }],
      }),
      'bad.json': JSON.stringify({ id: 'rn-bad' }), // missing files
      'garbage.json': 'not json{{',
    })
    try {
      const { references, problems } = loadReferences(dir)
      expect([...references.keys()]).toEqual(['rn-good'])
      expect(problems.length).toBe(2)
    } finally {
      cleanup(dir)
    }
  })

  it('flags duplicate reference ids', () => {
    const dir = createTempProject({
      'a.json': JSON.stringify({ id: 'rn-dup', files: [{ path: 'src/a.ts', content: 'a' }] }),
      'b.json': JSON.stringify({ id: 'rn-dup', files: [{ path: 'src/b.ts', content: 'b' }] }),
    })
    try {
      const { references, problems } = loadReferences(dir)
      expect([...references.keys()]).toEqual(['rn-dup'])
      expect(problems.length).toBe(1)
      expect(problems[0].problems[0]).toContain('duplicate reference id: rn-dup')
    } finally {
      cleanup(dir)
    }
  })

  it('loads references from nested subdirectories (custom packs)', () => {
    const dir = createTempProject({
      'forms/rn-form.json': JSON.stringify({
        id: 'rn-form',
        files: [{ path: 'src/FormScreen.tsx', content: 'export const FormScreen = () => null;' }],
      }),
      'nav/rn-nav.json': JSON.stringify({
        id: 'rn-nav',
        files: [{ path: 'src/NavScreen.tsx', content: 'export const NavScreen = () => null;' }],
      }),
    })
    try {
      const { references, problems } = loadReferences(dir)
      expect(problems).toEqual([])
      expect([...references.keys()].sort()).toEqual(['rn-form', 'rn-nav'])
    } finally {
      cleanup(dir)
    }
  })
})

describe('bench model generate seam (M5)', () => {
  it('parses model JSON output into files', async () => {
    const gen = createModelGenerate({
      modelRouter: stubRouter(
        JSON.stringify({
          files: [
            { path: 'src/screens/LoginScreen.tsx', content: 'export const LoginScreen = () => null;' },
            { path: 'src/services/auth.ts', content: 'export const login = async () => null;' },
          ],
        })
      ),
    })
    const files = await gen(validScenario())
    expect(files.map(f => f.path)).toEqual(['src/screens/LoginScreen.tsx', 'src/services/auth.ts'])
    expect(files[0].content).toContain('LoginScreen')
  })

  it('returns no files on a fallback response', async () => {
    const gen = createModelGenerate({
      modelRouter: stubRouter('[Local model fallback] no downloaded model'),
    })
    expect(await gen(validScenario())).toEqual([])
  })

  it('returns no files on unparseable output', async () => {
    const gen = createModelGenerate({
      modelRouter: stubRouter('this is not a file payload at all'),
    })
    expect(await gen(validScenario())).toEqual([])
  })

  it('forwards onTextChunk to the model router generate call', async () => {
    const chunks: string[] = []
    const gen = createModelGenerate({
      modelRouter: stubRouter(
        JSON.stringify({
          files: [{ path: 'src/screens/LoginScreen.tsx', content: 'export const LoginScreen = () => null;' }],
        })
      ),
      onTextChunk: chunk => chunks.push(chunk),
    })
    await gen(validScenario())
    // The seam must pass the hook through — the stub router itself never
    // calls it, but the wiring must exist (LocalProvider does the calling).
    expect(chunks).toEqual([])
  })

  it('wires onTextChunk into the ModelRequest when provided', async () => {
    let captured: ((text: string) => void) | undefined
    const router = {
      generate: async (req: { onTextChunk?: (t: string) => void }) => {
        captured = req.onTextChunk
        return { content: '{}', provider: 'test' }
      },
    } as unknown as ModelGenerateOptions['modelRouter']
    const onTextChunk = (): void => {}
    const gen = createModelGenerate({ modelRouter: router, onTextChunk })
    await gen(validScenario())
    expect(captured).toBe(onTextChunk)
  })

  it('routes removal scenarios through a remove-dependency intent with fixtures in context', async () => {
    let captured: { prompt: string; context: string } | undefined
    const router = {
      generate: async (req: { prompt: string; context: string }) => {
        captured = { prompt: req.prompt, context: req.context }
        return { content: '{}', provider: 'test' }
      },
    } as unknown as ModelGenerateOptions['modelRouter']
    const gen = createModelGenerate({ modelRouter: router })
    const scenario = validScenario({
      id: 'rn-11-remove-dependency-native',
      removedDependencies: ['appcenter'],
      fixtures: { 'ios/Podfile': "require_relative '../node_modules/react-native/scripts/react_native_pods'\npod 'AppCenter', :path => '../node_modules/appcenter/ios'\n" },
    })
    await gen(scenario)
    expect(captured?.prompt).toContain('Intent: remove-dependency')
    // The model must see the current fixtures so it can return the changed files.
    expect(captured?.context).toContain('ios/Podfile')
    expect(captured?.context).toContain("pod 'AppCenter'")
  })

  it('parses native removal files (Podfile, xml manifest, pbxproj) from path-fenced output', () => {
    const parsed = parseModelOutput(
      [
        'ios/Podfile',
        '```',
        "require_relative '../node_modules/react-native/scripts/react_native_pods'",
        '',
        "pod 'React', :path => '../node_modules/react-native/ReactCommon'",
        '```',
        'android/app/src/main/AndroidManifest.xml',
        '```',
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
        '  <application android:label="rn-bench-app" />',
        '</manifest>',
        '```',
        'ios/vectalon.xcodeproj/project.pbxproj',
        '```',
        '// !$*UTF8*$!',
        '{',
        '}',
        '```',
      ].join('\n')
    )
    expect(parsed?.files.map(f => f.path).sort()).toEqual([
      'android/app/src/main/AndroidManifest.xml',
      'ios/Podfile',
      'ios/vectalon.xcodeproj/project.pbxproj',
    ])
  })

  it('scores a removal scenario through the model seam end-to-end', async () => {
    const refs = loadReferences(defaultReferencesDir())
    const referenceFiles = refs.references.get('rn-11-remove-dependency-native')
    expect(referenceFiles).toBeDefined()
    const gen = createModelGenerate({ modelRouter: stubRouter(JSON.stringify({ files: referenceFiles })) })
    const scenario = loadScenarios(defaultScenariosDir()).scenarios.find(
      s => s.id === 'rn-11-remove-dependency-native'
    ) as BenchScenario
    const files = await gen(scenario)
    expect(files.length).toBeGreaterThan(0)
    const run = await runScenario(scenario, {
      generate: gen,
      references: { 'rn-11-remove-dependency-native': referenceFiles as NonNullable<typeof referenceFiles> },
    })
    expect(run.axes.adherence).not.toBeNull()
    expect(run.axes.guardrails).not.toBeNull()
    expect(run.composite).not.toBeNull()
  })
})

describe('bench relative-to-human scoring (M6)', () => {
  it('computes reference score and relative ratios in runScenario', async () => {
    const goodScreen = [
      "import { SafeAreaView, StyleSheet } from 'react-native';",
      'export function LoginScreen(): JSX.Element {',
      '  return <SafeAreaView style={styles.root} />;',
      '}',
      'const styles = StyleSheet.create({ root: { flex: 1 } });',
    ].join('\n')

    const run = await runScenario(validScenario(), {
      generate: () => [{ path: 'src/screens/LoginScreen.tsx', content: goodScreen }],
      references: {
        'rn-01-login-screen': [
          { path: 'src/screens/LoginScreen.tsx', content: goodScreen },
          { path: 'src/services/auth.ts', content: 'export const login = async () => null;' },
        ],
      },
    })

    expect(run.reference).toBeDefined()
    expect(run.reference?.composite).not.toBeNull()
    // Same adherence for generated + reference → relative adherence ≈ 1.
    expect(run.reference?.relative.adherence).not.toBeNull()
    expect(run.reference?.relative.composite).not.toBeNull()
  })

  it('omits reference when the scenario has none', async () => {
    const run = await runScenario(validScenario({ id: 'rn-99-missing' }), {
      references: { 'rn-01-login-screen': [{ path: 'a.ts', content: 'export const a = 1;' }] },
    })
    expect(run.reference).toBeUndefined()
  })

  it('aggregates overall reference and relative composites in runBenchmark', async () => {
    const scenarios: BenchScenario[] = [
      validScenario(),
      validScenario({ id: 'rn-02-flatlist-fetch', suite: 'data-flow' }),
    ]
    const files = [{ path: 'src/x.ts', content: 'export const x = 1;' }]
    const summary = await runBenchmark(scenarios, {
      generate: () => files,
      references: {
        'rn-01-login-screen': files,
        'rn-02-flatlist-fetch': files,
      },
    })
    expect(summary.overallReferenceComposite).not.toBeNull()
    expect(summary.overallRelativeComposite).not.toBeNull()
    expect(summary.runs.every(r => r.reference)).toBe(true)
  })

  it('runBenchmarkFromDir loads shipped references and reports relative scores', async () => {
    const { summary, problems, referenceProblems } = await runBenchmarkFromDir({})
    expect(problems).toEqual([])
    expect(referenceProblems).toEqual([])
    // Deterministic baseline runs the scaffold-able subset plus the removal
    // scenarios, and every run has a reference.
    expect(summary.runs.length).toBe(9)
    expect(summary.runs.every(r => r.reference)).toBe(true)
    expect(summary.overallReferenceComposite).not.toBeNull()
    expect(summary.overallRelativeComposite).not.toBeNull()
    const report = formatBenchmarkReport(summary)
    expect(report).toContain('Relative to human reference')
  })

  it('runBenchmarkFromDir builds a model seam when modelRouter is provided', async () => {
    const router = stubRouter(
      JSON.stringify({
        files: [{ path: 'src/screens/LoginScreen.tsx', content: 'export const LoginScreen = () => null;' }],
      })
    )
    const { summary } = await runBenchmarkFromDir({ modelRouter: router })
    // A model seam runs every scenario (33), not just the scaffold-able subset.
    expect(summary.runs.length).toBe(35)
  })

  it('runBenchmarkFromDir runs a custom scenarios dir with custom references', async () => {
    const scenariosDir = createTempProject({
      'my-pack/forms/my-form.json': JSON.stringify({
        id: 'my-form',
        specVersion: SCENARIO_SPEC_VERSION,
        suite: 'my-forms',
        title: 'Custom form eval',
        prompt: 'Create a custom form screen',
        scaffoldable: true,
        fixtures: { 'package.json': '{"name":"app","version":"1.0.0"}' },
        expect: { files: ['src/screens/FormScreen.tsx'], behaviors: [] },
        correctness: { tests: false, typecheck: false, lint: false },
        axes: ['adherence', 'guardrails'],
      }),
    })
    const referencesDir = createTempProject({
      'my-form.json': JSON.stringify({
        id: 'my-form',
        files: [{ path: 'src/screens/FormScreen.tsx', content: 'export const FormScreen = () => null;' }],
      }),
    })
    try {
      const { summary, problems, referenceProblems } = await runBenchmarkFromDir({
        scenariosDir,
        referencesDir,
      })
      expect(problems).toEqual([])
      expect(referenceProblems).toEqual([])
      expect(summary.runs.map(r => r.id)).toEqual(['my-form'])
      expect(summary.runs[0].reference).toBeDefined()
      expect(summary.overallRelativeComposite).not.toBeNull()
    } finally {
      cleanup(scenariosDir)
      cleanup(referencesDir)
    }
  })
})
