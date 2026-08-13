/**
 * Golden feature-workflow replay
 * Business Source License 1.1 (BSL-1.1)
 *
 * The demo (apps/website/demo/login-app + apps/website/demo/cli-app) is a latent
 * golden-test harness: every regression in the feature workflow (resume skipping,
 * template bugs, review hallucination) was found by running it manually. This
 * module turns that manual replay into a deterministic, CI-runnable integration
 * test:
 *
 *   - it scaffolds a fresh project (a plain TypeScript CLI app — no Expo, no
 *     react-native), so the pipeline runs against a realistic project shape;
 *   - it drives the full 14-phase feature-development workflow with a SCRIPTED
 *     model router — every generate() call is answered with rule-clean,
 *     deterministic content, so the workflow either completes green or a product
 *     regression is failing loudly;
 *   - it uses the console (dry-run) adapters, so nothing touches git, the
 *     network, a simulator, or a real test runner.
 *
 * The same replay powers apps/website/demo/cli-app (the committed demo paper
 * trail) via scripts/generate-cli-demo.js, keeping the demo and the CI test in
 * lockstep.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname, relative } from 'path'
import * as ts from 'typescript'
import { ContextEngine } from '../harness/ContextEngine'
import { WorkflowEngine } from '../workflows/WorkflowEngine'
import { featureDevelopmentWorkflow } from '../workflows/definitions/featureDevelopment'
import { createWorkflowState, saveWorkflowState } from '../workflows/WorkflowState'
import { createAdapters } from '../adapters'
import { sanitizeFileName } from '../workflows/phases/helpers'
import { reportError } from '../utils/safe'
import type { WorkflowState, WorkflowContext, TestRunnerAdapter, TestOptions, TestResult } from '../adapters/types'
import type { ModelRouter } from '../model/ModelRouter'
import type { ModelRequest } from '../model/types'

/** The feature prompt the golden replay (and the committed CLI demo) uses. */
export const GOLDEN_FEATURE_PROMPT = 'add greet command'

export type GoldenGenerateKind = 'intent' | 'implementation' | 'review' | 'fix' | 'other'

export interface GoldenGenerateInfo {
  kind: GoldenGenerateKind
  systemPrompt: string
  prompt: string
}

export interface ScriptedModelOptions {
  prompt: string
  /**
   * When true the implementation phase sees the unavailable-model fallback
   * marker and falls back to the deterministic scaffold (the templates that
   * regressed with React 19 / RNTL v14). Default false (scripted JSON files).
   */
  useFallbackScaffold?: boolean
  /**
   * Override the LLM review response per file (e.g. a hallucinated finding).
   * Receives the file name under review; return the review JSON. Default:
   * approved with no findings.
   */
  review?: (fileName: string) => string
  /**
   * Override the LLM fix response per file. Receives the file name being
   * fixed; return the COMPLETE corrected file content. Used by the
   * compile-gate end-to-end test to script a genuinely breaking fix.
   */
  fix?: (fileName: string) => string
  /** Called for every generate() so tests can count calls per kind. */
  onGenerate?: (info: GoldenGenerateInfo) => void
}

/** Extract the file name from a review or fix prompt (# File under review / # File to fix). */
function fileNameFromPrompt(prompt: string): string {
  const m = prompt.match(/# (?:File under review|File to fix)\s*\n([^\n]+)/)
  return m ? m[1].trim() : ''
}

function classify(req: ModelRequest): GoldenGenerateKind {
  const sys = req.systemPrompt || ''
  const prompt = req.prompt || ''
  if (sys.includes('workflow router') || sys.includes('predict the user')) return 'intent'
  if (prompt.includes('# Findings to resolve')) return 'fix'
  if (sys.includes('nit-picking')) return 'review'
  if (sys.includes('Return ONLY a JSON object')) return 'implementation'
  return 'other'
}

/** Deterministic, rule-clean implementation files that satisfy the TDD tests
 * testPhase writes (named exports, matching paths, RNTL-safe rendering). */
export function scriptedImplementationFiles(prompt: string): Array<{ path: string; content: string }> {
  const feature = sanitizeFileName(prompt) || 'Feature'
  const camel = feature.charAt(0).toLowerCase() + feature.slice(1)

  const service = [
    `export class ${feature}Api {`,
    '  async execute(): Promise<string> {',
    "    return 'ok';",
    '  }',
    '}',
    '',
    `export const ${camel}Api = new ${feature}Api();`,
    '',
  ].join('\n')

  const hook = [
    "import { useState, useCallback } from 'react';",
    `import { ${camel}Api } from '../services/${feature}Api';`,
    '',
    `interface Use${feature}State {`,
    '  loading: boolean;',
    '  error: Error | null;',
    '  data: string | null;',
    '}',
    '',
    `export function use${feature}(): Use${feature}State & { run: () => Promise<void> } {`,
    `  const [state, setState] = useState<Use${feature}State>({`,
    '    loading: false,',
    '    error: null,',
    '    data: null,',
    '  });',
    '',
    '  const run = useCallback(async () => {',
    '    setState(prev => ({ ...prev, loading: true, error: null }));',
    '    try {',
    `      const data = await ${camel}Api.execute();`,
    '      setState({ loading: false, error: null, data });',
    '    } catch (err) {',
    '      const error = err instanceof Error ? err : new Error(String(err));',
    '      setState({ loading: false, error, data: null });',
    '    }',
    '  }, []);',
    '',
    '  return { ...state, run };',
    '}',
    '',
  ].join('\n')

  const screen = [
    "import React from 'react';",
    "import { Text, Pressable, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';",
    `import { use${feature} } from '../hooks/use${feature}';`,
    '',
    `export function ${feature}Screen(): React.JSX.Element {`,
    `  const { run, loading, error, data } = use${feature}();`,
    '',
    '  return (',
    '    <SafeAreaView style={styles.container}>',
    `      <Text style={styles.title}>${feature}</Text>`,
    '      {error ? <Text style={styles.error}>{error.message}</Text> : null}',
    '      {data ? <Text>{data}</Text> : null}',
    '      <Pressable',
    '        style={styles.button}',
    '        onPress={run}',
    '        disabled={loading}',
    `        accessibilityLabel="Run ${feature}"`,
    '      >',
    '        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Run</Text>}',
    '      </Pressable>',
    '    </SafeAreaView>',
    '  );',
    '}',
    '',
    'const styles = StyleSheet.create({',
    '  container: { flex: 1, justifyContent: "center", padding: 24 },',
    '  title: { fontSize: 24, fontWeight: "bold", marginBottom: 24 },',
    '  error: { color: "#FF3B30", marginBottom: 12 },',
    '  button: { backgroundColor: "#007AFF", padding: 16, borderRadius: 8, borderCurve: "continuous", alignItems: "center" },',
    '  buttonText: { color: "#fff", fontWeight: "600" },',
    '});',
    '',
  ].join('\n')

  return [
    { path: `src/services/${feature}Api.ts`, content: service },
    { path: `src/hooks/use${feature}.ts`, content: hook },
    { path: `src/screens/${feature}Screen.tsx`, content: screen },
  ]
}

/** Build a ModelRouter stub whose generate() answers deterministically by kind. */
export function createScriptedModelRouter(options: ScriptedModelOptions): ModelRouter {
  const router = {
    generate: async (req: ModelRequest) => {
      const kind = classify(req)
      const info: GoldenGenerateInfo = {
        kind,
        systemPrompt: req.systemPrompt || '',
        prompt: req.prompt || '',
      }
      options.onGenerate?.(info)

      let content = 'ok'
      if (kind === 'intent') {
        content = JSON.stringify({
          intents: [
            {
              type: 'add-feature',
              feature: options.prompt,
              dependency: null,
              target: null,
              area: null,
              confidence: 0.95,
              reasoning: 'golden replay: add feature',
            },
          ],
        })
      } else if (kind === 'implementation') {
        if (options.useFallbackScaffold) {
          content = '[Local model fallback: no downloaded model or inference failed.]'
        } else {
          content = JSON.stringify({
            files: scriptedImplementationFiles(options.prompt),
            notes: 'golden replay: scripted implementation',
          })
        }
      } else if (kind === 'review') {
        content = options.review
          ? options.review(fileNameFromPrompt(req.prompt || ''))
          : JSON.stringify({ verdict: 'approved', summary: 'Clean code (golden replay)', findings: [] })
      } else if (kind === 'fix') {
        // The review approves in the happy path, so a fix is only requested
        // when a test scripts one (e.g. the compile-gate end-to-end test).
        content = options.fix
          ? options.fix(fileNameFromPrompt(req.prompt || ''))
          : '// golden replay: no fix requested'
      }

      return { content, provider: 'golden' }
    },
  } as unknown as ModelRouter
  return router
}

/** The scaffold files for the golden replay — a plain TypeScript CLI app. */
export function cliScaffoldFiles(): Record<string, string> {
  return {
    'package.json': JSON.stringify(
      {
        name: 'cli-app',
        version: '1.0.0',
        private: true,
        description: 'Scratch TypeScript CLI project for the Vectalon daily-loop demo (non-Expo).',
        main: 'dist/index.js',
        bin: { 'cli-app': './dist/index.js' },
        scripts: {
          build: 'tsc',
          start: 'node dist/index.js',
          test: 'jest',
          typecheck: 'tsc --noEmit',
        },
        devDependencies: {
          '@types/jest': '^30.0.0',
          '@types/node': '^26.1.2',
          jest: '^30.4.2',
          'ts-jest': '^29.1.0',
          typescript: '^5.4.0',
        },
      },
      null,
      2
    ) + '\n',
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'commonjs',
          moduleResolution: 'node',
          outDir: 'dist',
          rootDir: 'src',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
        include: ['src/index.ts', 'src/__tests__/index.test.ts'],
      },
      null,
      2
    ) + '\n',
    'jest.config.js': [
      'module.exports = {',
      "  preset: 'ts-jest',",
      "  testEnvironment: 'node',",
      "  testMatch: ['**/src/__tests__/index.test.ts'],",
      '}',
      '',
    ].join('\n'),
    // The scratch project has no react/react-native/node_modules installed, but
    // the workflow generates RN-style modules and the compile-gate test runner
    // typechecks them with the REAL TypeScript compiler. These ambient
    // declarations let that offline compile resolve cleanly and deterministically
    // — module resolution noise is neutralized, real type bugs still surface.
    'src/ambient.d.ts': [
      '/**',
      ' * Ambient declarations for the golden scratch project.',
      ' * The scratch CLI app has no react/react-native runtime installed, but the',
      ' * feature workflow generates RN-style modules. These declarations let the',
      ' * real TypeScript compile (GoldenTypeCheckTestRunner) resolve those imports',
      ' * deterministically offline — module noise is neutralized, real type bugs',
      ' * (e.g. a number assigned to a string) still surface.',
      ' *',
      ' * The committed cli-app demo ships a copy of this file, where it is inert:',
      ' * that tsconfig only includes src/index.ts + src/__tests__/index.test.ts, so',
      ' * these globals never collide with installed @types packages.',
      ' */',
      "declare module 'react' {",
      '  declare function useState<T>(initial: T): [T, (value: T | ((prev: T) => T)) => void]',
      '  declare function useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]): T',
      '  declare function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void',
      '  declare function useMemo<T>(factory: () => T, deps: readonly unknown[]): T',
      '  const React: any',
      '  namespace React {',
      '    namespace JSX {',
      '      type Element = any',
      '    }',
      '  }',
      '  export default React',
      '  export { useState, useCallback, useEffect, useMemo }',
      '}',
      "declare module 'react-native' {",
      '  const Text: any',
      '  const Pressable: any',
      '  const ActivityIndicator: any',
      '  const StyleSheet: any',
      '  const SafeAreaView: any',
      '  const View: any',
      '  const TextInput: any',
      '  export { Text, Pressable, ActivityIndicator, StyleSheet, SafeAreaView, View, TextInput }',
      '}',
      "declare module '@testing-library/react-native' {",
      '  const render: any',
      '  const renderHook: any',
      '  const act: any',
      '  const fireEvent: any',
      '  const waitFor: any',
      '  export { render, renderHook, act, fireEvent, waitFor }',
      '}',
      'declare const describe: any',
      'declare const it: any',
      'declare const test: any',
      'declare const expect: any',
      'declare const beforeEach: any',
      'declare const afterEach: any',
      'declare const jest: any',
      'declare const process: { argv: string[]; exit(code?: number): never }',
      'declare const require: any',
      'declare const module: any',
      '',
    ].join('\n'),
    '.gitignore': ['node_modules/', 'dist/', '.vectalon/', '*.log', 'coverage/', ''].join('\n'),
    'src/index.ts': [
      '#!/usr/bin/env node',
      '',
      'export function main(argv: string[] = process.argv.slice(2)): number {',
      '  const [command, ...rest] = argv',
      '  switch (command) {',
      "    case 'greet':",
      "      console.log(`Hello, ${rest[0] || 'world'}!`)",
      '      return 0',
      "    case 'version':",
      "      console.log('cli-app 1.0.0')",
      '      return 0',
      "    case 'help':",
      "      console.log('Usage: cli-app <greet|version|help> [name]')",
      '      return 0',
      '    default:',
      "      console.log('Unknown command: ' + (command || '(none)'))",
      "      console.log('Usage: cli-app <greet|version|help> [name]')",
      '      return 1',
      '  }',
      '}',
      '',
      'if (require.main === module) {',
      '  process.exit(main())',
      '}',
      '',
    ].join('\n'),
    'src/__tests__/index.test.ts': [
      "import { main } from '../index'",
      '',
      "describe('cli-app', () => {",
      "  it('greets', () => {",
      "    expect(main(['greet', 'Ada'])).toBe(0)",
      '  })',
      '',
      "  it('prints the version', () => {",
      "    expect(main(['version'])).toBe(0)",
      '  })',
      '',
      "  it('rejects unknown commands', () => {",
      "    expect(main(['bogus'])).toBe(1)",
      '  })',
      '})',
      '',
    ].join('\n'),
  }
}

/** Write the golden scaffold into `root` (idempotent). */
export function writeCliScaffold(root: string): void {
  for (const [rel, content] of Object.entries(cliScaffoldFiles())) {
    const full = join(root, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content, 'utf-8')
  }
}

export interface GoldenWorkflowOptions {
  prompt?: string
  useFallbackScaffold?: boolean
  review?: (fileName: string) => string
  fix?: (fileName: string) => string
  /** Reuse a saved state (resume replay). When absent a fresh state is created. */
  state?: WorkflowState
  resume?: boolean
  /** Override the test-runner adapter (e.g. the real typecheck runner). */
  testRunner?: TestRunnerAdapter
  onGenerate?: (info: GoldenGenerateInfo) => void
}

/**
 * Test-runner adapter whose runTypeCheck runs the REAL TypeScript compiler
 * (ts.createProgram) over the scratch project's src/ tree — no node_modules
 * required. Clean code compiles clean; a genuinely breaking fix surfaces a
 * TSxxxx diagnostic the compile gate can count and revert on. Tests and lint
 * stay simulated (deterministic), matching the console adapter's behavior.
 */
export class GoldenTypeCheckTestRunner implements TestRunnerAdapter {
  name = 'golden-typecheck'

  constructor(private root: string) {}

  async runTests(_options?: TestOptions): Promise<TestResult> {
    return { success: true, stdout: 'Mock test run: all tests passed', stderr: '', exitCode: 0, summary: '0 failures (mock)' }
  }

  async runLint(): Promise<TestResult> {
    return { success: true, stdout: 'Mock lint: no issues', stderr: '', exitCode: 0 }
  }

  async runPrettier(): Promise<TestResult> {
    return { success: true, stdout: 'Mock prettier: no issues', stderr: '', exitCode: 0 }
  }

  async runTypeCheck(): Promise<TestResult> {
    try {
      const program = ts.createProgram(this.sourceFiles(), this.compilerOptions())
      const diagnostics = ts.getPreEmitDiagnostics(program)
      if (diagnostics.length === 0) {
        return { success: true, stdout: 'Type check: no errors', stderr: '', exitCode: 0 }
      }
      const lines = diagnostics.map(d => {
        if (!d.file || d.start === undefined) {
          return `error TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`
        }
        const pos = d.file.getLineAndCharacterOfPosition(d.start)
        return `${relative(this.root, d.file.fileName)}(${pos.line + 1},${pos.character + 1}): error TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`
      })
      return { success: false, stdout: lines.join('\n'), stderr: '', exitCode: 1, summary: `${diagnostics.length} type error(s)` }
    } catch (err) {
      reportError(err, 'goldenTypeCheck: compiler crashed')
      return { success: false, stdout: '', stderr: String(err), exitCode: 1, summary: 'typecheck crashed' }
    }
  }

  /** All source + declaration files under src/ (the ambient .d.ts included). */
  private sourceFiles(): string[] {
    const src = join(this.root, 'src')
    if (!existsSync(src)) return []
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        const st = statSync(full)
        if (st.isDirectory()) walk(full)
        else if (/\.tsx?$/.test(entry)) files.push(full)
      }
    }
    walk(src)
    // readdirSync order is not guaranteed across platforms — sort so the
    // program (and its diagnostics) are byte-for-byte reproducible.
    return files.sort()
  }

  /** Scaffold-mirroring compiler options (respects tsconfig, forces noEmit + jsx). */
  private compilerOptions(): ts.CompilerOptions {
    const forced: ts.CompilerOptions = {
      noEmit: true,
      skipLibCheck: true,
      jsx: ts.JsxEmit.React,
      // Module resolution for ambient 'react'/'react-native' declarations needs
      // classic node resolution with esModuleInterop for default imports.
      moduleResolution: ts.ModuleResolutionKind.Node10,
      esModuleInterop: true,
    }
    const configPath = join(this.root, 'tsconfig.json')
    if (!existsSync(configPath)) return forced
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as { compilerOptions?: Record<string, unknown> }
      const parsed = ts.convertCompilerOptionsFromJson(raw.compilerOptions || {}, dirname(configPath))
      return { ...parsed.options, ...forced }
    } catch (err) {
      reportError(err, 'goldenTypeCheck: reading tsconfig')
      return forced
    }
  }
}

/** Shape of the committed docs/vectalon/manifest.json (what `init` would write). */
export interface DemoManifest {
  version: string
  projectName: string
  rnVersion?: string
  tooling: 'expo' | 'rn-cli'
  expoSdkVersion?: string
  initializedAt: number
  modelProvider: string
  autoLearn: boolean
  modelConfig?: { modelName?: string; endpoint?: string }
}

/**
 * Publish the completion proof into the tracked `docs/vectalon/` tree: the
 * workflow-state.json (copied from the gitignored .vectalon/ save) next to the
 * phase documents the engine already wrote, plus the manifest. Returns the
 * written paths. This is what keeps the committed demo self-contained: a fresh
 * clone never runs the workflow, it reads the committed paper trail.
 */
export function publishPaperTrail(root: string, state: WorkflowState, manifest: DemoManifest): string[] {
  const docsDir = join(root, 'docs', 'vectalon', state.workflowId, state.id)
  mkdirSync(docsDir, { recursive: true })
  const written: string[] = []

  const savedPath = join(root, '.vectalon', 'workflows', state.workflowId, `${state.id}.json`)
  const stateJson = existsSync(savedPath) ? readFileSync(savedPath, 'utf-8') : JSON.stringify(state, null, 2)
  const statePath = join(docsDir, 'workflow-state.json')
  writeFileSync(statePath, stateJson)
  written.push(statePath)

  const manifestPath = join(root, 'docs', 'vectalon', 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  written.push(manifestPath)
  return written
}

/**
 * Replay the full 14-phase feature-development workflow against `root`.
 * Returns the final workflow state (saved under .vectalon/workflows/...).
 */
export async function runGoldenFeatureWorkflow(
  root: string,
  options: GoldenWorkflowOptions = {}
): Promise<WorkflowState> {
  const prompt = options.prompt ?? GOLDEN_FEATURE_PROMPT

  const engine = new ContextEngine(root)
  const snapshot = engine.refresh()
  const adapters = createAdapters({ root, dryRun: true })
  if (options.testRunner) adapters.testRunner = options.testRunner
  const modelRouter = createScriptedModelRouter({
    prompt,
    useFallbackScaffold: options.useFallbackScaffold,
    review: options.review,
    fix: options.fix,
    onGenerate: options.onGenerate,
  })
  const state = options.state ?? createWorkflowState('feature-development', prompt)

  const context: WorkflowContext = {
    projectRoot: root,
    snapshot,
    prompt,
    inputs: {},
    outputs: {},
    state,
    adapters,
    modelRouter,
  }

  const result = await new WorkflowEngine().run(
    featureDevelopmentWorkflow,
    context,
    options.resume ? { resume: true } : undefined
  )
  saveWorkflowState(root, result)
  return result
}
