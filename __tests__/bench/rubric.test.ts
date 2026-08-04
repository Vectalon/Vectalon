import {
  rubricChecks,
  runRubric,
  rubricAdherence,
  formatRubricResult,
  runScenario,
} from '../../src/bench'
import type { BenchScenario, RubricCheck } from '../../src/bench'
import { SCENARIO_SPEC_VERSION } from '../../src/bench'

function tsxFile(content: string, path = 'src/screens/TestScreen.tsx') {
  return { path, content }
}

function validScenario(overrides: Partial<BenchScenario> = {}): BenchScenario {
  return {
    id: 'rn-test',
    specVersion: SCENARIO_SPEC_VERSION,
    suite: 'core-ui',
    title: 'Test scenario',
    prompt: 'Create a test screen',
    scaffoldable: true,
    fixtures: {},
    expect: { files: [], behaviors: [] },
    correctness: { tests: false, typecheck: false, lint: false },
    axes: ['adherence', 'guardrails'],
    ...overrides,
  }
}

const checkById = (id: string): RubricCheck => {
  const check = rubricChecks.find(c => c.id === id)
  if (!check) throw new Error(`missing rubric check: ${id}`)
  return check
}

describe('rubric check inventory', () => {
  it('has exactly 16 checks with unique ids', () => {
    expect(rubricChecks.length).toBe(16)
    const ids = rubricChecks.map(c => c.id)
    expect(new Set(ids).size).toBe(16)
    for (const c of rubricChecks) {
      expect(c.name).toBeTruthy()
      expect(c.description).toBeTruthy()
    }
  })

  it('covers the plan items 1-16', () => {
    const ids = rubricChecks.map(c => c.id).sort()
    expect(ids).toContain('keyboard-avoiding-view')
    expect(ids).toContain('virtualized-lists')
    expect(ids).toContain('safe-area')
    expect(ids).toContain('typed-navigation')
    expect(ids).toContain('platform-api')
    expect(ids).toContain('stylesheet-create')
    expect(ids).toContain('remote-image-handling')
    expect(ids).toContain('accessibility')
    expect(ids).toContain('error-states')
    expect(ids).toContain('immutable-updates')
    expect(ids).toContain('hook-deps')
    expect(ids).toContain('memoization')
    expect(ids).toContain('design-tokens')
    expect(ids).toContain('deep-links')
    expect(ids).toContain('fetch-states')
    expect(ids).toContain('no-removed-native-traces')
  })
})

describe('rubric per-check behavior', () => {
  it('keyboard-avoiding-view: requires KeyboardAvoidingView with TextInput', () => {
    const check = checkById('keyboard-avoiding-view')
    const bad = tsxFile("import { TextInput } from 'react-native';\nexport const F = () => <TextInput placeholder='x' />;")
    const good = tsxFile("import { KeyboardAvoidingView, TextInput } from 'react-native';\nexport const F = () => <KeyboardAvoidingView behavior='padding'><TextInput /></KeyboardAvoidingView>;")
    const alsoGood = tsxFile("import { TextInput, Keyboard } from 'react-native';\nexport const F = () => <TextInput onFocus={() => Keyboard.dismiss()} />;")
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
    expect(check.check({ filePath: alsoGood.path, content: alsoGood.content }).passed).toBe(true)
  })

  it('virtualized-lists: FlatList/SectionList instead of plain .map', () => {
    const check = checkById('virtualized-lists')
    const bad = tsxFile('export const F = () => <View>{items.map(i => <Text key={i.id}>{i.name}</Text>)}</View>;')
    const good = tsxFile('export const F = () => <FlatList data={items} renderItem={({item}) => <Text>{item.name}</Text>} />;')
    const sectioned = tsxFile('export const F = () => <SectionList sections={sections} renderItem={({item}) => <Text>{item}</Text>} />;')
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
    expect(check.check({ filePath: sectioned.path, content: sectioned.content }).passed).toBe(true)
  })

  it('safe-area: screens use SafeAreaView or insets', () => {
    const check = checkById('safe-area')
    const bad = tsxFile('export function HomeScreen() { return <View />; }', 'src/screens/HomeScreen.tsx')
    const good = tsxFile("import { SafeAreaView } from 'react-native';\nexport function HomeScreen() { return <SafeAreaView />; }", 'src/screens/HomeScreen.tsx')
    const insets = tsxFile("import { useSafeAreaInsets } from 'react-native-safe-area-context';\nexport function HomeScreen() { const i = useSafeAreaInsets(); return <View style={{paddingTop: i.top}} />; }", 'src/screens/HomeScreen.tsx')
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
    expect(check.check({ filePath: insets.path, content: insets.content }).passed).toBe(true)
  })

  it('typed-navigation: route.params requires typed props', () => {
    const check = checkById('typed-navigation')
    const bad = tsxFile("import { useRoute } from '@react-navigation/native';\nexport function Settings() { const route = useRoute(); return <Text>{route.params.id}</Text>; }")
    const good = tsxFile("import type { NativeStackScreenProps } from '@react-navigation/native-stack';\ntype Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;\nexport function Settings({ route }: Props) { return <Text>{route.params.id}</Text>; }")
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
  })

  it('platform-api: uses Platform.OS/select for branching', () => {
    const check = checkById('platform-api')
    const bad = tsxFile("const isIOS = process.env.PLATFORM === 'ios';\nexport const F = () => <View />;")
    const good = tsxFile("import { Platform } from 'react-native';\nexport const F = () => <View style={Platform.OS === 'ios' ? a : b} />;")
    const select = tsxFile("import { Platform } from 'react-native';\nconst s = Platform.select({ ios: a, android: b });")
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
    expect(check.check({ filePath: select.path, content: select.content }).passed).toBe(true)
  })

  it('stylesheet-create: no inline style objects', () => {
    const check = checkById('stylesheet-create')
    const bad = tsxFile('export const F = () => <View style={{ flex: 1 }} />;')
    const good = tsxFile("import { StyleSheet } from 'react-native';\nexport const F = () => <View style={styles.root} />;\nconst styles = StyleSheet.create({ root: { flex: 1 } });")
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
  })

  it('remote-image-handling: remote sources need onError/caching', () => {
    const check = checkById('remote-image-handling')
    const bad = tsxFile("export const F = () => <Image source={{ uri: 'https://cdn.example.com/a.png' }} />;")
    const good = tsxFile("export const F = () => <Image source={{ uri: 'https://cdn.example.com/a.png' }} onError={h} defaultSource={placeholder} />;")
    const cache = tsxFile("import FastImage from 'react-native-fast-image';\nexport const F = () => <FastImage source={{ uri: 'https://cdn.example.com/a.png', cache: FastImage.cacheControl.immutable }} />;")
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
    expect(check.check({ filePath: cache.path, content: cache.content }).passed).toBe(true)
  })

  it('accessibility: interactive elements carry labels or roles', () => {
    const check = checkById('accessibility')
    const bad = tsxFile('export const F = () => <TouchableOpacity onPress={go}><Text>Go</Text></TouchableOpacity>;')
    const good = tsxFile("export const F = () => <TouchableOpacity accessibilityLabel='Go' onPress={go}><Text>Go</Text></TouchableOpacity>;")
    const role = tsxFile("export const F = () => <Pressable accessibilityRole='button' onPress={go}><Text>Go</Text></Pressable>;")
    const decorative = tsxFile('export const F = () => <TouchableOpacity accessible={false} onPress={go}><Icon /></TouchableOpacity>;')
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
    expect(check.check({ filePath: role.path, content: role.content }).passed).toBe(true)
    expect(check.check({ filePath: decorative.path, content: decorative.content }).passed).toBe(true)
  })

  it('error-states: async work has try/catch and user-visible error', () => {
    const check = checkById('error-states')
    const bad = tsxFile('async function load() { const r = await fetch(API); return r.json(); }')
    const partial = tsxFile('async function load() { try { const r = await fetch(API); } catch (e) { console.log(e); } }')
    const good = tsxFile('async function load() { try { const r = await fetch(API); setData(r); } catch (e) { setError(e.message); } }')
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: partial.path, content: partial.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
  })

  it('immutable-updates: no push/splice/sort on state', () => {
    const check = checkById('immutable-updates')
    const bad = tsxFile('export function F() { const [items, setItems] = useState([]); items.push(x); return <View />; }')
    const good = tsxFile('export function F() { const [items, setItems] = useState([]); setItems([...items, x]); return <View />; }')
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
  })

  it('hook-deps: hooks include dependency arrays', () => {
    const check = checkById('hook-deps')
    const bad = tsxFile('export function F() { useEffect(() => { fetchData(); }); return <View />; }')
    const good = tsxFile('export function F() { useEffect(() => { fetchData(); }, [id]); return <View />; }')
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
  })

  it('memoization: heavy work is memoized', () => {
    const check = checkById('memoization')
    const bad = tsxFile('export function F() { const sorted = items.slice().sort((a,b) => a-b); return <View />; }')
    const good = tsxFile('export function F() { const sorted = useMemo(() => items.slice().sort((a,b) => a-b), [items]); return <View />; }')
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
  })

  it('design-tokens: colors come from tokens, not literals', () => {
    const check = checkById('design-tokens')
    const bad = tsxFile("export const F = () => <View style={{ backgroundColor: '#FF5733' }} />;")
    const good = tsxFile("import { colors } from '../theme';\nexport const F = () => <View style={{ backgroundColor: colors.primary }} />;")
    const tokenFile = tsxFile("export const primary = '#FF5733';", 'src/theme/colors.ts')
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
    expect(check.applicable ? check.applicable({ filePath: tokenFile.path, content: tokenFile.content }) : false).toBe(false)
  })

  it('deep-links: routing table over ad-hoc openURL', () => {
    const check = checkById('deep-links')
    const bad = tsxFile("import { Linking } from 'react-native';\nexport function go() { Linking.openURL('myapp://settings'); }")
    const good = tsxFile("import { Linking } from 'react-native';\nexport const linking = { prefixes: ['myapp://'], config: { screens: { Settings: 'settings' } } };\nexport function setup() { Linking.addEventListener('url', handler); }")
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
  })

  it('fetch-states: loading, empty, and error states', () => {
    const check = checkById('fetch-states')
    const bad = tsxFile('async function load() { const r = await fetch(API); return r.json(); }')
    const good = tsxFile("export function F() { const { data, isLoading, isError } = useQuery('k', fetchData); return isLoading ? <Spinner/> : data.length === 0 ? <Empty/> : isError ? <ErrorView/> : <List/>; }")
    expect(check.check({ filePath: bad.path, content: bad.content }).passed).toBe(false)
    expect(check.check({ filePath: good.path, content: good.content }).passed).toBe(true)
  })

  it('no-removed-native-traces: fails native config that still references a removed dependency', () => {
    const check = checkById('no-removed-native-traces')
    const opts = { filePath: 'ios/Podfile', content: "pod 'AppCenter', :path => '../node_modules/appcenter/ios'\npod 'React', :path => '../node_modules/react-native/ReactCommon'\n", removedDependencies: ['appcenter'] }
    const result = check.check(opts)
    expect(result.passed).toBe(false)
    expect(result.message).toContain('appcenter')
    expect(result.line).toBe(1)
  })

  it('no-removed-native-traces: fails gradle includes, maven deps, and manifest providers', () => {
    const check = checkById('no-removed-native-traces')
    const settings = check.check({ filePath: 'android/settings.gradle', content: "include ':app'\ninclude ':appcenter'\n", removedDependencies: ['appcenter'] })
    const build = check.check({ filePath: 'android/app/build.gradle', content: "dependencies {\n  implementation 'com.microsoft.appcenter:appcenter:5.0.3'\n}\n", removedDependencies: ['appcenter'] })
    const manifest = check.check({ filePath: 'android/app/src/main/AndroidManifest.xml', content: '<provider android:name="com.microsoft.appcenter.utils.AppCenterInitializer" />\n', removedDependencies: ['appcenter'] })
    expect(settings.passed).toBe(false)
    expect(build.passed).toBe(false)
    expect(manifest.passed).toBe(false)
  })

  it('no-removed-native-traces: passes clean config and is N/A without removedDependencies or on JS files', () => {
    const check = checkById('no-removed-native-traces')
    const cleanPodfile = check.check({ filePath: 'ios/Podfile', content: "pod 'React', :path => '../node_modules/react-native/ReactCommon'\n", removedDependencies: ['appcenter'] })
    expect(cleanPodfile.passed).toBe(true)

    // No removed dependencies declared → not applicable.
    expect(check.applicable ? check.applicable({ filePath: 'ios/Podfile', content: "pod 'AppCenter'\n" }) : false).toBe(false)
    // JS files are not native config → never applicable.
    expect(check.applicable ? check.applicable({ filePath: 'src/App.tsx', content: "import AppCenter from 'appcenter';\n", removedDependencies: ['appcenter'] }) : false).toBe(false)
    // Comment mentions don't count as traces.
    const commented = check.check({ filePath: 'ios/Podfile', content: "# pod 'AppCenter' removed\npod 'React', :path => '../node_modules/react-native/ReactCommon'\n", removedDependencies: ['appcenter'] })
    expect(commented.passed).toBe(true)
  })

  it('no-removed-native-traces: skips block-comment continuation lines mentioning the dep', () => {
    const check = checkById('no-removed-native-traces')
    const gradle = [
      '/*',
      'this comment mentions appcenter',
      '*/',
      'dependencies {',
      "  implementation 'com.example:ghostlib:1.0.0'",
      '}',
    ].join('\n')
    const commented = check.check({ filePath: 'android/app/build.gradle', content: gradle, removedDependencies: ['appcenter'] })
    expect(commented.passed).toBe(true)

    const xml = [
      '<!--',
      '  appcenter provider removed by cleanup',
      '-->',
      '<provider android:name="com.example.Other" />',
    ].join('\n')
    const xmlCommented = check.check({ filePath: 'android/app/src/main/AndroidManifest.xml', content: xml, removedDependencies: ['appcenter'] })
    expect(xmlCommented.passed).toBe(true)

    // A real trace outside comments still fails.
    const realTrace = check.check({ filePath: 'android/app/build.gradle', content: "dependencies {\n  implementation 'com.microsoft.appcenter:appcenter:5.0.3'\n}\n", removedDependencies: ['appcenter'] })
    expect(realTrace.passed).toBe(false)
  })

  it('runRubric threads removedDependencies into the native-traces check', () => {
    const dirty = runRubric(
      [{ path: 'ios/Podfile', content: "pod 'AppCenter', :path => '../node_modules/appcenter/ios'\n" }],
      { removedDependencies: ['appcenter'] }
    )
    expect(dirty.overall).toBe(0)
    expect(dirty.files[0].failed).toBe(1)
    expect(dirty.files[0].checks[0].id).toBe('no-removed-native-traces')

    const clean = runRubric(
      [{ path: 'ios/Podfile', content: "pod 'React', :path => '../node_modules/react-native/ReactCommon'\n" }],
      { removedDependencies: ['appcenter'] }
    )
    expect(clean.overall).toBe(1)
  })
})

describe('runRubric aggregation', () => {
  it('scores applicable checks and ignores N/A files', () => {
    const files = [
      tsxFile('export const F = () => <View />;'),
      // non-component utility: most checks not applicable
      { path: 'src/utils/math.ts', content: 'export const add = (a: number, b: number) => a + b;' },
    ]
    const result = runRubric(files)
    expect(result.overall).not.toBeNull()
    expect(result.files).toHaveLength(2)
    expect(result.files[0].applicable).toBeGreaterThan(0)
    expect(result.files[1].applicable).toBe(0)
  })

  it('returns null overall when nothing is applicable', () => {
    const result = runRubric([{ path: 'src/utils/math.ts', content: 'export const add = (a: number, b: number) => a + b;' }])
    expect(result.overall).toBeNull()
  })

  it('aggregates passed/applicable across files into a 0-1 ratio', () => {
    const good = tsxFile("import { SafeAreaView, StyleSheet, Text } from 'react-native';\nexport function HomeScreen() { return <SafeAreaView style={styles.root}><Text>hi</Text></SafeAreaView>; }\nconst styles = StyleSheet.create({ root: { flex: 1 } });", 'src/screens/HomeScreen.tsx')
    const bad = tsxFile('export function Bad() { const [items, setItems] = useState([]); items.push(1); return <View style={{ flex: 1 }} />; }')
    const result = runRubric([good, bad])
    expect(result.overall as number).toBeGreaterThan(0)
    expect(result.overall as number).toBeLessThan(1)
    expect(result.files[0].failed).toBe(0)
    expect(result.files[1].failed).toBeGreaterThan(0)
  })

  it('rubricAdherence mirrors runRubric overall', () => {
    const files = [tsxFile('export const F = () => <View />;')]
    expect(rubricAdherence(files)).toBe(runRubric(files).overall)
    expect(rubricAdherence([])).toBeNull()
  })

  it('formatRubricResult renders a markdown summary with failed checks', () => {
    const result = runRubric([tsxFile('export const F = () => <View style={{ flex: 1 }} />;')])
    const md = formatRubricResult(result)
    expect(md).toContain('Adherence:')
    expect(md).toContain('stylesheet-create')
  })
})

describe('runner integration', () => {
  it('scores adherence by default via the rubric', async () => {
    const run = await runScenario(validScenario(), {
      generate: () => [
        { path: 'src/screens/HomeScreen.tsx', content: "import { SafeAreaView } from 'react-native';\nexport function HomeScreen() { return <SafeAreaView />; }" },
      ],
    })
    expect(run.axes.adherence).not.toBeNull()
    expect(run.axes.adherence as number).toBeGreaterThanOrEqual(0)
    expect(run.axes.adherence as number).toBeLessThanOrEqual(1)
  })

  it('still honors a custom rubric seam', async () => {
    const run = await runScenario(validScenario(), {
      generate: () => [{ path: 'src/x.ts', content: 'export const x = 1;' }],
      rubric: () => 0.75,
    })
    expect(run.axes.adherence).toBe(0.75)
  })

  it('composite uses the rubric adherence when present', async () => {
    const run = await runScenario(validScenario(), {
      generate: () => [
        { path: 'src/screens/HomeScreen.tsx', content: "import { SafeAreaView, StyleSheet } from 'react-native';\nexport function HomeScreen() { return <SafeAreaView style={styles.root} />; }\nconst styles = StyleSheet.create({ root: { flex: 1 } });" },
      ],
      rubric: () => 0.9,
    })
    expect(run.composite).not.toBeNull()
  })
})
