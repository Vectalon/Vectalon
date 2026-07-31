import { Scanner } from '../../src/harness/Scanner'
import { createTempProject, cleanup } from '../helpers/tmp'

const DEFAULT_FILES = {
  'package.json': JSON.stringify({
    name: 'test-app',
    version: '1.0.0',
    dependencies: {
      'react-native': '0.72.0',
      'react-native-web': '^0.19.0',
      react: '18.2.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
      '@expo/config': '^8.0.0',
    },
    scripts: { start: 'expo start' },
  }),
  'tsconfig.json': '{}',
  'metro.config.js': 'module.exports = {}',
  'src/components/ProfileCard.tsx': [
    "import React from 'react'",
    "import { View, Text, StyleSheet } from 'react-native'",
    'const ProfileCard = () => <View style={styles.container}><Text>Hi</Text></View>',
    'export default ProfileCard',
    'const styles = StyleSheet.create({ container: { flex: 1 } })',
    '',
  ].join('\n'),
  'src/utils/math.ts': 'export const add = (a: number, b: number) => a + b',
  'src/index.js': 'const x = 1\nconsole.log(x)',
}

describe('Scanner', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject(DEFAULT_FILES)
  })

  afterEach(() => {
    cleanup(dir)
  })

  describe('scanProject', () => {
    it('throws when no package.json exists', () => {
      const empty = createTempProject({})
      const scanner = new Scanner(empty)
      expect(() => scanner.scanProject()).toThrow(/No package.json/)
      cleanup(empty)
    })

    it('returns project metadata from package.json', () => {
      const info = new Scanner(dir).scanProject()
      expect(info.name).toBe('test-app')
      expect(info.version).toBe('1.0.0')
      expect(info.reactNativeVersion).toBe('0.72.0')
      expect(info.dependencies['react-native']).toBe('0.72.0')
    })

    it('detects platform support', () => {
      const info = new Scanner(dir).scanProject()
      expect(info.platforms).toContain('ios')
      expect(info.platforms).toContain('android')
      expect(info.platforms).toContain('web')
    })

    it('detects TypeScript, Metro, and Expo usage', () => {
      const info = new Scanner(dir).scanProject()
      expect(info.hasTypeScript).toBe(true)
      expect(info.hasMetro).toBe(true)
      expect(info.hasExpo).toBe(true)
    })
  })

  describe('scanStructure', () => {
    it('returns [] when the target directory does not exist', () => {
      expect(new Scanner(dir).scanStructure('missing')).toEqual([])
    })

    it('builds a file tree of the src directory', () => {
      const tree = new Scanner(dir).scanStructure()
      const paths = tree.map(n => n.path)
      expect(paths).toEqual(expect.arrayContaining(['src/components', 'src/index.js', 'src/utils']))

      const components = tree.find(n => n.path === 'src/components')
      expect(components?.type).toBe('directory')
      const files = (components?.children || []).map(n => n.path)
      expect(files).toContain('src/components/ProfileCard.tsx')
    })

    it('respects maxDepth', () => {
      const tree = new Scanner(dir).scanStructure('src', 0)
      const components = tree.find(n => n.path === 'src/components')
      expect(components?.children).toEqual([])
    })
  })

  describe('scanComponents', () => {
    it('detects component files only', () => {
      const components = new Scanner(dir).scanComponents()
      const names = components.map(c => c.name)
      expect(names).toContain('ProfileCard')
      expect(names).not.toContain('math')
      expect(names).not.toContain('index')
    })

    it('extracts component metadata', () => {
      const [card] = new Scanner(dir).scanComponents()
      expect(card).toMatchObject({
        name: 'ProfileCard',
        isDefaultExport: true,
        usesStyleSheet: true,
        usesNavigation: false,
      })
      expect(card.imports).toEqual(expect.arrayContaining(['react', 'react-native']))
    })
  })
})
