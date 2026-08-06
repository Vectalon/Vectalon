import { parseSource, analyzeSourceFile, walk } from '../../src/harness/AstScanner'

describe('parseSource', () => {
  it('parses TypeScript and TSX', () => {
    expect(parseSource('const a: number = 1', 'a.ts')).not.toBeNull()
    expect(parseSource('const el = <View />', 'a.tsx')).not.toBeNull()
  })

  it('parses JSX and plain JS', () => {
    expect(parseSource('const el = <Text>hi</Text>', 'a.jsx')).not.toBeNull()
    expect(parseSource('const x = 1', 'a.js')).not.toBeNull()
  })

  it('parses flow-typed JSX files', () => {
    expect(parseSource('const el: React.Node = <Text>hi</Text>', 'a.jsx')).not.toBeNull()
  })

  it('falls back to plain JSX when flow fails', () => {
    // Flow type syntax is valid in .js files; the parser should accept it.
    expect(parseSource('const x: number = 1', 'a.js')).not.toBeNull()
  })

  it('returns null for unparseable content instead of throwing', () => {
    expect(parseSource('const = = =', 'broken.tsx')).toBeNull()
    expect(parseSource('function {', 'broken.js')).toBeNull()
  })
})

describe('analyzeSourceFile — imports & exports', () => {
  it('extracts default, named, and namespace imports', () => {
    const analysis = analyzeSourceFile(
      [
        "import React, { useState, useEffect as useEff } from 'react'",
        "import * as RN from 'react-native'",
        "import DefaultThing from './Thing'",
      ].join('\n'),
      'a.tsx'
    )
    expect(analysis).not.toBeNull()
    expect(analysis!.imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'react', defaultName: 'React', named: ['useState', 'useEff'] }),
        expect.objectContaining({ source: 'react-native', namespace: 'RN' }),
        expect.objectContaining({ source: './Thing', defaultName: 'DefaultThing' }),
      ])
    )
  })

  it('tracks dynamic imports', () => {
    const analysis = analyzeSourceFile("const mod = import('./Lazy')", 'a.tsx')
    expect(analysis!.imports).toEqual([expect.objectContaining({ source: './Lazy', dynamic: true })])
  })

  it('extracts named exports, default exports, and re-exports', () => {
    const analysis = analyzeSourceFile(
      [
        'export const add = (a: number, b: number) => a + b',
        'export interface Point { x: number }',
        'export default function Home() { return null }',
        "export { other } from './other'",
        "export * from './utils'",
      ].join('\n'),
      'a.ts'
    )
    expect(analysis!.exports).toEqual(
      expect.arrayContaining([
        { name: 'add', kind: 'named' },
        { name: 'Point', kind: 'named' },
        { name: 'Home', kind: 'default' },
        { name: './other', kind: 're-export' },
        { name: './utils', kind: 'all' },
      ])
    )
  })
})

describe('analyzeSourceFile — component detection', () => {
  it('detects arrow-function components and skips plain utilities', () => {
    const analysis = analyzeSourceFile(
      [
        "import { View } from 'react-native'",
        'const ProfileCard = () => <View />',
        'export default ProfileCard',
        'export const add = (a: number, b: number) => a + b',
      ].join('\n'),
      'ProfileCard.tsx'
    )
    const names = analysis!.components.map(c => c.name)
    expect(names).toContain('ProfileCard')
    expect(names).not.toContain('add')
    const card = analysis!.components.find(c => c.name === 'ProfileCard')
    expect(card).toMatchObject({ kind: 'function', isDefaultExport: true, children: [] })
  })

  it('detects function-declaration and class components', () => {
    const analysis = analyzeSourceFile(
      [
        "import React from 'react'",
        'function Greeting() { return <Text>hi</Text> }',
        'class Counter extends React.Component { render() { return null } }',
        'class NotAComponent { helper() {} }',
      ].join('\n'),
      'components.tsx'
    )
    const names = analysis!.components.map(c => c.name)
    expect(names).toContain('Greeting')
    expect(names).toContain('Counter')
    expect(names).not.toContain('NotAComponent')
  })

  it('records child JSX element references', () => {
    const analysis = analyzeSourceFile(
      [
        'const Parent = () => <ChildList items={[]} />',
        'const ChildList = ({ items }) => <View />',
      ].join('\n'),
      'Parent.tsx'
    )
    const parent = analysis!.components.find(c => c.name === 'Parent')
    expect(parent!.children).toContain('ChildList')
    const child = analysis!.components.find(c => c.name === 'ChildList')
    expect(child!.children).toEqual([])
  })

  it('detects HOC wrappers on the default export', () => {
    const analysis = analyzeSourceFile(
      [
        "import { withNavigation } from '@react-navigation/native'",
        'const Home = () => <View />',
        'export default withNavigation(Home)',
      ].join('\n'),
      'Home.tsx'
    )
    const home = analysis!.components.find(c => c.name === 'Home')
    expect(home!.hocs).toEqual(['withNavigation'])
    expect(home!.isDefaultExport).toBe(true)
  })

  it('detects redux connect()(Component) wrapped exports', () => {
    const analysis = analyzeSourceFile(
      [
        "import { connect } from 'react-redux'",
        'const Profile = () => <View />',
        'export default connect(mapState, mapDispatch)(Profile)',
      ].join('\n'),
      'Profile.tsx'
    )
    const profile = analysis!.components.find(c => c.name === 'Profile')
    expect(profile!.hocs).toEqual(['connect'])
    expect(profile!.isDefaultExport).toBe(true)
  })

  it('detects memo()/forwardRef() wrapped component definitions', () => {
    const analysis = analyzeSourceFile(
      [
        "import React, { memo, forwardRef } from 'react'",
        'const Memoized = memo(() => <View />)',
        'const Forwarded = forwardRef((props, ref) => <View />)',
      ].join('\n'),
      'Wrapped.tsx'
    )
    const names = analysis!.components.map(c => c.name)
    expect(names).toContain('Memoized')
    expect(names).toContain('Forwarded')
  })
})

describe('analyzeSourceFile — hooks', () => {
  it('extracts hook calls and dependency arrays', () => {
    const analysis = analyzeSourceFile(
      [
        'function useProfile(id: string) {',
        '  const [user, setUser] = useState(null)',
        '  useEffect(() => { fetch(id) }, [id, user])',
        '  const memo = useMemo(() => id, [id])',
        '  return user',
        '}',
        'const ProfileScreen = () => {',
        '  const navigation = useNavigation()',
        '  return <View />',
        '}',
      ].join('\n'),
      'Profile.tsx'
    )
    const effect = analysis!.hooks.find(h => h.hook === 'useEffect')
    expect(effect).toEqual(expect.objectContaining({ hook: 'useEffect', component: 'useProfile', deps: ['id', 'user'] }))
    const memo = analysis!.hooks.find(h => h.hook === 'useMemo')
    expect(memo!.deps).toEqual(['id'])
    const nav = analysis!.hooks.find(h => h.hook === 'useNavigation')
    expect(nav!.component).toBe('ProfileScreen')

    const profile = analysis!.components.find(c => c.name === 'ProfileScreen')
    expect(profile!.hooks).toEqual(expect.arrayContaining(['useNavigation']))
  })

  it('tracks body references for missing-deps analysis and flags unstable deps', () => {
    const analysis = analyzeSourceFile(
      [
        'const Screen = ({ userId }) => {',
        '  useEffect(() => {',
        '    fetchProfile(userId)',
        '    trackEvent(userId)',
        '  }, [userId])',
        '  const memo = useMemo(() => config.filters, [config.filters, { fresh: true }])',
        '  return <View />',
        '}',
      ].join('\n'),
      'Screen.tsx'
    )
    const effect = analysis!.hooks.find(h => h.hook === 'useEffect')!
    // `trackEvent` is used in the body but missing from deps — the missing-dep
    // signal guardrails need. Property keys/member props are excluded.
    expect(effect.bodyRefs).toEqual(expect.arrayContaining(['userId', 'fetchProfile', 'trackEvent']))
    expect(effect.bodyRefs).not.toContain('filters')
    expect(effect.deps).toEqual(['userId'])

    const memo = analysis!.hooks.find(h => h.hook === 'useMemo')!
    expect(memo.deps).toEqual(['config.filters', '{ … }'])
    // The object literal dep is recreated every render.
    expect(memo.unstableDeps).toEqual(expect.arrayContaining(['{ … }']))
  })

  it('detects zustand / jotai / context store definitions', () => {
    const analysis = analyzeSourceFile(
      [
        "import { create } from 'zustand'",
        "import { atom } from 'jotai'",
        "import { createContext } from 'react'",
        'const useAuthStore = create((set) => ({ token: null }))',
        'const countAtom = atom(0)',
        'const ThemeContext = createContext(null)',
        '// user-defined create must NOT be flagged',
        "const myCreate = require('other')",
        'const notAStore = myCreate(1)',
      ].join('\n'),
      'stores.tsx'
    )
    expect(analysis!.stores).toEqual(
      expect.arrayContaining([
        { name: 'useAuthStore', kind: 'zustand' },
        { name: 'countAtom', kind: 'jotai' },
        { name: 'ThemeContext', kind: 'context' },
      ])
    )
    // The user-defined create call is not imported from zustand — not a store.
    expect(analysis!.stores).not.toContainEqual({ name: 'notAStore', kind: 'zustand' })
  })

  it('detects zustand v4 create()() store definitions', () => {
    const analysis = analyzeSourceFile(
      [
        "import { create } from 'zustand'",
        'const useStore = create()((set) => ({ count: 0 }))',
      ].join('\n'),
      'counter.ts'
    )
    expect(analysis!.stores).toContainEqual({ name: 'useStore', kind: 'zustand' })
  })

  it('tracks which components consume which stores', () => {
    const analysis = analyzeSourceFile(
      [
        "import { useAtom } from 'jotai'",
        "import { createContext, useContext } from 'react'",
        'const countAtom = atom(0)',
        'const ThemeContext = createContext(null)',
        'const Counter = () => {',
        '  const [count, setCount] = useAtom(countAtom)',
        '  return <View />',
        '}',
        'const Themed = () => {',
        '  const theme = useContext(ThemeContext)',
        '  return <View />',
        '}',
      ].join('\n'),
      'consumers.tsx'
    )
    expect(analysis!.storeUsages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ store: 'countAtom', hook: 'useAtom', component: 'Counter' }),
        expect.objectContaining({ store: 'ThemeContext', hook: 'useContext', component: 'Themed' }),
      ])
    )
  })

  it('flags expo-router imports for file-based route detection', () => {
    const analysis = analyzeSourceFile(
      [
        "import { Stack } from 'expo-router'",
        'export default function Layout() {',
        '  return <Stack />',
        '}',
      ].join('\n'),
      'app/_layout.tsx'
    )
    expect(analysis!.usesExpoRouter).toBe(true)
    expect(analyzeSourceFile('import { View } from "react-native"', 'a.tsx')!.usesExpoRouter).toBe(false)
  })

  it('marks navigator-container components', () => {
    const analysis = analyzeSourceFile(
      [
        "import { createNativeStackNavigator } from '@react-navigation/native-stack'",
        'const Stack = createNativeStackNavigator()',
        'const AppNav = () => {',
        '  return <Stack.Navigator><Stack.Screen name="Home" component={Home} /></Stack.Navigator>',
        '}',
        'const Plain = () => <View />',
      ].join('\n'),
      'Nav.tsx'
    )
    expect(analysis!.components.find(c => c.name === 'AppNav')!.isNavigatorContainer).toBe(true)
    expect(analysis!.components.find(c => c.name === 'Plain')!.isNavigatorContainer).toBe(false)
  })
})

describe('analyzeSourceFile — navigation', () => {
  it('detects navigators, screens, and the container', () => {
    const analysis = analyzeSourceFile(
      [
        "import { NavigationContainer } from '@react-navigation/native'",
        "import { createNativeStackNavigator } from '@react-navigation/native-stack'",
        'const Stack = createNativeStackNavigator()',
        'export default function App() {',
        '  return (',
        '    <NavigationContainer>',
        '      <Stack.Navigator>',
        '        <Stack.Screen name="Home" component={HomeScreen} />',
        '        <Stack.Screen name="Settings" component={SettingsScreen} />',
        '      </Stack.Navigator>',
        '    </NavigationContainer>',
        '  )',
        '}',
      ].join('\n'),
      'App.tsx'
    )
    expect(analysis!.navigation.hasContainer).toBe(true)
    expect(analysis!.navigation.navigators).toEqual([
      {
        name: 'Stack',
        type: 'native-stack',
        screens: [
          { name: 'Home', component: 'HomeScreen' },
          { name: 'Settings', component: 'SettingsScreen' },
        ],
      },
    ])
    expect(analysis!.usesNavigation).toBe(true)
  })
})

describe('analyzeSourceFile — native modules & platform', () => {
  it('detects NativeModules and TurboModuleRegistry usage', () => {
    const analysis = analyzeSourceFile(
      [
        "import { NativeModules, TurboModuleRegistry } from 'react-native'",
        'const m1 = NativeModules.SomeNativeModule',
        'const m2 = TurboModuleRegistry.get("CoolNative")',
      ].join('\n'),
      'native/bridge.ts'
    )
    expect(analysis!.nativeModules).toEqual(expect.arrayContaining(['SomeNativeModule', 'CoolNative', 'react-native']))
  })

  it('detects platform-specific file variants', () => {
    expect(analyzeSourceFile('export const a = 1', 'x.ios.ts')!.platform).toBe('ios')
    expect(analyzeSourceFile('export const a = 1', 'x.android.ts')!.platform).toBe('android')
    expect(analyzeSourceFile('export const a = 1', 'x.native.ts')!.platform).toBe('native')
    expect(analyzeSourceFile('export const a = 1', 'x.ts')!.platform).toBe('universal')
  })

  it('flags StyleSheet.create usage as a file convention', () => {
    const analysis = analyzeSourceFile(
      'const styles = StyleSheet.create({ wrap: { flex: 1 } })',
      'styled.tsx'
    )
    expect(analysis!.usesStyleSheet).toBe(true)
  })
})

describe('walk', () => {
  it('visits every node in document order', () => {
    const ast = parseSource('const a = 1', 'a.ts')!
    const types: string[] = []
    walk(ast, n => types.push(n.type))
    expect(types).toContain('Program')
    expect(types).toContain('VariableDeclaration')
    expect(types).toContain('NumericLiteral')
  })
})
