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

  it('ignores bare imports, follows dynamic import(), and strips query/hash suffixes', () => {
    const code = `require("react-native"); require("./x.js?version=1"); require("./y#frag"); import("./lazy"); import("expo-font");`
    expect(extractRelativeRequires(code)).toEqual(['./x.js', './y', './lazy'])
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

describe('renderInSandbox — extended Expo stubs (gesture-handler, reanimated, expo-font)', () => {
  it('renders gesture-handler + reanimated surfaces (Animated.View, shared values, entering presets)', async () => {
    const result = await renderInSandbox({
      files: [
        {
          path: 'App.tsx',
          content: [
            `import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';`,
            `import Animated, { useSharedValue, useAnimatedStyle, withTiming, FadeIn } from 'react-native-reanimated';`,
            `import { Text } from 'react-native';`,
            `export default function App() {`,
            `  const x = useSharedValue(0);`,
            `  const style = useAnimatedStyle(() => ({ transform: [{ translateX: withTiming(x.value) }] }));`,
            `  const pan = Gesture.Pan().onStart(() => {}).activeOffsetX(10);`,
            `  return <GestureHandlerRootView><GestureDetector gesture={pan}><Animated.View entering={FadeIn.duration(300)} style={style}><Text>Animated card</Text></Animated.View></GestureDetector></GestureHandlerRootView>;`,
            `}`,
          ].join('\n'),
        },
      ],
      entry: 'App.tsx',
      timeoutMs: 15_000,
    })
    expect(result.ok).toBe(true)
    const flat = JSON.stringify(result.tree)
    expect(flat).toContain('Animated.View')
    expect(flat).toContain('Animated card')
  })

  it('renders expo-font useFonts gating with vector-icons and linear-gradient', async () => {
    const result = await renderInSandbox({
      files: [
        {
          path: 'App.tsx',
          content: [
            `import { useFonts } from 'expo-font';`,
            `import { Ionicons } from '@expo/vector-icons';`,
            `import { LinearGradient } from 'expo-linear-gradient';`,
            `import Constants from 'expo-constants';`,
            `import { Text } from 'react-native';`,
            `export default function App() {`,
            `  const [loaded] = useFonts({});`,
            `  if (!loaded) return null;`,
            `  return <LinearGradient colors={['#000', '#fff']}><Ionicons name="cart" size={24} /><Text>Fonts ready</Text></LinearGradient>;`,
            `}`,
          ].join('\n'),
        },
      ],
      entry: 'App.tsx',
      timeoutMs: 15_000,
    })
    expect(result.ok).toBe(true)
    const flat = JSON.stringify(result.tree)
    expect(flat).toContain('Fonts ready')
    expect(flat).toContain('Ionicons')
    expect(flat).toContain('LinearGradient')
  })
})

describe('renderInSandbox — expo-router (app-router) stubs', () => {
  it('renders an app-router screen using Stack/Tabs/Link and the routing hooks', async () => {
    const result = await renderInSandbox({
      files: [
        {
          path: 'app/index.tsx',
          content: [
            `import { Stack, Tabs, Link, useRouter, useLocalSearchParams, usePathname } from 'expo-router';`,
            `import { Stack as StackSub } from 'expo-router/stack';`,
            `import { Text, View } from 'react-native';`,
            `export default function Home() {`,
            `  const router = useRouter();`,
            `  const params = useLocalSearchParams();`,
            `  const pathname = usePathname();`,
            `  return <View>`,
            `    <Text>Path: {pathname}</Text>`,
            `    <Text>Id: {String(params.id || 'none')}</Text>`,
            `    <Link href="/cart">Open cart</Link>`,
            `    <Stack><Stack.Screen name="index" options={{ title: 'Home' }} /></Stack>`,
            `    <Tabs><Tabs.Screen name="home" options={{ title: 'Home' }} /></Tabs>`,
            `    <StackSub><StackSub.Screen name="extra" /></StackSub>`,
            `  </View>;`,
            `}`,
          ].join('\n'),
        },
      ],
      entry: 'app/index.tsx',
      timeoutMs: 15_000,
    })
    expect(result.ok).toBe(true)
    const flat = JSON.stringify(result.tree)
    expect(flat).toContain('Path: ')
    expect(flat).toContain('"none"')
    expect(flat).toContain('Open cart')
    expect(flat).toContain('"Link"')
    expect(flat).toContain('"Stack.Screen"')
    expect(flat).toContain('"Tabs.Screen"')
  })

  it('renders a layout entry whose Stack/Tabs render their Screen config children', async () => {
    const result = await renderInSandbox({
      files: [
        {
          path: 'app/_layout.tsx',
          content: [
            `import { Stack } from 'expo-router';`,
            `import { GestureHandlerRootView } from 'react-native-gesture-handler';`,
            `export default function RootLayout() {`,
            `  return <GestureHandlerRootView><Stack>`,
            `    <Stack.Screen name="index" options={{ title: 'Home' }} />`,
            `    <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />`,
            `  </Stack></GestureHandlerRootView>;`,
            `}`,
          ].join('\n'),
        },
      ],
      entry: 'app/_layout.tsx',
      timeoutMs: 15_000,
    })
    expect(result.ok).toBe(true)
    const flat = JSON.stringify(result.tree)
    expect(flat).toContain('"Stack"')
    expect(flat).toContain('product/[id]')
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
