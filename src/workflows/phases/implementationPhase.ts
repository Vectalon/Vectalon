import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import type { WorkflowPhase, WorkflowArtifact } from '../../adapters/types'
import type { ContextSnapshot } from '../../harness/types'
import type { ModelRouter } from '../../model/ModelRouter'
import { removeUnusedImportsFromProject, findSourceFiles } from '../../utils/unusedImports'
import { detectConventions, phaseResult, sanitizeFileName, fileExtension, jsxExtension } from './helpers'
import { detectIntent, intentTitle, isRemoveDependency, isRefactor } from './intent'
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

function writeProjectFile(projectRoot: string, filePath: string, content: string): string {
  const fullPath = join(projectRoot, filePath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')
  return fullPath
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

function parseModelOutput(content: string): GeneratedImplementation | null {
  // Try to extract JSON from markdown code block first
  const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const jsonText = jsonBlockMatch ? jsonBlockMatch[1].trim() : content.trim()

  try {
    const parsed = JSON.parse(jsonText) as GeneratedImplementation
    if (Array.isArray(parsed.files)) {
      return {
        files: parsed.files.map(f => ({ path: f.path, content: f.content })),
        notes: parsed.notes,
      }
    }
  } catch {
    // Ignore parse error
  }

  return null
}

function buildImplementationPrompt(ctx: {
  snapshot: ContextSnapshot | null
  prompt: string
  intent: ReturnType<typeof detectIntent>
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
    'Generate the files for this request.',
    `Use "${featureName}" as the base name for the generated modules.`,
  ].join('\n')

  return { systemPrompt, prompt: projectContext }
}

async function generateModelImplementation(
  modelRouter: ModelRouter,
  projectRoot: string | undefined,
  ctx: {
    snapshot: ContextSnapshot | null
    prompt: string
    intent: ReturnType<typeof detectIntent>
  }
): Promise<{ output: string; artifacts: WorkflowArtifact[] } | null> {
  const promptCtx = buildImplementationPrompt(ctx)
  const response = await modelRouter.generate({
    systemPrompt: promptCtx.systemPrompt,
    prompt: promptCtx.prompt,
    context: ctx.snapshot
      ? `Project: ${ctx.snapshot.project.name}, React Native ${ctx.snapshot.project.reactNativeVersion || 'unknown'}`
      : undefined,
  })

  if (isFallbackResponse(response.content)) {
    return null
  }

  const parsed = parseModelOutput(response.content)
  if (!parsed || parsed.files.length === 0) {
    return null
  }

  const conventions = detectConventions(ctx.snapshot)
  const guardrailResults = checkGuardrails(parsed.files, conventions, projectRoot)
  const writtenFiles: string[] = []
  if (projectRoot) {
    for (const file of parsed.files) {
      const writtenPath = writeProjectFile(projectRoot, file.path, file.content)
      writtenFiles.push(writtenPath)
    }
  }

  const fileSections = parsed.files.map(f => [
    `### ${f.path}`,
    '```typescript',
    f.content,
    '```',
  ].join('\n'))

  const output = [
    '## Generated files',
    '',
    ...(parsed.notes ? [parsed.notes, ''] : []),
    ...(writtenFiles.length > 0 ? ['Files written to disk:', ...writtenFiles.map(f => `- \`${f}\``), ''] : []),
    ...fileSections,
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

function generateAddFeatureImplementation(
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
  if (projectRoot) {
    for (const file of files) {
      const writtenPath = writeProjectFile(projectRoot, file.path, file.content)
      writtenFiles.push(writtenPath)
    }
  }

  const output = [
    '## Generated files',
    '',
    `> Note: This is a generic starter scaffold for "${ctx.prompt}". Replace the placeholder API logic with your domain code.`,
    '',
    ...(writtenFiles.length > 0 ? ['Files written to disk:', ...writtenFiles.map(f => `- \`${f}\``), ''] : []),
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

function generateRemoveDependencyImplementation(
  projectRoot: string | undefined,
  ctx: {
    snapshot: ContextSnapshot | null
    dependency: string
    prompt: string
  }
): { output: string; artifacts: WorkflowArtifact[] } {
  const matches = findDependency(ctx.snapshot, ctx.dependency)
  const usages = findUsages(ctx.snapshot, ctx.dependency)

  const uninstallPackages = matches.length > 0 ? matches.map(m => m.name) : [ctx.dependency]

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

  const nativeCleanup = [
    '### Android',
    '1. Open `android/app/build.gradle` and remove any App Center configuration.',
    '2. Open `android/settings.gradle` and remove related include entries if present.',
    '3. Clean and rebuild: `cd android && ./gradlew clean`',
    '',
    '### iOS',
    '1. Open `ios/Podfile` and remove any App Center pods.',
    '2. Run `cd ios && pod install` to update the lockfile.',
  ]

  const removalScript = [
    '#!/bin/bash',
    '# Run this script after reviewing the code changes above',
    '',
    `npm uninstall ${uninstallPackages.join(' ')}`,
    '',
    '# iOS cleanup',
    'cd ios || exit 0',
    'pod install',
    'cd ..',
    '',
    '# Verify no imports remain',
    `grep -R "${ctx.dependency}" src/ --include="*.ts" --include="*.tsx" || echo "No source imports found"`,
  ].join('\n')

  const scriptPath = 'scripts/remove-appcenter.sh'
  let writtenScriptPath: string | undefined
  if (projectRoot) {
    writtenScriptPath = writeProjectFile(projectRoot, scriptPath, removalScript)
  }

  const output = [
    `## Remove dependency: ${ctx.dependency}`,
    '',
    '### Installed packages found',
    matches.length > 0
      ? matches.map(m => `- ${m.name}@${m.version}${m.isDev ? ' (devDependency)' : ''}`).join('\n')
      : `- No installed package matching "${ctx.dependency}" was found in package.json.`,
    '',
    '### Uninstall commands',
    '```bash',
    `npm uninstall ${uninstallPackages.join(' ')}`,
    'cd ios && pod install',
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
    '- [ ] iOS Podfile.lock is updated',
    '- [ ] Android build succeeds',
    '- [ ] App launches without App Center errors',
    '',
    writtenScriptPath ? `Cleanup script written to: \`${writtenScriptPath}\`` : '',
  ].join('\n')

  return {
    output,
    artifacts: [
      { type: 'engineering', title: `Removal plan: ${ctx.dependency}`, content: output },
      { type: 'engineering', title: `Cleanup script: ${ctx.dependency}`, content: removalScript, path: scriptPath },
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
    const intent = detectIntent(ctx.prompt)
    const conventions = detectConventions(ctx.snapshot)
    const projectRoot = ctx.projectRoot
    const srcDir = projectRoot ? join(projectRoot, 'src') : undefined

    let result: { output: string; artifacts: WorkflowArtifact[] }

    if (isRemoveDependency(intent)) {
      result = generateRemoveDependencyImplementation(projectRoot, {
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
    } else {
      // Try to use the local model for actual implementation generation
      const modelResult = await generateModelImplementation(ctx.modelRouter, projectRoot, {
        snapshot: ctx.snapshot,
        prompt: ctx.prompt,
        intent,
      })

      if (modelResult) {
        result = modelResult
      } else {
        result = generateAddFeatureImplementation(projectRoot, {
          snapshot: ctx.snapshot,
          prompt: ctx.prompt,
        })
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
