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
  formatScenarioSection,
} from '../../src/bench'
import { parseModelOutput } from '../../src/workflows/phases/implementationPhase'
import { posix } from 'path'
import ts from 'typescript'
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
  it('navigation reference fulfills the scenario contract with resolvable source imports', async () => {
    const scenario = loadScenarios(defaultScenariosDir()).scenarios.find(item => item.id === 'rn-04-typed-navigation')!
    const files = loadReferences(defaultReferencesDir()).references.get(scenario.id)!
    const sources = { ...scenario.fixtures, ...Object.fromEntries(files.map(file => [file.path, file.content])) }
    expect(JSON.parse(scenario.fixtures['package.json']).dependencies['react-native-screens']).toBe('3.31.1')
    for (const path of scenario.expect.files) expect(sources[path]?.trim()).toBeTruthy()
    expect(sources['src/navigation/types.ts']).toBe(scenario.fixtures['src/navigation/types.ts'] + '\n')
    expect(sources['src/navigation/SettingsStack.tsx']).toContain('createNativeStackNavigator<SettingsStackParamList>')
    expect(sources['src/navigation/SettingsStack.tsx']).toContain('NavigationContainer linking={linking}')
    expect(sources['src/screens/SettingsDetailScreen.tsx']).toContain("NativeStackScreenProps<SettingsStackParamList, 'SettingsDetail'>")
    expect(sources['src/navigation/linking.ts']).toContain("SettingsDetail: 'settings/detail/:id'")
    for (const file of files) {
      const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true)
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
        const specifier = statement.moduleSpecifier.text
        if (!specifier.startsWith('.')) continue
        const target = posix.normalize(posix.join(posix.dirname(file.path), specifier))
        expect(['.ts', '.tsx', '/index.ts', '/index.tsx'].some(extension => sources[target + extension] !== undefined)).toBe(true)
      }
    }
    const result = await runScenario(scenario, { generate: () => files })
    expect(result.axes).toEqual({ correctness: null, adherence: 1, guardrails: 1 })
  })

  it('includes only final generated source on explicit opt-in, never reference source', async () => {
    const files = [{ path: 'src/Output.ts', content: 'export const generated = 1' }]
    const scenario = validScenario()
    const options = {
      generate: () => files,
      references: { [scenario.id]: [{ path: 'src/Reference.ts', content: 'private reference answer' }] },
    }
    const normal = await runScenario(scenario, options)
    expect(normal.generatedArtifacts).toBeUndefined()
    expect(JSON.stringify(normal)).not.toContain('export const generated')
    const included = await runScenario(scenario, { ...options, includeGenerated: true })
    expect(included.generatedArtifacts).toEqual(files)
    expect(JSON.stringify(included)).not.toContain('private reference answer')
  })

  it('fails adherence when generated output omits a required file', async () => {
    const run = await runScenario(validScenario({ expect: { files: ['src/Required.tsx'], behaviors: [] } }), {
      generate: async () => [{ path: 'src/Other.ts', content: 'export const value = 1' }],
      rubric: () => 1,
    })
    expect(run.axes.adherence).toBe(0)
    expect(run.correctnessDetails?.join(' ')).toContain('src/Required.tsx')
  })

  it('applies required-file checks to human references too', async () => {
    const scenario = validScenario({ expect: { files: ['src/Required.ts'], behaviors: [] } })
    const run = await runScenario(scenario, {
      generate: () => [{ path: 'src/Required.ts', content: 'export const value = 1' }],
      rubric: () => 1,
      references: { [scenario.id]: [{ path: 'src/Other.ts', content: 'export const value = 1' }] },
    })
    expect(run.axes.adherence).toBe(1)
    expect(run.reference?.axes.adherence).toBe(0)
    expect(run.reference?.missingRequiredFiles).toEqual(['src/Required.ts'])
    expect(run.reference?.relative).toEqual({ correctness: null, adherence: null, guardrails: null, composite: null })
    expect(formatScenarioSection(run)).toContain('Human reference incomplete; relative comparison unavailable.')
  })

  it('labels the deterministic baseline as rubric-only and compares references on the same basis', async () => {
    const scenario = validScenario({ expect: { files: ['src/Required.ts'], behaviors: [] } })
    const run = await runScenario(scenario, {
      rubric: () => 1,
      references: { [scenario.id]: [{ path: 'src/Other.ts', content: 'export const value = 1' }] },
    })
    expect(run.axes.adherence).toBe(1)
    expect(run.reference?.axes.adherence).toBe(1)
    expect(run.correctnessDetails).toContain('Deterministic scaffold baseline: required-file completeness is not evaluated; not model or task-success evidence.')
  })

  it('counts failed model generation as zero rather than excluding it from averages', async () => {
    const summary = await runBenchmark([validScenario()], { generate: async () => [] })
    expect(summary.runs[0].axes).toEqual({ correctness: null, adherence: 0, guardrails: 0 })
    expect(summary.overallComposite).toBe(0)
    expect(summary.overallGuardrails).toBe(0)
  })

  it('does not award live fixture correctness when the model produced no code', async () => {
    const runCommand = jest.fn()
    const run = await runScenario(validScenario(), { generate: async () => [], live: true, runCommand })
    expect(run.axes).toEqual({ correctness: 0, adherence: 0, guardrails: 0 })
    expect(runCommand).not.toHaveBeenCalled()
  })

  it('loads all 43 shipped references without problems', () => {
    const { references, problems } = loadReferences(defaultReferencesDir())
    expect(problems).toEqual([])
    expect(references.size).toBe(43)
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
  it.each(['Local model fallback', 'Wasm model fallback', 'Model fallback'])('rejects %s even when it echoes valid generated-file JSON', async marker => {
    const content = `[${marker}: unavailable]\n${JSON.stringify({ files: [{ path: 'src/Output.ts', content: 'export const value = 1' }] })}`
    expect(parseModelOutput(content)).toBeNull()
    const generate = jest.fn().mockResolvedValue({ content, provider: 'local' })
    const files = await createModelGenerate({ modelRouter: { generate } as unknown as ModelGenerateOptions['modelRouter'] })(validScenario())
    expect(files).toEqual([])
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('repairs missing required output even when other checks pass', async () => {
    const generate = jest.fn()
      .mockResolvedValueOnce({ content: JSON.stringify({ files: [{ path: 'src/Other.ts', content: 'export const value = 1' }] }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ files: [{ path: 'src/Required.ts', content: 'export const value = 1' }] }) })
    const files = await createModelGenerate({ modelRouter: { generate } as unknown as ModelGenerateOptions['modelRouter'] })(
      validScenario({ expect: { files: ['src/Required.ts'], behaviors: [] } })
    )
    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate.mock.calls[1][0].prompt).toContain('Missing required output file: src/Required.ts')
    expect(files[0].path).toBe('src/Required.ts')
  })

  it('does not trade guardrail safety for higher repair adherence', async () => {
    const initial = [{ path: 'src/LoginScreen.tsx', content: 'export function LoginScreen() { return null }' }]
    const generate = jest.fn()
      .mockResolvedValueOnce({ content: JSON.stringify({ files: initial }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ files: [{
        path: 'src/LoginScreen.tsx',
        content: "import { SafeAreaView, AlertIOS } from 'react-native'\nexport function LoginScreen() { AlertIOS.alert('test'); return <SafeAreaView /> }",
      }] }) })
    const files = await createModelGenerate({ modelRouter: { generate } as unknown as ModelGenerateOptions['modelRouter'] })(validScenario())
    expect(generate).toHaveBeenCalledTimes(2)
    expect(files).toEqual(initial)
  })

  it('does not improve guardrail averages by dropping an already generated required file', async () => {
    const initial = [
      { path: 'src/First.ts', content: 'export const first = 1' },
      { path: 'src/Second.ts', content: "import { AlertIOS } from 'react-native'\nexport const second = () => AlertIOS.alert('test')" },
    ]
    const generate = jest.fn()
      .mockResolvedValueOnce({ content: JSON.stringify({ files: initial }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ files: [initial[0]] }) })
    const files = await createModelGenerate({ modelRouter: { generate } as unknown as ModelGenerateOptions['modelRouter'] })(
      validScenario({ expect: { files: ['src/First.ts', 'src/Second.ts', 'src/Third.ts'], behaviors: [] } })
    )
    expect(generate).toHaveBeenCalledTimes(2)
    expect(files).toEqual(initial)
  })

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

  it('regenerates malformed local-model output once without using deterministic files', async () => {
    let calls = 0
    const router = {
      generate: async () => {
        calls++
        return calls === 1
          ? { content: 'not json', provider: 'test' }
          : { content: '{"files":[{"path":"src/Recovered.tsx","content":"export const Recovered = () => null"}]}', provider: 'test' }
      },
    } as unknown as ModelGenerateOptions['modelRouter']

    const files = await createModelGenerate({ modelRouter: router })(validScenario())
    expect(calls).toBe(2)
    expect(files.map(file => file.path)).toEqual(['src/Recovered.tsx'])
  })

  it('feeds failed adherence checks back once and keeps the improved model output', async () => {
    let calls = 0
    const weak = JSON.stringify({
      files: [{ path: 'src/LoginScreen.tsx', content: 'export function LoginScreen() { return null }' }],
    })
    const improved = JSON.stringify({
      files: [{
        path: 'src/LoginScreen.tsx',
        content: "import { SafeAreaView } from 'react-native'\nexport function LoginScreen() { return <SafeAreaView /> }",
      }],
    })
    let repairPrompt = ''
    const router = {
      generate: async (req: { prompt: string }) => {
        calls++
        repairPrompt = req.prompt
        return { content: calls === 1 ? weak : improved, provider: 'test' }
      },
    } as unknown as ModelGenerateOptions['modelRouter']

    const files = await createModelGenerate({ modelRouter: router })(validScenario())
    expect(calls).toBe(2)
    expect(repairPrompt).toContain('Screen does not use SafeAreaView')
    expect(files[0].content).toContain('SafeAreaView')
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

  it('provides general guidance and fixtures without leaking reference repairs into model prompts', async () => {
    let captured = ''
    const requests: string[] = []
    const router = {
      generate: async (req: { context: string; prompt: string }) => {
        captured = req.context
        requests.push(req.context + req.prompt)
        return { content: JSON.stringify({ files: [{ path: 'src/utils/format.ts', content: 'export const format = value => value' }] }), provider: 'test' }
      },
    } as unknown as ModelGenerateOptions['modelRouter']
    const gen = createModelGenerate({ modelRouter: router })
    await gen(validScenario({
      id: 'rn-42-debug-ts-regression',
      fixtures: { 'src/utils/format.ts': 'export const format = value => value' },
      fixEdits: [{ file: 'src/utils/format.ts', find: 'value =>', replace: '(value: string) =>' }],
    }))

    expect(captured).toContain('Acceptance criteria for the final files')
    expect(captured).toContain('loading, empty, and user-visible error states')
    expect(captured).toContain('export const format = value => value')
    expect(requests.join('\n')).not.toContain('(value: string) =>')
    expect(requests.join('\n')).not.toContain('Required repairs (all are mandatory and exact)')
    expect(captured.trimEnd()).toMatch(/Output only one valid JSON object:/)
  })

  it('includes existing project files and deliverables for ordinary generation tasks', async () => {
    const requests: string[] = []
    const router = {
      generate: async (request: { context: string }) => {
        requests.push(request.context)
        return { content: '{}', provider: 'test' }
      },
    } as unknown as ModelGenerateOptions['modelRouter']
    await createModelGenerate({ modelRouter: router })(validScenario({
      fixtures: { 'src/navigation/types.ts': 'export type Routes = { Home: undefined }' },
      expect: { files: ['src/navigation/Stack.tsx'], behaviors: ['typed route params'] },
    }))
    expect(requests[0]).toContain('export type Routes')
    expect(requests[0]).toContain('Required output file: src/navigation/Stack.tsx')
    expect(requests[0]).toContain('Required behavior: typed route params')
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

  it('salvages complete file objects from a corrupt JSON envelope (the rn-43 failure mode)', () => {
    // The 7B emitted both required files as valid objects, then appended a
    // bare Gradle fragment inside the files array — breaking strict JSON.parse
    // AND the template-literal repair. Every complete file object is still a
    // real repair, so the parser must collect them and drop the corrupt tail.
    // Reconstruct the exact rn-43 shape: two complete file objects (content
    // carries real escaped newlines/quotes) followed by a bare Gradle fragment
    // the model appended inside the files array.
    const settingsContent = "rootProject.name = 'rn-bench-app'\ninclude ':app'\n"
    const gradleContent = 'apply plugin: "com.android.application"\n' + 'def enableProguardInReleaseBuilds = false\n'
    const settingsObj = JSON.stringify({ path: 'android/settings.gradle', content: settingsContent })
    const gradleObj = JSON.stringify({ path: 'android/app/build.gradle', content: gradleContent })
    const corrupt = [
      '```json',
      '{',
      '  "files": [',
      '    ' + settingsObj + ',',
      '    ' + gradleObj + ',',
      '    dependencies {',
      "      implementation project(':react-native-vector-icons')",
      '    }',
      '  ]',
      '}',
      '```',
    ].join('\n')
    const parsed = parseModelOutput(corrupt)
    expect(parsed).not.toBeNull()
    expect(parsed?.files.map(f => f.path).sort()).toEqual([
      'android/app/build.gradle',
      'android/settings.gradle',
    ])
  })

  it('salvages backtick-quoted file objects from a corrupt envelope too', () => {
    const corrupt =
      '```json\n{\n  "files": [\n    { "path": "src/screens/HomeScreen.tsx", "content": `import React from \'react\';` },\n    broken-tail {\n  ]\n}\n```'
    const parsed = parseModelOutput(corrupt)
    expect(parsed?.files.map(f => f.path)).toEqual(['src/screens/HomeScreen.tsx'])
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
    // and fix scenarios, and every run has a reference.
    expect(summary.runs.length).toBe(17)
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
    // A model seam runs every scenario, not just the scaffold-able subset.
    expect(summary.runs.length).toBe(43)
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
