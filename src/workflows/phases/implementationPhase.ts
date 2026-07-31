import type { WorkflowPhase, WorkflowArtifact } from '../../adapters/types'
import type { ContextSnapshot } from '../../harness/types'
import { detectConventions, phaseResult, sanitizeFileName, fileExtension, jsxExtension } from './helpers'
import { detectIntent, intentTitle, isRemoveDependency, isRefactor } from './intent'

interface DependencyMatch {
  name: string
  version: string
  isDev: boolean
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

function generateAddFeatureImplementation(ctx: {
  snapshot: ContextSnapshot | null
  prompt: string
}): { output: string; artifacts: WorkflowArtifact[] } {
  const conventions = detectConventions(ctx.snapshot)
  const ext = fileExtension(conventions.hasTypeScript)
  const jsxExt = jsxExtension(conventions.hasTypeScript)
  const featureName = sanitizeFileName(ctx.prompt) || 'Feature'

  const serviceFile = `src/services/${featureName}Api.${ext}`
  const serviceContent = [
    `// ${serviceFile}`,
    "import { Platform } from 'react-native';",
    '',
    "const API_BASE_URL = 'https://api.example.com'; // TODO: use environment config",
    '',
    `export interface ${featureName}Request {`,
    '  email: string;',
    '  password: string;',
    '}',
    '',
    `export interface ${featureName}Response {`,
    '  token: string;',
    '  refreshToken: string;',
    '  user: { id: string; email: string };',
    '}',
    '',
    `export class ${featureName}Api {`,
    `  async authenticate(payload: ${featureName}Request): Promise<${featureName}Response> {`,
    '    const response = await fetch(`${API_BASE_URL}/auth/login`, {',
    "      method: 'POST',",
    "      headers: { 'Content-Type': 'application/json' },",
    '      body: JSON.stringify(payload),',
    '    });',
    '',
    '    if (!response.ok) {',
    '      throw new Error(`Authentication failed: ${response.status}`);',
    '    }',
    '',
    '    return response.json();',
    '  }',
    '}',
    '',
    `export const ${featureName.charAt(0).toLowerCase() + featureName.slice(1)}Api = new ${featureName}Api();`,
  ].join('\n')

  const hookFile = `src/hooks/use${featureName}.${ext}`
  const hookContent = [
    `// ${hookFile}`,
    "import { useState, useCallback } from 'react';",
    `import { ${featureName}Api, ${featureName}Request, ${featureName}Response } from '../services/${featureName}Api';`,
    '',
    `interface Use${featureName}State {`,
    '  loading: boolean;',
    '  error: Error | null;',
    `  data: ${featureName}Response | null;`,
    '}',
    '',
    `export function use${featureName}(): Use${featureName}State & {`,
    `  submit: (payload: ${featureName}Request) => Promise<void>;`,
    '} {',
    `  const [state, setState] = useState<Use${featureName}State>({`,
    '    loading: false,',
    '    error: null,',
    '    data: null,',
    '  });',
    '',
    `  const submit = useCallback(async (payload: ${featureName}Request) => {`,
    '    setState(prev => ({ ...prev, loading: true, error: null }));',
    '    try {',
    `      const data = await ${featureName.charAt(0).toLowerCase() + featureName.slice(1)}Api.authenticate(payload);`,
    '      setState({ loading: false, error: null, data });',
    '    } catch (err) {',
    '      const error = err instanceof Error ? err : new Error(String(err));',
    '      setState({ loading: false, error, data: null });',
    '    }',
    '  }, []);',
    '',
    '  return { ...state, submit };',
    '}',
  ].join('\n')

  const screenFile = `src/screens/${featureName}Screen.${jsxExt}`
  const importStyle = conventions.usesStyleSheet ? "import { StyleSheet } from 'react-native';" : ''
  const styleProp = conventions.usesStyleSheet ? ' style={styles.container}' : ''
  const styleCode = conventions.usesStyleSheet
    ? '\nconst styles = StyleSheet.create({\n  container: { flex: 1, justifyContent: "center", padding: 24 },\n  title: { fontSize: 24, fontWeight: "bold", marginBottom: 24 },\n  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 12 },\n  button: { backgroundColor: "#007AFF", padding: 16, borderRadius: 8, alignItems: "center" },\n  buttonText: { color: "#fff", fontWeight: "600" },\n  error: { color: "#FF3B30", marginBottom: 12 },\n});'
    : ''

  const screenContent = [
    `// ${screenFile}`,
    "import React, { useState } from 'react';",
    "import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';",
    importStyle,
    `import { use${featureName} } from '../hooks/use${featureName}';`,
    '',
    `export function ${featureName}Screen() {`,
    `  const { submit, loading, error } = use${featureName}();`,
    "  const [email, setEmail] = useState('');",
    "  const [password, setPassword] = useState('');",
    '',
    '  const handleSubmit = () => {',
    '    submit({ email, password });',
    '  };',
    '',
    '  return (',
    `    <View${styleProp}>`,
    '      <Text style={styles.title}>Sign In</Text>',
    '      <TextInput',
    '        style={styles.input}',
    '        placeholder="Email"',
    '        keyboardType="email-address"',
    '        autoCapitalize="none"',
    '        value={email}',
    '        onChangeText={setEmail}',
    '      />',
    '      <TextInput',
    '        style={styles.input}',
    '        placeholder="Password"',
    '        secureTextEntry',
    '        value={password}',
    '        onChangeText={setPassword}',
    '      />',
    '      {error && <Text style={styles.error}>{error.message}</Text>}',
    '      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>',
    '        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}',
    '      </TouchableOpacity>',
    '    </View>',
    '  );',
    '}',
    styleCode,
  ]
    .filter(Boolean)
    .join('\n')

  const output = [
    '## Generated files',
    '',
    `> Note: This is a starter scaffold for "${ctx.prompt}". Review and adapt it to your exact domain.`,
    '',
    `### ${serviceFile}`,
    '```typescript',
    serviceContent,
    '```',
    '',
    `### ${hookFile}`,
    '```typescript',
    hookContent,
    '```',
    '',
    `### ${screenFile}`,
    '```typescript',
    screenContent,
    '```',
    '',
    '## Next steps',
    '- Replace `API_BASE_URL` with your actual endpoint',
    '- Add token persistence using secure storage',
    '- Wire the screen into your navigation stack',
  ].join('\n')

  return {
    output,
    artifacts: [
      { type: 'engineering', title: `Service: ${ctx.prompt}`, content: serviceContent, path: serviceFile },
      { type: 'engineering', title: `Hook: ${ctx.prompt}`, content: hookContent, path: hookFile },
      { type: 'engineering', title: `Screen: ${ctx.prompt}`, content: screenContent, path: screenFile },
    ],
  }
}

function generateRemoveDependencyImplementation(ctx: {
  snapshot: ContextSnapshot | null
  dependency: string
  prompt: string
}): { output: string; artifacts: WorkflowArtifact[] } {
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
  ].join('\n')

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

  return {
    output,
    artifacts: [
      { type: 'engineering', title: `Removal plan: ${ctx.dependency}`, content: output },
      { type: 'engineering', title: `Cleanup script: ${ctx.dependency}`, content: removalScript, path: 'scripts/remove-appcenter.sh' },
    ],
  }
}

function generateRefactorImplementation(ctx: {
  snapshot: ContextSnapshot | null
  target: string
  prompt: string
}): { output: string; artifacts: WorkflowArtifact[] } {
  const conventions = detectConventions(ctx.snapshot)
  const ext = fileExtension(conventions.hasTypeScript)

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

    let result: { output: string; artifacts: WorkflowArtifact[] }

    if (isRemoveDependency(intent)) {
      result = generateRemoveDependencyImplementation({
        snapshot: ctx.snapshot,
        dependency: intent.dependency,
        prompt: ctx.prompt,
      })
    } else if (isRefactor(intent)) {
      result = generateRefactorImplementation({
        snapshot: ctx.snapshot,
        target: intent.target,
        prompt: ctx.prompt,
      })
    } else {
      result = generateAddFeatureImplementation({
        snapshot: ctx.snapshot,
        prompt: ctx.prompt,
      })
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
