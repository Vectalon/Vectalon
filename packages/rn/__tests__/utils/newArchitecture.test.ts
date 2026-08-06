import { detectNewArchitecture, findTurboModuleSpecs, newArchitectureLabel, isNewArchitectureEnabled } from '../../src/utils/newArchitecture'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('detectNewArchitecture', () => {
  let dir: string

  afterEach(() => {
    cleanup(dir)
  })

  function project(files: Record<string, string>, pkg: Record<string, unknown> = {}): { root: string; pkg: Record<string, unknown> } {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: {}, ...pkg }),
      ...files,
    })
    return { root: dir, pkg: { name: 'app', version: '1.0.0', dependencies: {}, ...pkg } }
  }

  it('enables New Arch from android/gradle.properties newArchEnabled=true', () => {
    const { root, pkg } = project({ 'android/gradle.properties': 'newArchEnabled=true\n' }, { dependencies: { 'react-native': '0.74.5' } })
    const info = detectNewArchitecture(root, pkg)
    expect(info.enabled).toBe(true)
    expect(info.sources).toContain('android/gradle.properties')
  })

  it('disables New Arch from android/gradle.properties newArchEnabled=false', () => {
    const { root, pkg } = project({ 'android/gradle.properties': 'newArchEnabled=false\n' })
    expect(detectNewArchitecture(root, pkg).enabled).toBe(false)
  })

  it('supports the enableNewArchitecture alias flag', () => {
    const { root, pkg } = project({ 'android/gradle.properties': 'enableNewArchitecture=true\n' })
    expect(detectNewArchitecture(root, pkg).enabled).toBe(true)
  })

  it('enables New Arch from Podfile RCT_NEW_ARCH_ENABLED == 1', () => {
    const { root, pkg } = project({
      'ios/Podfile': [
        "ENV['RCT_NEW_ARCH_ENABLED'] == '1'",
        'use_react_native!(:path => config[:reactNativePath])',
      ].join('\n'),
    })
    expect(detectNewArchitecture(root, pkg).enabled).toBe(true)
    expect(detectNewArchitecture(root, pkg).sources).toContain('ios/Podfile')
  })

  it('disables New Arch from Podfile RCT_NEW_ARCH_ENABLED == 0', () => {
    const { root, pkg } = project({ 'ios/Podfile': "ENV['RCT_NEW_ARCH_ENABLED'] == '0'\n" })
    expect(detectNewArchitecture(root, pkg).enabled).toBe(false)
  })

  it('honors react-native.config.js explicit newArchEnabled key', () => {
    const { root, pkg } = project({ 'react-native.config.js': 'module.exports = { newArchEnabled: true }\n' })
    expect(detectNewArchitecture(root, pkg).enabled).toBe(true)
  })

  it('honors Expo app.json newArchEnabled key', () => {
    const { root, pkg } = project({ 'app.json': JSON.stringify({ expo: { name: 'app', newArchEnabled: true } }) })
    expect(detectNewArchitecture(root, pkg).enabled).toBe(true)
  })

  it('defaults to enabled for RN >= 0.76 when no explicit flag exists', () => {
    const { root, pkg } = project({}, { dependencies: { 'react-native': '0.76.5' } })
    expect(detectNewArchitecture(root, pkg).enabled).toBe(true)
  })

  it('defaults to disabled for RN 0.71-0.75 without an enabling flag', () => {
    const { root, pkg } = project({}, { dependencies: { 'react-native': '0.74.5' } })
    expect(detectNewArchitecture(root, pkg).enabled).toBe(false)
  })

  it('defaults to disabled for RN < 0.71', () => {
    const { root, pkg } = project({}, { dependencies: { 'react-native': '0.70.1' } })
    expect(detectNewArchitecture(root, pkg).enabled).toBe(false)
  })

  it('defaults to enabled for Expo SDK >= 53', () => {
    const { root, pkg } = project({}, { dependencies: { expo: '~53.0.0' } })
    expect(detectNewArchitecture(root, pkg).enabled).toBe(true)
  })

  it('explicit gradle flag wins over the RN version default', () => {
    const { root, pkg } = project(
      { 'android/gradle.properties': 'newArchEnabled=false\n' },
      { dependencies: { 'react-native': '0.76.5' } }
    )
    expect(detectNewArchitecture(root, pkg).enabled).toBe(false)
  })

  it('returns null when nothing can be determined', () => {
    const { root, pkg } = project({})
    const info = detectNewArchitecture(root, pkg)
    expect(info.enabled).toBeNull()
    expect(info.reason).toContain('No New Architecture signals')
  })

  it('finds TurboModule TypeScript specs under src/', () => {
    const { root } = project({
      'src/native/NativeCalendar.ts': 'export default TurboModuleRegistry.get(\'Calendar\')',
      'src/native/CalendarSpec.ts': 'export interface CalendarSpec extends TurboModule {}',
      'src/native/NotASpec.ts': 'export const x = 1',
      'src/components/Home.tsx': 'export const Home = () => null',
    })
    expect(findTurboModuleSpecs(root)).toEqual(['CalendarSpec', 'NativeCalendar'])
  })
})

describe('newArchitectureLabel / isNewArchitectureEnabled', () => {
  it('labels enabled / disabled / unknown / undefined', () => {
    expect(newArchitectureLabel({ enabled: true, sources: [], reason: '', turboModuleSpecs: [] })).toContain('enabled')
    expect(newArchitectureLabel({ enabled: false, sources: [], reason: '', turboModuleSpecs: [] })).toContain('disabled')
    expect(newArchitectureLabel({ enabled: null, sources: [], reason: '', turboModuleSpecs: [] })).toBe('unknown')
    expect(newArchitectureLabel(undefined)).toBe('unknown')
  })

  it('isNewArchitectureEnabled is true only for enabled', () => {
    expect(isNewArchitectureEnabled({ enabled: true, sources: [], reason: '', turboModuleSpecs: [] })).toBe(true)
    expect(isNewArchitectureEnabled({ enabled: false, sources: [], reason: '', turboModuleSpecs: [] })).toBe(false)
    expect(isNewArchitectureEnabled(undefined)).toBe(false)
  })
})
