import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import type { WorkflowPhase, WorkflowArtifact, TestRunnerAdapter, TestResult } from '../../adapters/types'
import { isSafeProjectPath, isSelfPackageRepo, writeProjectFile, GENERATED_OUTPUT_DIR } from './fileOutput'
import type { ContextSnapshot } from '../../harness/types'
import type { ModelRouter } from '../../model/ModelRouter'
import { removeUnusedImportsFromProject, findSourceFiles } from '../../utils/unusedImports'
import { reportPathChange } from '../../utils/fileDiff'
import { detectConventions, phaseResult, sanitizeFileName, fileExtension, jsxExtension } from './helpers'
import { getIntent, intentTitle, isRemoveDependency, isRefactor, isFix, type WorkflowIntent } from './intent'
import { runGuardrails, formatGuardrailResult, GuardrailResult, PolicyEngine } from '../../guardrails'

interface DependencyMatch {
  name: string
  version: string
  isDev: boolean
}

interface GeneratedFile {
  path: string
  content: string
}

interface GeneratedImplementation {
  files: GeneratedFile[]
  notes?: string
}

function checkGuardrails(
  files: GeneratedFile[],
  conventions: ReturnType<typeof detectConventions>,
  projectRoot?: string
): GuardrailResult[] {
  const policy = projectRoot ? new PolicyEngine(projectRoot) : null
  return files.map(file => {
    const options = {
      filePath: file.path,
      content: file.content,
      conventions: {
        hasTypeScript: conventions.hasTypeScript,
        usesStyleSheet: conventions.usesStyleSheet,
        hasNavigation: conventions.hasNavigation,
      },
    }
    return policy ? policy.runPolicy(options) : runGuardrails(options)
  })
}

function formatGuardrailSummary(results: GuardrailResult[]): string {
  const errors = results.flatMap(r => r.findings.filter(f => !f.passed && f.severity === 'error'))
  const warnings = results.flatMap(r => r.findings.filter(f => !f.passed && f.severity === 'warning'))
  const infos = results.flatMap(r => r.findings.filter(f => !f.passed && f.severity === 'info'))

  const lines = ['## Guardrail summary', '']
  if (errors.length === 0 && warnings.length === 0 && infos.length === 0) {
    lines.push('✅ All guardrails passed for every generated file.')
  } else {
    lines.push(`- ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info note(s)`)
    lines.push('')
    for (const result of results) {
      if (result.findings.some(f => !f.passed)) {
        lines.push(formatGuardrailResult(result))
        lines.push('')
      }
    }
  }
  return lines.join('\n')
}


function findDependency(snapshot: ContextSnapshot | null, dependency: string): DependencyMatch[] {
  if (!snapshot) return []
  const matches: DependencyMatch[] = []
  const deps = snapshot.project.dependencies
  const devDeps = snapshot.project.devDependencies

  for (const [name, version] of Object.entries(deps)) {
    if (name.toLowerCase().includes(dependency.toLowerCase())) {
      matches.push({ name, version, isDev: false })
    }
  }
  for (const [name, version] of Object.entries(devDeps)) {
    if (name.toLowerCase().includes(dependency.toLowerCase())) {
      matches.push({ name, version, isDev: true })
    }
  }

  return matches
}

function findUsages(snapshot: ContextSnapshot | null, dependency: string): { file: string; imports: string[] }[] {
  if (!snapshot) return []
  const usages: { file: string; imports: string[] }[] = []

  for (const component of snapshot.components) {
    const matching = component.imports.filter(imp =>
      imp.toLowerCase().includes(dependency.toLowerCase())
    )
    if (matching.length > 0) {
      usages.push({ file: component.filePath, imports: matching })
    }
  }

  return usages
}

function isFallbackResponse(content: string): boolean {
  return content.includes('[Local model fallback') || content.includes('no downloaded model')
}

function selectFixCheck(
  area: string,
  runner: TestRunnerAdapter
): { name: string; run: () => Promise<TestResult> } | null {
  const candidates: Array<{ name: string; run: (() => Promise<TestResult>) | undefined }> = []
  if (area === 'lint') candidates.push({ name: 'Lint', run: runner.runLint })
  if (area === 'types') candidates.push({ name: 'Type check', run: runner.runTypeCheck })
  if (area === 'tests') candidates.push({ name: 'Tests', run: runner.runTests })
  if (candidates.length === 0) {
    candidates.push(
      { name: 'Lint', run: runner.runLint },
      { name: 'Type check', run: runner.runTypeCheck },
      { name: 'Tests', run: runner.runTests }
    )
  }
  const pick = candidates.find(c => typeof c.run === 'function')
  return pick ? { name: pick.name, run: () => (pick.run as () => Promise<TestResult>)() } : null
}

function extractJsonFiles(content: string): GeneratedImplementation | null {
  const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const jsonText = jsonBlockMatch ? jsonBlockMatch[1].trim() : content.trim()

  try {
    const parsed = JSON.parse(jsonText) as GeneratedImplementation
    if (Array.isArray(parsed.files)) {
      const files = parsed.files
        .map(f => ({ path: f.path, content: f.content }))
        .filter(f => isSafeProjectPath(f.path) && typeof f.content === 'string')
      if (files.length > 0) {
        return { files, notes: parsed.notes }
      }
    }
  } catch {
    // Ignore parse error
  }

  return null
}

function normalizeMarkdownPath(raw: string): string {
  return raw
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^File:\s*/i, '')
    .replace(/^\d+[.)]\s*/, '')
    .trim()
}

function extractMarkdownSectionFiles(content: string): GeneratedFile[] | null {
  const files: GeneratedFile[] = []
  const sectionRe = /^#{1,6}\s*`?([^`\n]+?)`?\s*\n+```[a-zA-Z]*\n([\s\S]*?)```/gm
  let match: RegExpExecArray | null
  while ((match = sectionRe.exec(content)) !== null) {
    const path = normalizeMarkdownPath(match[1])
    if (isSafeProjectPath(path)) {
      files.push({ path, content: match[2] })
    }
  }
  return files.length > 0 ? files : null
}

function extractPathFenceFiles(content: string): GeneratedFile[] | null {
  const files: GeneratedFile[] = []
  const pathRe = /^([A-Za-z0-9_@./-]+\.(?:tsx?|jsx?|ts|js|json|css|scss|swift|kt|java|gradle|plist|podspec|yaml|yml|md))\s*\n+```[a-zA-Z]*\n([\s\S]*?)```/gm
  let match: RegExpExecArray | null
  while ((match = pathRe.exec(content)) !== null) {
    const path = match[1]
    if (isSafeProjectPath(path)) {
      files.push({ path, content: match[2] })
    }
  }
  return files.length > 0 ? files : null
}

export function parseModelOutput(content: string): GeneratedImplementation | null {
  const trimmed = content.trim()
  if (!trimmed) return null

  const jsonResult = extractJsonFiles(content)
  if (jsonResult) return jsonResult

  const markdownFiles = extractMarkdownSectionFiles(content)
  if (markdownFiles) return { files: markdownFiles }

  const pathFiles = extractPathFenceFiles(content)
  if (pathFiles) return { files: pathFiles }

  return null
}

export function buildImplementationPrompt(ctx: {
  snapshot: ContextSnapshot | null
  prompt: string
  intent: WorkflowIntent
  tests?: string
}): { systemPrompt: string; prompt: string } {
  const conventions = detectConventions(ctx.snapshot)
  const featureName = sanitizeFileName(ctx.prompt) || 'Feature'

  const systemPrompt = [
    'You are a senior React Native engineer.',
    'Generate production-ready, minimal React Native code for the user request.',
    'Do not add TODOs or placeholders. Use real, runnable code.',
    'Return ONLY a JSON object with no markdown outside the JSON block.',
    'The JSON must have this exact shape:',
    '{"files":[{"path":"src/...","content":"..."}],"notes":"..."}',
    'Each file must be a complete, self-contained source file.',
    '',
    'CRITICAL: Tests have already been written for this feature (TDD).',
    'Your implementation MUST satisfy the existing tests.',
    'Read every test file carefully and export exactly the symbols, names, and',
    'signatures the tests import and assert on. If a test imports a named export',
    'from a specific module path, you MUST provide that module at that path with',
    'that exact named export.',
    'Ensure all exported functions, hooks, and components are testable:',
    '- Accept props/params instead of hardcoded values where possible.',
    '- Return predictable outputs for given inputs.',
    '- Avoid side effects in pure functions.',
    '- Make async operations mockable.',
    '',
    'Best practices that must be followed:',
    '- Use StyleSheet.create(...) for all styles; no inline style objects.',
    '- Use named exports for components and hooks.',
    '- Add accessibilityLabel or accessible={false} to TouchableOpacity, Pressable, and Button elements.',
    '- Use SafeAreaView or react-native-safe-area-context for full screens.',
    '- Use try/catch in async functions or propagate errors explicitly.',
    '- No console.log or debug statements in production code.',
    '- No hardcoded API URLs or secrets.',
    '- No explicit any types; use specific types or unknown.',
    '- Use Platform.OS or Platform.select for platform-specific code.',
    '- Virtualize long lists with FlatList or SectionList instead of .map over arrays in JSX.',
    '- Use const and let; never var.',
    '- Use === and !== instead of == and !=.',
    '- Screens with TextInput must use KeyboardAvoidingView on iOS.',
    '- Do not use deprecated APIs: ListView, AsyncStorage from react-native, AlertIOS, StatusBarIOS, Navigator.',
  ].join('\n')

  const testsSection = ctx.tests
    ? ['', '## Existing tests (TDD contract) — your code MUST make these pass', '', ctx.tests, ''].join('\n')
    : ''

  const projectContext = [
    'Project conventions:',
    `- TypeScript: ${conventions.hasTypeScript ? 'yes' : 'no'}`,
    `- React Navigation: ${conventions.hasNavigation ? 'yes' : 'no'}`,
    `- StyleSheet: ${conventions.usesStyleSheet ? 'yes' : 'no'}`,
    `- Existing components: ${ctx.snapshot?.components.map(c => c.name).join(', ') || 'none'}`,
    '',
    `Request: ${ctx.prompt}`,
    '',
    `Intent: ${ctx.intent.type}`,
    '',
    testsSection,
    'Generate the files for this request.',
    `Use "${featureName}" as the base name for the generated modules.`,
  ].join('\n')

  return { systemPrompt, prompt: projectContext }
}

interface ModelImplementationResult {
  implementation: { output: string; artifacts: WorkflowArtifact[] } | null
  rawOutput?: string
}

async function generateModelImplementation(
  modelRouter: ModelRouter,
  projectRoot: string | undefined,
  ctx: {
    snapshot: ContextSnapshot | null
    prompt: string
    intent: WorkflowIntent
    tests?: string
  }
): Promise<ModelImplementationResult> {
  const promptCtx = buildImplementationPrompt(ctx)
  const response = await modelRouter.generate({
    systemPrompt: promptCtx.systemPrompt,
    prompt: promptCtx.prompt,
    context: ctx.snapshot
      ? `Project: ${ctx.snapshot.project.name}, React Native ${ctx.snapshot.project.reactNativeVersion || 'unknown'}`
      : undefined,
    maxTokens: 4096,
    temperature: 0.2,
  })

  if (isFallbackResponse(response.content)) {
    return { implementation: null }
  }

  const parsed = parseModelOutput(response.content)
  if (!parsed || parsed.files.length === 0) {
    return { implementation: null, rawOutput: response.content }
  }

  const conventions = detectConventions(ctx.snapshot)
  const guardrailResults = checkGuardrails(parsed.files, conventions, projectRoot)
  const writtenFiles: string[] = []
  const redirected = projectRoot ? isSelfPackageRepo(projectRoot) : false
  if (projectRoot) {
    for (const file of parsed.files) {
      const writtenPath = writeProjectFile(projectRoot, file.path, file.content)
      if (writtenPath) {
        writtenFiles.push(writtenPath)
      }
    }
  }

  const fileSections = parsed.files.map(f => [
    `### ${f.path}`,
    '```typescript',
    f.content,
    '```',
  ].join('\n'))

  const redirectNote = redirected
    ? [`> ⚠️ Generated into ${GENERATED_OUTPUT_DIR}/ (this project is the rn-vectalon package itself; its src/ bundle is protected).`, '']
    : []

  const output = [
    '## Generated files',
    '',
    ...(parsed.notes ? [parsed.notes, ''] : []),
    ...(writtenFiles.length > 0 ? ['Files written to disk:', ...writtenFiles.map(f => `- \`${f}\``), ''] : []),
    ...redirectNote,
    ...fileSections,
    '',
    formatGuardrailSummary(guardrailResults),
  ].join('\n')

  return {
    implementation: {
      output,
      artifacts: parsed.files.map(f => ({
        type: 'engineering',
        title: f.path,
        content: f.content,
        path: f.path,
      })),
    },
  }
}

async function generateFixImplementation(
  modelRouter: ModelRouter,
  projectRoot: string | undefined,
  ctx: {
    snapshot: ContextSnapshot | null
    prompt: string
    area: string
    testRunner: TestRunnerAdapter
  }
): Promise<{ output: string; artifacts: WorkflowArtifact[] }> {
  const conventions = detectConventions(ctx.snapshot)
  const check = selectFixCheck(ctx.area, ctx.testRunner)

  if (!check) {
    const output = [
      `## Fix ${ctx.area} issues`,
      '',
      'No suitable check (lint / type check / tests) is available on the configured test runner,',
      'so the violations could not be captured. Enable a real test runner (e.g. `local`) to',
      'diagnose and auto-fix the issues. No files were created or modified.',
    ].join('\n')
    return {
      output,
      artifacts: [{ type: 'engineering', title: `Fix ${ctx.area} issues`, content: output }],
    }
  }

  // 1. Diagnose — run the relevant check and capture the violations.
  const rawResult = await check.run()
  if (!rawResult || typeof rawResult.success !== 'boolean') {
    const output = [
      `## Fix ${ctx.area} issues`,
      '',
      `The ${check.name} check could not be executed, so violations could not be captured.`,
      'No files were created or modified.',
    ].join('\n')
    return {
      output,
      artifacts: [{ type: 'engineering', title: `Fix ${ctx.area} issues`, content: output }],
    }
  }

  if (rawResult.success) {
    const output = [
      `## Fix ${ctx.area} issues`,
      '',
      `✅ ${check.name} passes cleanly — no issues found. Nothing to fix.`,
    ].join('\n')
    return {
      output,
      artifacts: [{ type: 'engineering', title: `Fix ${ctx.area} issues`, content: output }],
    }
  }

  const diagnostics = [rawResult.stdout, rawResult.stderr]
    .filter(Boolean)
    .map(s => s.trim())
    .join('\n')
    .slice(0, 12000)

  // 2. Repair — ask the model to fix the EXISTING files. Never create new ones.
  const systemPrompt = [
    'You are a senior React Native engineer fixing violations reported by a project check.',
    'Repair the EXISTING files that contain violations. Do NOT create new screens, hooks, services, or tests.',
    'Preserve the public API, exports, and behavior of every file you change.',
    'Return ONLY a JSON object with no markdown outside the JSON block:',
    '{"files":[{"path":"src/...","content":"FULL new content of each changed file"}]}',
    'Only include files you actually changed.',
  ].join('\n')

  const fixPrompt = [
    `Request: ${ctx.prompt}`,
    '',
    `### Violations reported by \`${check.name}\``,
    '```',
    diagnostics || '(check produced no stdout/stderr)',
    '```',
    '',
    'Fix every violation above in the existing files. Return each changed file with its complete new content.',
  ].join('\n')

  let raw = ''
  try {
    const response = await modelRouter.generate({
      systemPrompt,
      prompt: fixPrompt,
      context: ctx.snapshot
        ? `Project: ${ctx.snapshot.project.name}, React Native ${ctx.snapshot.project.reactNativeVersion || 'unknown'}`
        : undefined,
      maxTokens: 4096,
      temperature: 0.2,
    })
    raw = response.content
  } catch {
    raw = ''
  }

  const parsed = raw && !isFallbackResponse(raw) ? parseModelOutput(raw) : null

  if (parsed && parsed.files.length > 0) {
    const guardrailResults = checkGuardrails(parsed.files, conventions, projectRoot)
    const writtenFiles: string[] = []
    const redirected = projectRoot ? isSelfPackageRepo(projectRoot) : false
    if (projectRoot) {
      for (const file of parsed.files) {
        const writtenPath = writeProjectFile(projectRoot, file.path, file.content)
        if (writtenPath) {
          writtenFiles.push(writtenPath)
        }
      }
    }

    const redirectNote = redirected
      ? [`> ⚠️ Generated into ${GENERATED_OUTPUT_DIR}/ (this project is the rn-vectalon package itself; its src/ bundle is protected).`, '']
      : []

    const output = [
      `## Fix ${ctx.area} issues`,
      '',
      `Captured ${check.name} violations and asked the model to repair the affected files.`,
      ...(parsed.notes ? [parsed.notes, ''] : []),
      ...(writtenFiles.length > 0 ? ['Files written to disk:', ...writtenFiles.map(f => `- \`${f}\``), ''] : []),
      ...redirectNote,
      ...parsed.files.map(f => [`### ${f.path}`, '```typescript', f.content, '```'].join('\n')),
      '',
      formatGuardrailSummary(guardrailResults),
    ].join('\n')

    return {
      output,
      artifacts: parsed.files.map(f => ({
        type: 'engineering',
        title: f.path,
        content: f.content,
        path: f.path,
      })),
    }
  }

  // 3. Fallback — a fix plan. NEVER scaffold new files for a repair request.
  const output = [
    `## Fix ${ctx.area} issues`,
    '',
    `The ${check.name} check reported violations, but the model could not produce a clean, parseable fix.`,
    'No files were created or modified by this phase.',
    '',
    '### Violations',
    '```',
    diagnostics || '(no output captured)',
    '```',
    '',
    '### Suggested approach',
    '- Open each `file:line` reported above and resolve the violation.',
    `- Re-run the ${check.name} check (and the full verification suite) until clean.`,
  ].join('\n')

  return {
    output,
    artifacts: [{ type: 'engineering', title: `Fix ${ctx.area} issues`, content: output }],
  }
}

/**
 * Deterministic "add feature" scaffold — the no-model fallback used by the
 * implementation phase and the benchmark baseline. Exported so the bench
 * runner can score it without driving the full workflow.
 */
export function generateAddFeatureImplementation(
  projectRoot: string | undefined,
  ctx: {
    snapshot: ContextSnapshot | null
    prompt: string
  }
): { output: string; artifacts: WorkflowArtifact[] } {
  const conventions = detectConventions(ctx.snapshot)
  const ext = fileExtension(conventions.hasTypeScript)
  const jsxExt = jsxExtension(conventions.hasTypeScript)
  const featureName = sanitizeFileName(ctx.prompt) || 'Feature'

  const serviceFile = `src/services/${featureName}Api.${ext}`
  const serviceContent = [
    `// ${serviceFile}`,
    '',
    `export class ${featureName}Api {`,
    `  async execute(): Promise<string> {`,
    '    try {',
    '      return "ok";',
    '    } catch (err) {',
    '      const error = err instanceof Error ? err : new Error(String(err));',
    '      throw error;',
    '    }',
    '  }',
    '}',
    '',
    `export const ${featureName.charAt(0).toLowerCase() + featureName.slice(1)}Api = new ${featureName}Api();`,
  ].join('\n')

  const hookFile = `src/hooks/use${featureName}.${ext}`
  const hookContent = [
    `// ${hookFile}`,
    "import { useState, useCallback } from 'react';",
    `import { ${featureName.charAt(0).toLowerCase() + featureName.slice(1)}Api } from '../services/${featureName}Api';`,
    '',
    `interface Use${featureName}State {`,
    '  loading: boolean;',
    '  error: Error | null;',
    '  data: string | null;',
    '}',
    '',
    `export function use${featureName}(): Use${featureName}State & { run: () => Promise<void> } {`,
    `  const [state, setState] = useState<Use${featureName}State>({`,
    '    loading: false,',
    '    error: null,',
    '    data: null,',
    '  });',
    '',
    '  const run = useCallback(async () => {',
    '    setState(prev => ({ ...prev, loading: true, error: null }));',
    '    try {',
    `      const data = await ${featureName.charAt(0).toLowerCase() + featureName.slice(1)}Api.execute();`,
    '      setState({ loading: false, error: null, data });',
    '    } catch (err) {',
    '      const error = err instanceof Error ? err : new Error(String(err));',
    '      setState({ loading: false, error, data: null });',
    '    }',
    '  }, []);',
    '',
    '  return { ...state, run };',
    '}',
  ].join('\n')

  const screenFile = `src/screens/${featureName}Screen.${jsxExt}`

  const screenContent = [
    `// ${screenFile}`,
    "import { Text, TouchableOpacity, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';",
    `import { use${featureName} } from '../hooks/use${featureName}';`,
    '',
    `export function ${featureName}Screen(): JSX.Element {`,
    `  const { run, loading, error, data } = use${featureName}();`,
    '',
    '  return (',
    '    <SafeAreaView style={styles.container}>',
    `      <Text style={styles.title}>${featureName}</Text>`,
    '      {error && <Text style={styles.error}>{error.message}</Text>}',
    '      {data && <Text>{data}</Text>}',
    '      <TouchableOpacity',
    '        style={styles.button}',
    '        onPress={run}',
    '        disabled={loading}',
    `        accessibilityLabel="Run ${featureName}"`,
    '      >',
    '        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Run</Text>}',
    '      </TouchableOpacity>',
    '    </SafeAreaView>',
    '  );',
    '}',
    '',
    'const styles = StyleSheet.create({',
    '  container: { flex: 1, justifyContent: "center", padding: 24 },',
    '  title: { fontSize: 24, fontWeight: "bold", marginBottom: 24 },',
    '  error: { color: "#FF3B30", marginBottom: 12 },',
    '  button: { backgroundColor: "#007AFF", padding: 16, borderRadius: 8, alignItems: "center" },',
    '  buttonText: { color: "#fff", fontWeight: "600" },',
    '});',
  ].join('\n')

  const files = [
    { path: serviceFile, content: serviceContent },
    { path: hookFile, content: hookContent },
    { path: screenFile, content: screenContent },
  ]

  const guardrailResults = checkGuardrails(files, conventions, projectRoot)

  const writtenFiles: string[] = []
  const redirected = projectRoot ? isSelfPackageRepo(projectRoot) : false
  if (projectRoot) {
    for (const file of files) {
      const writtenPath = writeProjectFile(projectRoot, file.path, file.content)
      if (writtenPath) {
        writtenFiles.push(writtenPath)
      }
    }
  }

  const redirectNote = redirected
    ? [`> ⚠️ Generated into ${GENERATED_OUTPUT_DIR}/ (this project is the rn-vectalon package itself; its src/ bundle is protected).`, '']
    : []

  const output = [
    '## Generated files',
    '',
    `> Note: This is a generic starter scaffold for "${ctx.prompt}". Replace the placeholder API logic with your domain code.`,
    '',
    ...(writtenFiles.length > 0 ? ['Files written to disk:', ...writtenFiles.map(f => `- \`${f}\``), ''] : []),
    ...redirectNote,
    ...files.map(f => [
      `### ${f.path}`,
      '```typescript',
      f.content,
      '```',
    ].join('\n')),
    '',
    formatGuardrailSummary(guardrailResults),
    '',
    '## Next steps',
    '- Replace the placeholder API logic with your domain code',
    '- Wire the screen into your navigation stack',
    '- Add unit tests for the service and hook',
  ].join('\n')

  return {
    output,
    artifacts: files.map(f => ({
      type: 'engineering',
      title: f.path,
      content: f.content,
      path: f.path,
    })),
  }
}

function escapeRegExpToken(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Deterministically remove every import / require statement that references any
 * of the given package names (exact match or subpath import), including
 * multi-line named imports and dynamic `import('pkg')`. Collapses the blank
 * lines left behind. Usage code is intentionally NOT touched here — remaining
 * references are reported (and optionally handed to the model) separately.
 */
function stripPackageImports(source: string, packageNames: string[]): string {
  let out = source
  for (const pkg of packageNames) {
    const escaped = escapeRegExpToken(pkg)
    const moduleRef = `['"]${escaped}(?:\\/[^'"]+)?['"]`
    // import X from 'pkg' | import { a } from 'pkg' | import X, { a } from 'pkg'
    // | import * as X from 'pkg' | import type { A } from 'pkg' (single or multi-line)
    const specifier = `(?:\\*\\s+as\\s+[\\w$]+|\\{[^}]*\\}|[\\w$]+(?:\\s*,\\s*\\{[^}]*\\})?)`
    const importFrom = new RegExp(`import\\s+(?:type\\s+)?${specifier}\\s+from\\s+${moduleRef}\\s*;?`, 'g')
    const sideEffect = new RegExp(`import\\s+${moduleRef}\\s*;?`, 'g')
    // Handles: const X = require('pkg'), const { X } = require('pkg'),
    // require('pkg').default, and bare require('pkg').
    const requireCall = new RegExp(`(?:const\\s+(?:\\{[^}]*\\}|[\\w$]+)\\s*=\\s*)?require\\(\\s*${moduleRef}\\s*\\)(?:\\.[\\w$]+)*\\s*;?`, 'g')
    const dynamicImport = new RegExp(`import\\(\\s*${moduleRef}\\s*\\)\\s*;?`, 'g')
    const reExport = new RegExp(`export\\s+(?:\\*\\s+from|\\{[^}]*\\}\\s+from)\\s+${moduleRef}\\s*;?`, 'g')
    out = out
      .replace(importFrom, '')
      .replace(sideEffect, '')
      .replace(requireCall, '')
      .replace(dynamicImport, '')
      .replace(reExport, '')
  }
  return out.replace(/\n{3,}/g, '\n\n')
}

/**
 * Identifier / string tokens that could reference a package in code: the bare
 * name plus common casing variants (AppCenter, appcenter, APPCENTER, ...) for
 * the dependency and every matched sub-package.
 */
export function referenceTokens(dep: string, packageNames: string[]): string[] {
  const tokens = new Set<string>()
  for (const name of [dep, ...packageNames]) {
    const base = name.split('/').pop() || name
    const clean = base.replace(/[^a-zA-Z0-9]/g, '')
    if (clean.length < 3) continue
    tokens.add(clean.toLowerCase())
    tokens.add(clean.charAt(0).toUpperCase() + clean.slice(1))
    tokens.add(clean.toUpperCase())
  }
  return [...tokens]
}

/**
 * Scan a file for lines that still reference the package (non-import usages
 * such as AppCenter.startWithAppCenterSecret(...) or 'appcenter' in strings).
 */
function findPackageReferences(
  file: string,
  content: string,
  dep: string,
  packageNames: string[]
): { file: string; line: number; text: string }[] {
  const tokens = referenceTokens(dep, packageNames)
  const refs: { file: string; line: number; text: string }[] = []
  content.split('\n').forEach((line, idx) => {
    const trimmed = line.trim()
    if (!trimmed) return
    // Skip comment-only lines so audit output stays about real code, not
    // prose mentions (e.g. a `// https://appcenter.ms` comment).
    if (/^(?:\/\/|\*|\/\*|#)/.test(trimmed)) return
    for (const token of tokens) {
      if (token.length < 3) continue
      if (new RegExp(`\\b${escapeRegExpToken(token)}\\b`, 'i').test(line)) {
        refs.push({ file, line: idx + 1, text: trimmed.slice(0, 120) })
        return
      }
    }
  })
  return refs
}

function detectPackageManager(root: string): 'npm' | 'yarn' | 'pnpm' {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function uninstallCommand(pm: 'npm' | 'yarn' | 'pnpm', packages: string[]): string {
  const pkgs = packages.join(' ')
  if (pm === 'yarn') return `yarn remove ${pkgs}`
  if (pm === 'pnpm') return `pnpm remove ${pkgs}`
  return `npm uninstall ${pkgs}`
}

function looksLikeCode(content: string): boolean {
  const trimmed = content.trim()
  if (trimmed.length < 20) return false
  return ['{', '}', ';', '=>', 'function', 'const ', 'import ', 'export ', 'return '].some(m => trimmed.includes(m))
}

/**
 * Ask the model to remove every remaining usage of a package from the files
 * that still reference it after the deterministic import strip. Returns the
 * parseable, code-like files the model produced — callers apply them only when
 * non-empty, so a confused small model can never clobber files with garbage.
 */
async function modelCleanPackageUsages(
  modelRouter: ModelRouter,
  projectRoot: string,
  dep: string,
  refFiles: string[],
  packageNames: string[]
): Promise<{ files: GeneratedFile[]; rawOutput?: string }> {
  const candidates = refFiles.slice(0, 5)
  const snippets = candidates
    .map(f => {
      const full = join(projectRoot, f)
      const content = existsSync(full) ? readFileSync(full, 'utf-8').slice(0, 8000) : ''
      return [`### ${f}`, '```typescript', content, '```'].join('\n')
    })
    .join('\n\n')

  const systemPrompt = [
    `You are a senior React Native engineer uninstalling the package "${dep}".`,
    `Remove ALL imports and every usage of "${dep}"${packageNames.length > 0 ? ` and its sub-packages (${packageNames.join(', ')})` : ''} from the files below:`,
    '- Delete import/require statements and any code that exists only to use the package (init calls, analytics/crash/push setup, config).',
    '- Keep every other export, function, prop, and style identical.',
    '- Only include files you actually changed.',
    'Return ONLY a JSON object with no markdown outside the JSON block:',
    '{"files":[{"path":"src/...","content":"FULL new content of each changed file"}]}',
  ].join('\n')

  const prompt = [
    `### Files still referencing ${dep}`,
    snippets,
    '',
    'Remove the package usage from each file above and return the changed files as JSON.',
  ].join('\n')

  let raw = ''
  try {
    const response = await modelRouter.generate({
      systemPrompt,
      prompt,
      maxTokens: 4096,
      temperature: 0.2,
    })
    raw = response.content
  } catch {
    raw = ''
  }

  if (raw && !isFallbackResponse(raw)) {
    const parsed = parseModelOutput(raw)
    if (parsed) {
      const files = parsed.files.filter(f => looksLikeCode(f.content))
      if (files.length > 0) return { files, rawOutput: raw }
    }
  }
  return { files: [], rawOutput: raw }
}

async function generateRemoveDependencyImplementation(
  modelRouter: ModelRouter,
  projectRoot: string | undefined,
  ctx: {
    snapshot: ContextSnapshot | null
    dependency: string
    prompt: string
  }
): Promise<{ output: string; artifacts: WorkflowArtifact[] }> {
  const dep = ctx.dependency
  const matches = findDependency(ctx.snapshot, dep)
  const usages = findUsages(ctx.snapshot, dep)
  const isExpo = ctx.snapshot?.project.tooling === 'expo'
  const pm = projectRoot ? detectPackageManager(projectRoot) : 'npm'
  const redirectToGenerated = projectRoot ? isSelfPackageRepo(projectRoot) : false

  // --- 1. Edit package.json on disk: drop the package from every dep section. ---
  const packageNames = new Set(matches.map(m => m.name))
  const pkgRemoved: string[] = []
  let pkgChangeNote = ''
  const pkgPath = projectRoot ? join(projectRoot, 'package.json') : undefined
  if (pkgPath && existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, Record<string, string>>
      // Union snapshot matches with whatever actually matches on disk, so a
      // stale scan snapshot can't cause us to miss packages (or keep extras).
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const name of Object.keys(pkg[section] || {})) {
          if (name.toLowerCase().includes(dep.toLowerCase())) packageNames.add(name)
        }
      }
      const before = JSON.stringify(pkg, null, 2)
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        if (!pkg[section]) continue
        for (const name of packageNames) {
          if (pkg[section][name] !== undefined) {
            delete pkg[section][name]
            pkgRemoved.push(name)
          }
        }
      }
      if (pkgRemoved.length > 0) {
        const after = JSON.stringify(pkg, null, 2)
        writeFileSync(pkgPath, after + '\n', 'utf-8')
        reportPathChange('package.json', before, after)
        pkgChangeNote = `- package.json: removed ${pkgRemoved.join(', ')}`
      } else {
        pkgChangeNote = `- package.json: ${dep} was not listed (nothing to remove)`
      }
    } catch (err) {
      pkgChangeNote = `- package.json: could not be updated (${err instanceof Error ? err.message : String(err)})`
    }
  } else if (redirectToGenerated) {
    pkgChangeNote = '- package.json: skipped (this project is the rn-vectalon package itself)'
  } else if (pkgPath) {
    pkgChangeNote = '- package.json: not found — skipping manifest edit'
  } else {
    pkgChangeNote = '- package.json: no project root — skipping manifest edit'
  }

  // --- 2. Strip import / require statements from source files (deterministic). ---
  const uninstallPackages = packageNames.size > 0 ? [...packageNames] : [dep]
  const srcDir = projectRoot && !redirectToGenerated ? join(projectRoot, 'src') : undefined
  const strippedFiles: string[] = []
  const scanTargets = srcDir && existsSync(srcDir) ? findSourceFiles(srcDir) : []
  for (const file of scanTargets) {
    const original = readFileSync(file, 'utf-8')
    const cleaned = stripPackageImports(original, uninstallPackages)
    if (cleaned !== original) {
      writeFileSync(file, cleaned, 'utf-8')
      reportPathChange(relative(projectRoot || '', file), original, cleaned)
      strippedFiles.push(relative(projectRoot || '', file))
    }
  }

  // --- 3. Find remaining (non-import) references and let the model clean them. ---
  let remainingReferences: { file: string; line: number; text: string }[] = []
  for (const file of scanTargets) {
    const rel = relative(projectRoot || '', file)
    remainingReferences.push(...findPackageReferences(rel, readFileSync(file, 'utf-8'), dep, uninstallPackages))
  }

  const affectedFiles = [...strippedFiles]
  const modelCleaned: string[] = []
  let modelNotes = ''
  const refFiles = [...new Set(remainingReferences.map(r => r.file))]
  if (refFiles.length > 0 && projectRoot && !redirectToGenerated) {
    const cleaned = await modelCleanPackageUsages(modelRouter, projectRoot, dep, refFiles, uninstallPackages)
    // Only apply model output to files that actually reference the package — a
    // confused model must never be able to rewrite unrelated files.
    const scoped = cleaned.files.filter(f => refFiles.includes(f.path))
    if (scoped.length > 0) {
      for (const file of scoped) {
        const writtenPath = writeProjectFile(projectRoot, file.path, file.content)
        if (writtenPath) {
          modelCleaned.push(file.path)
          if (!affectedFiles.includes(file.path)) affectedFiles.push(file.path)
        }
      }
      // Re-scan the touched files so the report reflects the final state.
      remainingReferences = remainingReferences.filter(r => !affectedFiles.includes(r.file))
      for (const rel of affectedFiles) {
        const full = join(projectRoot, rel)
        if (existsSync(full)) {
          remainingReferences.push(...findPackageReferences(rel, readFileSync(full, 'utf-8'), dep, uninstallPackages))
        }
      }
    } else {
      modelNotes = [
        `- The model could not produce a parseable cleanup for ${refFiles.length} file(s) still referencing ${dep}:`,
        ...refFiles.map(f => `  - ${f}`),
        '- Remove the remaining usages manually (search for the package name in those files).',
      ].join('\n')
    }
  }

  const codeChanges = usages.map(u => {
    const removedImports = u.imports.filter(imp =>
      imp.toLowerCase().includes(ctx.dependency.toLowerCase())
    )
    return {
      file: u.file,
      removedImports,
      note: `Remove ${removedImports.join(', ')} imports and any code that uses them.`,
    }
  })

  const nativeCleanup = isExpo
    ? [
        '### Expo managed workflow',
        '1. If the package ships an Expo config plugin, remove its entry from `app.json` / `app.config.js` (`plugins` array).',
        '2. Regenerate native projects if needed: `npx expo prebuild --clean` (only if you ejected).',
        '3. Verify with `npx expo-doctor` that no dangling native config remains.',
      ]
    : [
        '### Android',
        '1. Open `android/app/build.gradle` and remove any package configuration.',
        '2. Open `android/settings.gradle` and remove related include entries if present.',
        '3. Clean and rebuild: `cd android && ./gradlew clean`',
        '',
        '### iOS',
        '1. Open `ios/Podfile` and remove any package pods.',
        '2. Run `cd ios && pod install` to update the lockfile.',
      ]

  const installCmd = pm === 'yarn' ? 'yarn install' : pm === 'pnpm' ? 'pnpm install' : 'npm install'
  const removalScript = [
    '#!/bin/bash',
    `# Sync the lockfile + native cleanup after removing ${dep} from package.json`,
    'set -euo pipefail',
    '',
    '# 1. Prune the removed package from the lockfile (package.json was already edited)',
    installCmd,
    ...(isExpo ? ['', '# Expo managed workflow: regenerate native projects if ejected', 'npx expo prebuild --clean', '', 'npx expo-doctor'] : ['', '# iOS cleanup', 'cd ios || exit 0', 'pod install', 'cd ..']),
    '',
    '# Verify no imports remain in source files',
    `IMPORTS=$(grep -R -E "from ['"]${ctx.dependency}['"]|require\\(['"]${ctx.dependency}['"]\\)" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null || true)`,
    `if [ -n "$IMPORTS" ]; then`,
    `  echo "Error: found remaining imports of ${ctx.dependency}:"`,
    `  echo "$IMPORTS"`,
    `  exit 1`,
    `fi`,
    `echo "No source imports remain for ${ctx.dependency}"`,
    '',
    '# Verify package.json no longer lists the dependency',
    `if grep -q "\\"${ctx.dependency}\\"" package.json; then`,
    `  echo "Error: ${ctx.dependency} still listed in package.json"`,
    `  exit 1`,
    `fi`,
    `echo "${ctx.dependency} removed from package.json"`,
  ].join('\n')

  const scriptName = sanitizeFileName(dep).toLowerCase() || 'dependency'
  const scriptPath = `scripts/remove-${scriptName}.sh`
  let writtenScriptPath: string | undefined
  if (projectRoot) {
    writtenScriptPath = writeProjectFile(projectRoot, scriptPath, removalScript) ?? undefined
  }

  const output = [
    `## Remove dependency: ${ctx.dependency}`,
    '',
    '### Installed packages found',
    matches.length > 0
      ? matches.map(m => `- ${m.name}@${m.version}${m.isDev ? ' (devDependency)' : ''}`).join('\n')
      : `- No installed package matching "${ctx.dependency}" was found in package.json.`,
    '',
    '### Changes applied',
    pkgChangeNote,
    ...strippedFiles.map(f => `- ${f}: stripped ${dep} import(s)`),
    ...modelCleaned.map(f => `- ${f}: model removed remaining ${dep} usage(s)`),
    ...(pkgRemoved.length === 0 && strippedFiles.length === 0 && modelCleaned.length === 0 ? ['- Nothing to change — the dependency was already absent.'] : []),
    '',
    '### Remaining references (review manually)',
    remainingReferences.length > 0
      ? remainingReferences.map(r => `- ${r.file}:${r.line} — \`${r.text}\``).join('\n')
      : '- None — no non-import references remain in the scanned source files.',
    '',
    ...(modelNotes ? [modelNotes, ''] : []),
    '### Uninstall / lockfile sync',
    '```bash',
    uninstallCommand(pm, uninstallPackages),
    isExpo ? 'npx expo prebuild --clean (only if ejected)' : 'cd ios && pod install',
    '```',
    '',
    '### Code usages found',
    usages.length > 0
      ? codeChanges.map(c => `- \`${c.file}\`: ${c.note}`).join('\n')
      : `- No component imports matching "${ctx.dependency}" were found in the scanned source files.`,
    '',
    '### Native cleanup',
    ...nativeCleanup,
    '',
    '### Verification checklist',
    '- [ ] Package is removed from `package.json`',
    '- [ ] No imports remain in source files',
    ...(isExpo
      ? ['- [ ] `npx expo-doctor` passes with no dangling native config']
      : ['- [ ] iOS Podfile.lock is updated', '- [ ] Android build succeeds']),
    '- [ ] App launches without package errors',
    '',
    writtenScriptPath ? `Cleanup script written to: \`${writtenScriptPath}\`` : '',
  ].join('\n')

  return {
    output,
    artifacts: [
      { type: 'engineering', title: `Removal plan: ${dep}`, content: output },
      ...strippedFiles.map(f => {
        const full = join(projectRoot || '', f)
        const content = existsSync(full) ? readFileSync(full, 'utf-8') : ''
        return { type: 'engineering' as const, title: `Stripped imports: ${f}`, content, path: f }
      }),
      ...modelCleaned.map(f => {
        const full = join(projectRoot || '', f)
        const content = existsSync(full) ? readFileSync(full, 'utf-8') : ''
        return { type: 'engineering' as const, title: `Removed usage: ${f}`, content, path: f }
      }),
      { type: 'engineering', title: `Cleanup script: ${dep}`, content: removalScript, path: scriptPath },
    ],
  }
}

function generateUnknownImplementation(
  ctx: {
    snapshot: ContextSnapshot | null
    prompt: string
  }
): { output: string; artifacts: WorkflowArtifact[] } {
  const output = [
    '## Request not classified',
    '',
    `The request could not be confidently classified by the model, so no files were created or modified.`,
    '',
    `Request: \`${ctx.prompt}\``,
    '',
    '### Why this happened',
    '- The local model returned an unrecognized response for intent detection, or',
    '- The request is ambiguous (mixes adding a feature with removing a dependency, etc.), or',
    '- The model is too small / uncalibrated for this phrasing.',
    '',
    '### How to proceed',
    '- Reword the request with an explicit verb: "Add a login screen", "Remove the appcenter dependency", "Fix lint issues", "Refactor the home screen".',
    '- Run with a remote model: `vectalon feature --model openai "<request>"` (needs an API key).',
    '- Describe the change you want as a single intent.',
  ].join('\n')

  return {
    output,
    artifacts: [
      { type: 'engineering', title: 'Clarification needed', content: output },
    ],
  }
}

function generateRefactorImplementation(
  projectRoot: string | undefined,
  srcDir: string | undefined,
  ctx: {
    snapshot: ContextSnapshot | null
    target: string
    prompt: string
  }
): { output: string; artifacts: WorkflowArtifact[] } {
  const conventions = detectConventions(ctx.snapshot)
  const ext = fileExtension(conventions.hasTypeScript)

  if (ctx.target === 'remove-unused-imports') {
    const targetDir = srcDir || (projectRoot ? join(projectRoot, 'src') : '')
    if (!targetDir) {
      return {
        output: '## Refactor: remove unused imports\n\nCould not determine source directory.',
        artifacts: [],
      }
    }

    const files = findSourceFiles(targetDir)
    const results = removeUnusedImportsFromProject(targetDir)
    const changed = results.filter(r => r.changed)
    const unchanged = results.filter(r => !r.changed)

    const output = [
      '## Refactor: remove unused imports',
      '',
      `Scanned ${files.length} source files in \`${targetDir}\`.`,
      '',
      changed.length > 0
        ? `### Files modified (${changed.length})\n\n${changed.map(r => `- \`${r.file}\` removed ${r.removed.length} import(s)`).join('\n')}`
        : '### No files modified\n\nNo unused imports were found in the scanned source files.',
      '',
      `### Unchanged files (${unchanged.length})`,
      ...unchanged.map(r => `- \`${r.file}\``),
    ].join('\n')

    return {
      output,
      artifacts: changed.map(r => ({
        type: 'engineering',
        title: `Cleaned: ${r.file}`,
        content: `Removed ${r.removed.length} unused import(s):\n${r.removed.map(i => `- ${i}`).join('\n')}`,
        path: r.file,
      })),
    }
  }

  const output = [
    `## Refactor: ${ctx.target}`,
    '',
    '### Approach',
    '1. Locate the target file(s) and understand current responsibilities.',
    '2. Extract shared logic into dedicated helpers or hooks.',
    '3. Add or update tests for the refactored code.',
    '4. Run the full verification suite before opening the PR.',
    '',
    '### Suggested file structure after refactor',
    `- \`src/${ctx.target}.${ext}\` — refactored module`,
    `- \`src/${ctx.target}.test.${ext}\` — unit tests`,
    '',
    '### Next steps',
    '- Review the current implementation for duplication or hidden dependencies.',
    '- Use the project’s existing naming and styling conventions.',
    '- Keep the public API unchanged unless a breaking change is intentional.',
  ].join('\n')

  return {
    output,
    artifacts: [
      { type: 'engineering', title: `Refactor plan: ${ctx.target}`, content: output },
    ],
  }
}

export const implementationPhase: WorkflowPhase = {
  id: 'implementation',
  name: 'Implementation',
  description: 'Generate code files or a change plan for the requested work, following project conventions.',
  run: async (ctx) => {
    const intent = (await getIntent(ctx)).intent
    const conventions = detectConventions(ctx.snapshot)
    const projectRoot = ctx.projectRoot
    const srcDir = projectRoot ? join(projectRoot, 'src') : undefined

    let result: { output: string; artifacts: WorkflowArtifact[] }

    if (isRemoveDependency(intent)) {
      result = await generateRemoveDependencyImplementation(ctx.modelRouter, projectRoot, {
        snapshot: ctx.snapshot,
        dependency: intent.dependency,
        prompt: ctx.prompt,
      })
    } else if (isRefactor(intent)) {
      result = generateRefactorImplementation(projectRoot, srcDir, {
        snapshot: ctx.snapshot,
        target: intent.target,
        prompt: ctx.prompt,
      })
    } else if (isFix(intent)) {
      // Repair requests: diagnose -> model fixes existing files -> plan fallback.
      // This path intentionally never scaffolds new screens/hooks/services.
      result = await generateFixImplementation(ctx.modelRouter, projectRoot, {
        snapshot: ctx.snapshot,
        prompt: ctx.prompt,
        area: intent.area,
        testRunner: ctx.adapters.testRunner,
      })
    } else if (intent.type === 'unknown') {
      // Unclassified requests get a clarifying plan — never a generic scaffold.
      result = generateUnknownImplementation({
        snapshot: ctx.snapshot,
        prompt: ctx.prompt,
      })
    } else {
      // Try to use the model for actual implementation generation
      const testsPhase = ctx.state.phases.find(p => p.id === 'tests')
      const tests = testsPhase?.artifacts
        .filter(a => a.type === 'qa' && a.content)
        .map(a => [`### ${a.title || a.path}`, '```typescript', a.content, '```', ''].join('\n'))
        .join('\n') || undefined

      const modelResult = await generateModelImplementation(ctx.modelRouter, projectRoot, {
        snapshot: ctx.snapshot,
        prompt: ctx.prompt,
        intent,
        tests,
      })

      if (modelResult.implementation) {
        result = modelResult.implementation
      } else {
        result = generateAddFeatureImplementation(projectRoot, {
          snapshot: ctx.snapshot,
          prompt: ctx.prompt,
        })
        if (modelResult.rawOutput) {
          const raw = modelResult.rawOutput.length > 4000
            ? modelResult.rawOutput.slice(0, 4000) + '\n... (truncated)'
            : modelResult.rawOutput
          result = {
            ...result,
            output: result.output + [
              '',
              '## Model output (not applied)',
              '',
              '> The model returned content that could not be parsed into files. Preserved below for review:',
              '',
              '```',
              raw,
              '```',
            ].join('\n'),
          }
        }
      }
    }

    const conventionsNote = [
      '',
      '### Project conventions applied',
      `- TypeScript: ${conventions.hasTypeScript ? 'Yes' : 'No'}`,
      `- React Navigation: ${conventions.hasNavigation ? 'Yes' : 'No'}`,
      `- StyleSheet usage: ${conventions.usesStyleSheet ? 'Yes' : 'No'}`,
    ].join('\n')

    return phaseResult(
      'implementation',
      intentTitle(intent),
      'Generate code files or a change plan for the requested work, following project conventions.',
      `${result.output}${conventionsNote}`,
      result.artifacts
    )
  },
}
