import { buildKnowledgeGraph, extractExpoRoutes, computeReRenderImpact } from '../../src/harness/KnowledgeGraph'
import { createTempProject, cleanup } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({
    name: 'test-app',
    version: '1.0.0',
    dependencies: { 'react-native': '0.72.0' },
  }),
  'src/screens/HomeScreen.tsx': [
    "import { View, Text } from 'react-native'",
    "import { useNavigation } from '@react-navigation/native'",
    "import ProfileCard from '../components/ProfileCard'",
    'const HomeScreen = () => {',
    '  const navigation = useNavigation()',
    '  useEffect(() => { track() }, [])',
    '  return <ProfileCard title="hi" />',
    '}',
    'export default HomeScreen',
    '',
  ].join('\n'),
  'src/components/ProfileCard.tsx': [
    "import { View, Text, StyleSheet } from 'react-native'",
    'const ProfileCard = ({ title }) => <View style={styles.wrap}><Text>{title}</Text></View>',
    'export default ProfileCard',
    'const styles = StyleSheet.create({ wrap: { flex: 1 } })',
    '',
  ].join('\n'),
  'src/navigation/AppNavigator.tsx': [
    "import { NavigationContainer } from '@react-navigation/native'",
    "import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'",
    'const Tabs = createBottomTabNavigator()',
    'export default function AppNavigator() {',
    '  return (',
    '    <NavigationContainer>',
    '      <Tabs.Navigator>',
    '        <Tabs.Screen name="Home" component={HomeScreen} />',
    '      </Tabs.Navigator>',
    '    </NavigationContainer>',
    '  )',
    '}',
    '',
  ].join('\n'),
  'src/native/Bridge.ts': [
    "import { NativeModules } from 'react-native'",
    'export const token = NativeModules.SecureStore',
    '',
  ].join('\n'),
  'src/utils/math.ts': 'export const add = (a: number, b: number) => a + b',
  'src/utils/storage.ios.ts': 'export const store = () => null',
  'src/utils/storage.android.ts': 'export const store = () => null',
}

describe('buildKnowledgeGraph', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject(PROJECT)
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('collects component definitions with metadata', () => {
    const graph = buildKnowledgeGraph(dir)
    const names = graph.components.map(c => c.name)
    expect(names).toContain('HomeScreen')
    expect(names).toContain('ProfileCard')
    expect(names).not.toContain('add')

    const home = graph.components.find(c => c.name === 'HomeScreen')
    expect(home).toMatchObject({
      filePath: 'src/screens/HomeScreen.tsx',
      kind: 'function',
      isDefaultExport: true,
      usesNavigation: true,
    })
    expect(home!.hooks).toEqual(expect.arrayContaining(['useNavigation', 'useEffect']))
  })

  it('builds component tree edges from JSX references', () => {
    const graph = buildKnowledgeGraph(dir)
    const home = graph.components.find(c => c.name === 'HomeScreen')!
    const card = graph.components.find(c => c.name === 'ProfileCard')!
    expect(graph.edges).toContainEqual({ from: home.id, to: card.id })
  })

  it('aggregates hook usage with dependency arrays', () => {
    const graph = buildKnowledgeGraph(dir)
    const effect = graph.hooks.find(h => h.hook === 'useEffect')
    expect(effect).toEqual(expect.objectContaining({ component: 'HomeScreen', deps: [] }))
    const nav = graph.hooks.find(h => h.hook === 'useNavigation')
    expect(nav!.component).toBe('HomeScreen')
  })

  it('extracts navigators and their screens', () => {
    const graph = buildKnowledgeGraph(dir)
    expect(graph.navigators).toEqual([
      expect.objectContaining({
        filePath: 'src/navigation/AppNavigator.tsx',
        name: 'Tabs',
        type: 'bottom-tabs',
        screens: [{ name: 'Home', component: 'HomeScreen' }],
      }),
    ])
  })

  it('records native module boundaries', () => {
    const graph = buildKnowledgeGraph(dir)
    expect(graph.nativeModules).toEqual([
      expect.objectContaining({
        filePath: 'src/native/Bridge.ts',
        modules: expect.arrayContaining(['SecureStore', 'react-native']),
      }),
    ])
  })

  it('detects platform-split variants', () => {
    const graph = buildKnowledgeGraph(dir)
    expect(graph.platformVariants).toEqual([
      expect.objectContaining({
        base: 'src/utils/storage',
        variants: expect.arrayContaining(['src/utils/storage.ios.ts', 'src/utils/storage.android.ts']),
      }),
    ])
  })

  it('returns an empty graph for a missing src dir', () => {
    const empty = buildKnowledgeGraph(dir, 'missing')
    expect(empty).toEqual({
      components: [],
      edges: [],
      hooks: [],
      navigators: [],
      nativeModules: [],
      stores: [],
      expoRoutes: [],
      reRenderImpact: [],
      platformVariants: [],
    })
  })

  it('skips unparseable files without failing the scan', () => {
    const broken = createTempProject({
      'package.json': '{}',
      'src/broken.tsx': 'const = = =',
    })
    const graph = buildKnowledgeGraph(broken)
    expect(graph.components).toEqual([])
    cleanup(broken)
  })

  it('extracts hook body references and unstable deps for guardrails', () => {
    const d = createTempProject({
      'package.json': '{}',
      'src/Screen.tsx': [
        'const Screen = ({ userId }) => {',
        '  useEffect(() => {',
        '    fetchProfile(userId)',
        '    trackEvent(userId)',
        '  }, [userId])',
        '  const memo = useMemo(() => config.x, [config.x, { fresh: true }])',
        '  return <View />',
        '}',
      ].join('\n'),
    })
    try {
      const graph = buildKnowledgeGraph(d)
      const effect = graph.hooks.find(h => h.hook === 'useEffect')!
      expect(effect.bodyRefs).toEqual(expect.arrayContaining(['userId', 'fetchProfile', 'trackEvent']))
      // Missing dep: trackEvent is referenced but not in [userId].
      const missing = (effect.bodyRefs || []).filter(r => !(effect.deps || []).includes(r))
      expect(missing).toContain('trackEvent')
      const memo = graph.hooks.find(h => h.hook === 'useMemo')!
      expect(memo.unstableDeps).toEqual(expect.arrayContaining(['{ … }']))
    } finally {
      cleanup(d)
    }
  })

  it('aggregates state stores with their consumers', () => {
    const d = createTempProject({
      'package.json': '{}',
      'src/store/auth.ts': [
        "import { create } from 'zustand'",
        'export const useAuthStore = create((set) => ({ token: null }))',
      ].join('\n'),
      'src/store/count.ts': [
        "import { atom } from 'jotai'",
        'export const countAtom = atom(0)',
      ].join('\n'),
      'src/screens/LoginScreen.tsx': [
        "import { useAuthStore } from '../store/auth'",
        "import { useAtom } from 'jotai'",
        "import { countAtom } from '../store/count'",
        'const LoginScreen = () => {',
        '  const token = useAuthStore((s) => s.token)',
        '  const [count] = useAtom(countAtom)',
        '  return <View />',
        '}',
      ].join('\n'),
    })
    try {
      const graph = buildKnowledgeGraph(d)
      const auth = graph.stores.find(s => s.name === 'useAuthStore')
      expect(auth).toMatchObject({ kind: 'zustand', filePath: 'src/store/auth.ts' })
      expect(auth!.consumers).toEqual(
        expect.arrayContaining([{ component: 'LoginScreen', filePath: 'src/screens/LoginScreen.tsx' }])
      )
      const count = graph.stores.find(s => s.name === 'countAtom')
      expect(count!.kind).toBe('jotai')
      expect(count!.consumers.map(c => c.component)).toContain('LoginScreen')
    } finally {
      cleanup(d)
    }
  })

  it('extracts expo-router file-based routes', () => {
    const d = createTempProject({
      'package.json': JSON.stringify({ dependencies: { expo: '~52.0.0', 'expo-router': '~4.0.0' } }),
      'app/_layout.tsx': [
        "import { Stack } from 'expo-router'",
        'export default function RootLayout() { return <Stack /> }',
      ].join('\n'),
      'app/index.tsx': [
        'export default function Home() { return null }',
      ].join('\n'),
      'app/profile/[id].tsx': [
        'export default function Profile() { return null }',
      ].join('\n'),
      'app/(tabs)/settings.tsx': [
        'export default function Settings() { return null }',
      ].join('\n'),
    })
    try {
      const routes = extractExpoRoutes(d)
      const byRoute = Object.fromEntries(routes.map(r => [r.route, r]))
      expect(byRoute['/']).toMatchObject({ filePath: 'app/index.tsx', isLayout: false, component: 'Home' })
      expect(byRoute['/profile/[id]']).toMatchObject({ dynamicSegments: ['id'], component: 'Profile' })
      expect(byRoute['/(tabs)/settings']).toMatchObject({ groups: ['tabs'], component: 'Settings' })
      expect(byRoute['/_layout']).toMatchObject({ isLayout: true })
    } finally {
      cleanup(d)
    }
  })

  it('computes re-render impact: shared components reachable from multiple screens', () => {
    const d = createTempProject({
      'package.json': '{}',
      'src/components/SharedHeader.tsx': 'const SharedHeader = () => null\nexport default SharedHeader',
      'src/screens/HomeScreen.tsx': [
        "import SharedHeader from '../components/SharedHeader'",
        'const HomeScreen = () => <SharedHeader />',
        'export default HomeScreen',
      ].join('\n'),
      'src/screens/SettingsScreen.tsx': [
        "import SharedHeader from '../components/SharedHeader'",
        'const SettingsScreen = () => <SharedHeader />',
        'export default SettingsScreen',
      ].join('\n'),
      'src/nav/App.tsx': [
        "import { createNativeStackNavigator } from '@react-navigation/native-stack'",
        'const Stack = createNativeStackNavigator()',
        'export default function App() {',
        '  return <Stack.Navigator>',
        '    <Stack.Screen name="Home" component={HomeScreen} />',
        '    <Stack.Screen name="Settings" component={SettingsScreen} />',
        '  </Stack.Navigator>',
        '}',
      ].join('\n'),
    })
    try {
      const graph = buildKnowledgeGraph(d)
      const shared = graph.reRenderImpact.find(i => i.name === 'SharedHeader')
      expect(shared).toBeDefined()
      expect(shared!.parents).toHaveLength(2)
      // Both screens render SharedHeader -> re-render blast radius is both.
      const screenNames = shared!.screens.map(id => {
        const c = graph.components.find(c => c.id === id)
        return c?.name
      })
      expect(screenNames).toEqual(expect.arrayContaining(['HomeScreen', 'SettingsScreen']))
    } finally {
      cleanup(d)
    }
  })

  it('computeReRenderImpact leaves non-shared components out', () => {
    const d = createTempProject({
      'package.json': '{}',
      'src/Screen.tsx': 'const Screen = () => null\nexport default Screen',
    })
    try {
      const graph = buildKnowledgeGraph(d)
      expect(graph.reRenderImpact).toEqual([])
      expect(computeReRenderImpact(graph)).toEqual([])
    } finally {
      cleanup(d)
    }
  })
})
