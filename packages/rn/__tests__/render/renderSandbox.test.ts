/**
 * renderInSandbox — Expo package stubs + relative import-graph discovery
 * Business Source License 1.1 (BSL-1.1)
 *
 * The sandbox denies network and has no node_modules, so real Expo apps must
 * render against the curated shim stubs (expo-status-bar, safe-area,
 * react-navigation) and the entry's relative import graph must be compiled
 * in — otherwise `vectalon render --entry App.tsx` dies on the first bare or
 * relative import it cannot resolve.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { renderInSandbox, extractRelativeRequires, resolveRelativeFile } from '../../src/render'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('extractRelativeRequires', () => {
  it('finds relative requires in compiled CJS output', () => {
    const code = [
      `const _ui = require("./src/components/ui");`,
      `const _nav = require("../navigation/AppNavigator").AppNavigator;`,
      `const _svc = require('./services/AuthApi');`,
    ].join('\n')
    expect(extractRelativeRequires(code)).toEqual([
      './src/components/ui',
      '../navigation/AppNavigator',
      './services/AuthApi',
    ])
  })

  it('ignores bare imports and strips query/hash suffixes', () => {
    const code = `require("react-native"); require("./x.js?version=1"); require("./y#frag");`
    expect(extractRelativeRequires(code)).toEqual(['./x.js', './y'])
  })
})

describe('resolveRelativeFile', () => {
  it('resolves extensionless, exact, and index imports', () => {
    const dir = createTempProject({
      'src/Home.tsx': 'export default 1',
      'src/screens/index.tsx': 'export default 2',
      'src/util.ts': 'export default 3',
    })
    try {
      expect(resolveRelativeFile(dir, 'src', './Home')).toBe('src/Home.tsx')
      expect(resolveRelativeFile(dir, 'src', './util.ts')).toBe('src/util.ts')
      expect(resolveRelativeFile(dir, 'src', './screens')).toBe('src/screens/index.tsx')
      expect(resolveRelativeFile(dir, '.', './src/Home.tsx')).toBe('src/Home.tsx')
      expect(resolveRelativeFile(dir, 'src', './Missing')).toBeNull()
    } finally {
      cleanup(dir)
    }
  })
})

describe('renderInSandbox — Expo package stubs', () => {
  it('renders an entry importing expo-status-bar and safe-area context', async () => {
    const result = await renderInSandbox({
      files: [
        {
          path: 'App.tsx',
          content: [
            `import { StatusBar } from 'expo-status-bar';`,
            `import { SafeAreaProvider } from 'react-native-safe-area-context';`,
            `import { Text } from 'react-native';`,
            `export default function App() { return <SafeAreaProvider><Text>Expo stub render</Text><StatusBar style="auto" /></SafeAreaProvider> }`,
          ].join('\n'),
        },
      ],
      entry: 'App.tsx',
      timeoutMs: 15_000,
    })
    expect(result.ok).toBe(true)
    const flat = JSON.stringify(result.tree)
    expect(flat).toContain('Expo stub render')
    expect(flat).toContain('StatusBar')
  })

  it('renders a native-stack navigator whose screens render their components', async () => {
    const result = await renderInSandbox({
      files: [
        {
          path: 'App.tsx',
          content: [
            `import { createNativeStackNavigator } from '@react-navigation/native-stack';`,
            `import { NavigationContainer } from '@react-navigation/native';`,
            `import { Text } from 'react-native';`,
            `const Stack = createNativeStackNavigator();`,
            `function Home() { return <Text>Dashboard</Text> }`,
            `export default function App() { return <NavigationContainer><Stack.Navigator><Stack.Screen name="Home" component={Home} /></Stack.Navigator></NavigationContainer> }`,
          ].join('\n'),
        },
      ],
      entry: 'App.tsx',
      timeoutMs: 15_000,
    })
    expect(result.ok).toBe(true)
    const flat = JSON.stringify(result.tree)
    expect(flat).toContain('Dashboard')
    expect(flat).toContain('Home')
  })
})

describe('renderInSandbox — relative import graph', () => {
  it('compiles the entry plus its relative module graph and renders the result', async () => {
    const dir = createTempProject({
      'App.tsx': [
        `import { SafeAreaProvider } from 'react-native-safe-area-context';`,
        `import Home from './src/Home';`,
        `export default function App() { return <SafeAreaProvider><Home /></SafeAreaProvider> }`,
      ].join('\n'),
      'src/Home.tsx': [
        `import { View, Text } from 'react-native';`,
        `import { useCartCount } from './hooks/useCartCount';`,
        `export default function Home() { const n = useCartCount(); return <View><Text>Cart: {n}</Text></View> }`,
      ].join('\n'),
      'src/hooks/useCartCount.ts': `export function useCartCount() { return 3 }`,
    })
    try {
      const result = await renderInSandbox({
        files: [{ path: 'App.tsx', content: readFileSync(join(dir, 'App.tsx'), 'utf-8') }],
        entry: 'App.tsx',
        projectRoot: dir,
        timeoutMs: 15_000,
      })
      expect(result.ok).toBe(true)
      expect(result.compiled.length).toBe(3)
      expect(result.compiled.every(c => c.ok)).toBe(true)
      const flat = JSON.stringify(result.tree)
      expect(flat).toContain('Cart: ')
      expect(flat).toContain(',3')
    } finally {
      cleanup(dir)
    }
  })
})
