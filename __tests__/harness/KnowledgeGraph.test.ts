import { buildKnowledgeGraph } from '../../src/harness/KnowledgeGraph'
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
    expect(empty).toEqual({ components: [], edges: [], hooks: [], navigators: [], nativeModules: [], platformVariants: [] })
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
})
