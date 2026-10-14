import { benchmarkSnapshot } from '../../src/bench/snapshot'
import { detectConventions } from '../../src/workflows/phases/helpers'

describe('benchmark project context', () => {
  it('uses fixture packages instead of inventing an empty RN project', () => {
    const snapshot = benchmarkSnapshot({ 'package.json': JSON.stringify({
      name: 'expo-demo', version: '2.0.0',
      dependencies: { react: '19.0.0', 'react-native': '0.79.0', expo: '~53.0.0', '@react-navigation/native': '^7.0.0' },
      devDependencies: { typescript: '^5.0.0' }, scripts: { test: 'jest' },
    }) })
    expect(snapshot.project).toMatchObject({ name: 'expo-demo', version: '2.0.0', reactVersion: '19.0.0',
      reactNativeVersion: '0.79.0', hasExpo: true, tooling: 'expo', expoSdkVersion: '~53.0.0', scripts: { test: 'jest' } })
    expect(detectConventions(snapshot).hasNavigation).toBe(true)
  })

  it.each(['{', 'null', '[]', '{"dependencies": null, "scripts": []}'])('handles invalid fixture metadata: %s', manifest => {
    const snapshot = benchmarkSnapshot({ 'package.json': manifest })
    expect(snapshot.project.dependencies).toEqual({})
    expect(snapshot.project.name).toBe('rn-bench-app')
    expect(detectConventions(snapshot).hasNavigation).toBe(false)
  })

  it('ignores non-string package entries and detects development navigation dependencies', () => {
    const snapshot = benchmarkSnapshot({ 'package.json': JSON.stringify({
      dependencies: { react: 19, invalid: {} }, devDependencies: { '@react-navigation/native': '^7.0.0' },
    }) })
    expect(snapshot.project.dependencies).toEqual({})
    expect(detectConventions(snapshot).hasNavigation).toBe(true)
  })
})
