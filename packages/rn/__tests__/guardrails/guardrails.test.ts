import { runGuardrails } from '../../src/guardrails'

describe('guardrails', () => {
  it('passes for a clean screen component', () => {
    const result = runGuardrails({
      filePath: 'src/screens/HomeScreen.tsx',
      content: [
        "import { Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';",
        '',
        'export function HomeScreen(): JSX.Element {',
        '  return (',
        '    <SafeAreaView style={styles.container}>',
        '      <Text>Hello</Text>',
        '      <Pressable onPress={() => {}} accessibilityLabel="Go">',
        '        <Text>Go</Text>',
        '      </Pressable>',
        '    </SafeAreaView>',
        '  );',
        '}',
        '',
        'const styles = StyleSheet.create({ container: { flex: 1 } });',
      ].join('\n'),
    })

    expect(result.ok).toBe(true)
    expect(result.failed).toBe(0)
  })

  it('flags console.log as error', () => {
    const result = runGuardrails({
      filePath: 'src/utils/debug.ts',
      content: 'export function log() { console.log("debug"); }',
    })

    const finding = result.findings.find(f => f.rule === 'No console.log statements')
    expect(finding).toBeDefined()
    expect(finding?.passed).toBe(false)
    expect(finding?.severity).toBe('error')
    expect(result.ok).toBe(false)
  })

  it('flags inline styles as warning', () => {
    const result = runGuardrails({
      filePath: 'src/screens/Bad.tsx',
      content: 'export function Bad() { return <View style={{ flex: 1 }} />; }',
    })

    const finding = result.findings.find(f => f.rule === 'No inline style objects in JSX')
    expect(finding).toBeDefined()
    expect(finding?.passed).toBe(false)
    expect(finding?.severity).toBe('warning')
  })

  it('flags hardcoded URL as error', () => {
    const result = runGuardrails({
      filePath: 'src/api/client.ts',
      content: 'const BASE_URL = "https://api.example.com/v1";',
    })

    const finding = result.findings.find(f => f.rule === 'No hardcoded API URLs')
    expect(finding).toBeDefined()
    expect(finding?.passed).toBe(false)
    expect(finding?.severity).toBe('error')
  })

  it('flags missing accessibility label', () => {
    const result = runGuardrails({
      filePath: 'src/screens/Bad.tsx',
      content: [
        "import { TouchableOpacity } from 'react-native';",
        'export function Bad() { return <TouchableOpacity onPress={() => {}}><Text>Tap</Text></TouchableOpacity>; }',
      ].join('\n'),
    })

    const finding = result.findings.find(f => f.rule === 'Interactive elements have accessibility labels')
    expect(finding).toBeDefined()
    expect(finding?.passed).toBe(false)
  })

  it('flags missing safe area on a screen', () => {
    const result = runGuardrails({
      filePath: 'src/screens/BadScreen.tsx',
      content: [
        "import { View } from 'react-native';",
        'export function BadScreen(): JSX.Element { return <View />; }',
      ].join('\n'),
    })

    const finding = result.findings.find(f => f.rule === 'Screens use SafeAreaView or safe-area-aware layout')
    expect(finding).toBeDefined()
    expect(finding?.passed).toBe(false)
  })

  it('flags any type', () => {
    const result = runGuardrails({
      filePath: 'src/types.ts',
      content: 'export function log(value: any) { return value; }',
    })

    const finding = result.findings.find(f => f.rule === 'No explicit any types')
    expect(finding).toBeDefined()
    expect(finding?.passed).toBe(false)
  })

  it('flags TouchableOpacity with use-pressable', () => {
    const result = runGuardrails({
      filePath: 'src/screens/Bad.tsx',
      content:
        "import { TouchableOpacity } from 'react-native';\nexport function Bad() { return <TouchableOpacity onPress={() => {}} accessibilityLabel=\"Go\"><Text>Go</Text></TouchableOpacity>; }",
    })

    const finding = result.findings.find(f => f.rule === 'Prefer Pressable over TouchableOpacity')
    expect(finding).toBeDefined()
    expect(finding?.passed).toBe(false)
    expect(finding?.severity).toBe('warning')
  })

  it('flags leaked falsy renders with no-leaked-render', () => {
    const result = runGuardrails({
      filePath: 'src/screens/Bad.tsx',
      content: 'export function Bad() { return <View>{error && <Text>{error.message}</Text>}</View>; }',
    })

    const finding = result.findings.find(f => f.rule === 'No leaked falsy values in JSX')
    expect(finding).toBeDefined()
    expect(finding?.passed).toBe(false)
    expect(finding?.severity).toBe('warning')
  })

  it('respects the no-leaked-render escape hatches', () => {
    const coerced = runGuardrails({
      filePath: 'src/screens/Ok.tsx',
      content: 'export function Ok() { return <View>{!!error && <Text>x</Text>}</View>; }',
    })
    const coercedFinding = coerced.findings.find(f => f.rule === 'No leaked falsy values in JSX')
    expect(coercedFinding).toBeDefined()
    expect(coercedFinding?.passed).toBe(true)

    const ternary = runGuardrails({
      filePath: 'src/screens/Ok.tsx',
      content: 'export function Ok() { return <View>{error ? <Text>{error.message}</Text> : null}</View>; }',
    })
    const ternaryFinding = ternary.findings.find(f => f.rule === 'No leaked falsy values in JSX')
    expect(ternaryFinding).toBeDefined()
    expect(ternaryFinding?.passed).toBe(true)
  })

  it('flags deprecated AsyncStorage import', () => {
    const result = runGuardrails({
      filePath: 'src/storage.ts',
      content: "import { AsyncStorage } from 'react-native';\nexport function save() { AsyncStorage.setItem('k', 'v'); }",
    })

    const finding = result.findings.find(f => f.rule === 'No deprecated React Native APIs')
    expect(finding).toBeDefined()
    expect(finding?.passed).toBe(false)
  })

  it('flags var declaration', () => {
    const result = runGuardrails({
      filePath: 'src/legacy.ts',
      content: 'export function run() { var x = 1; return x; }',
    })

    const finding = result.findings.find(f => f.rule === 'No var declarations')
    expect(finding).toBeDefined()
    expect(finding?.passed).toBe(false)
  })

  it('flags loose equality', () => {
    const result = runGuardrails({
      filePath: 'src/compare.ts',
      content: 'export function eq(a: string, b: string) { return a == b; }',
    })

    const finding = result.findings.find(f => f.rule === 'Use strict equality operators')
    expect(finding).toBeDefined()
    expect(finding?.passed).toBe(false)
  })

  it('flags default export of a component', () => {
    const result = runGuardrails({
      filePath: 'src/screens/Bad.tsx',
      content: 'export default function Bad() { return null; }',
    })

    const finding = result.findings.find(f => f.rule === 'Components are exported as named exports')
    expect(finding).toBeDefined()
    expect(finding?.passed).toBe(false)
  })
})
