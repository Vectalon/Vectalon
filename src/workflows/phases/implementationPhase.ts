import type { WorkflowPhase } from '../../adapters/types'
import { detectConventions, phaseResult, sanitizeFileName, fileExtension, jsxExtension } from './helpers'

export const implementationPhase: WorkflowPhase = {
  id: 'implementation',
  name: 'Implementation',
  description: 'Generate code files for the feature following project conventions.',
  run: async (ctx) => {
    const conventions = detectConventions(ctx.snapshot)
    const ext = fileExtension(conventions.hasTypeScript)
    const jsxExt = jsxExtension(conventions.hasTypeScript)
    const featureName = sanitizeFileName(ctx.prompt)
    const screenName = featureName || 'Login'

    const serviceFile = `src/services/${screenName}Api.${ext}`
    const serviceContent = [
      `// ${serviceFile}`,
      "import { Platform } from 'react-native';",
      '',
      "const API_BASE_URL = 'https://api.example.com'; // TODO: use environment config",
      '',
      `export interface ${screenName}Request {`,
      '  email: string;',
      '  password: string;',
      '}',
      '',
      `export interface ${screenName}Response {`,
      '  token: string;',
      '  refreshToken: string;',
      '  user: { id: string; email: string };',
      '}',
      '',
      `export class ${screenName}Api {`,
      `  async authenticate(payload: ${screenName}Request): Promise<${screenName}Response> {`,
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
      `export const ${screenName.toLowerCase()}Api = new ${screenName}Api();`,
    ].join('\n')

    const hookFile = `src/hooks/use${screenName}.${ext}`
    const hookContent = [
      `// ${hookFile}`,
      "import { useState, useCallback } from 'react';",
      `import { ${screenName}Api, ${screenName}Request, ${screenName}Response } from '../services/${screenName}Api';`,
      '',
      `interface Use${screenName}State {`,
      '  loading: boolean;',
      '  error: Error | null;',
      `  data: ${screenName}Response | null;`,
      '}',
      '',
      `export function use${screenName}(): Use${screenName}State & {`,
      `  submit: (payload: ${screenName}Request) => Promise<void>;`,
      '} {',
      `  const [state, setState] = useState<Use${screenName}State>({`,
      '    loading: false,',
      '    error: null,',
      '    data: null,',
      '  });',
      '',
      `  const submit = useCallback(async (payload: ${screenName}Request) => {`,
      '    setState(prev => ({ ...prev, loading: true, error: null }));',
      '    try {',
      `      const data = await ${screenName.toLowerCase()}Api.authenticate(payload);`,
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

    const screenFile = `src/screens/${screenName}Screen.${jsxExt}`
    const screenContent = [
      `// ${screenFile}`,
      "import React, { useState } from 'react';",
      "import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';",
      conventions.usesStyleSheet ? "import { StyleSheet } from 'react-native';" : '',
      `import { use${screenName} } from '../hooks/use${screenName}';`,
      '',
      `export function ${screenName}Screen() {`,
      `  const { submit, loading, error } = use${screenName}();`,
      "  const [email, setEmail] = useState('');",
      "  const [password, setPassword] = useState('');",
      '',
      '  const handleSubmit = () => {',
      '    submit({ email, password });',
      '  };',
      '',
      '  return (',
      '    <View style={styles.container}>',
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
      '',
      conventions.usesStyleSheet
        ? [
            'const styles = StyleSheet.create({',
            '  container: { flex: 1, justifyContent: "center", padding: 24 },',
            '  title: { fontSize: 24, fontWeight: "bold", marginBottom: 24 },',
            '  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 12 },',
            '  button: { backgroundColor: "#007AFF", padding: 16, borderRadius: 8, alignItems: "center" },',
            '  buttonText: { color: "#fff", fontWeight: "600" },',
            '  error: { color: "#FF3B30", marginBottom: 12 },',
            '});',
          ].join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n')

    const output = [
      '## Generated files',
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

    return phaseResult(
      'implementation',
      'Implementation',
      'Generate code files for the feature following project conventions.',
      output,
      [
        { type: 'engineering', title: `Service: ${ctx.prompt}`, content: serviceContent, path: serviceFile },
        { type: 'engineering', title: `Hook: ${ctx.prompt}`, content: hookContent, path: hookFile },
        { type: 'engineering', title: `Screen: ${ctx.prompt}`, content: screenContent, path: screenFile },
      ]
    )
  },
}
