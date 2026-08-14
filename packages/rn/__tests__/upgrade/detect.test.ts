import { createTempProject, cleanup } from '../helpers/tmp'
import { detectVersions, versionParts, isAtLeast, detectTooling } from '../../src/upgrade/detect'

afterEach(() => {
  // Temp dirs are cleaned by each test.
})

describe('versionParts', () => {
  it('parses major.minor.patch and major.minor', () => {
    expect(versionParts('0.76.3')).toEqual([0, 76, 3])
    expect(versionParts('0.76')).toEqual([0, 76, undefined])
    expect(versionParts('53.0.0')).toEqual([53, 0, 0])
    expect(versionParts('banana')).toBeNull()
  })
})

describe('isAtLeast', () => {
  it('compares [major, minor] pairs', () => {
    expect(isAtLeast([0, 76], [0, 76])).toBe(true)
    expect(isAtLeast([0, 76], [0, 71])).toBe(true)
    expect(isAtLeast([0, 70], [0, 71])).toBe(false)
    expect(isAtLeast(null, [0, 71])).toBe(false)
  })
})

describe('detectTooling', () => {
  it('prefers expo when the expo package is present', () => {
    const pkg = { dependencies: { expo: '52.0.0', 'react-native': '0.76.5' } }
    expect(detectTooling(pkg, '0.76.5', '52.0.0')).toBe('expo')
  })

  it('returns rn-cli for bare RN projects', () => {
    const pkg = { dependencies: { 'react-native': '0.72.5' } }
    expect(detectTooling(pkg, '0.72.5', null)).toBe('rn-cli')
  })

  it('returns null for unrelated projects', () => {
    expect(detectTooling({ dependencies: { lodash: '4.0.0' } }, null, null)).toBeNull()
  })
})

describe('detectVersions', () => {
  it('detects a bare RN CLI project with native config', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { react: '18.2.0', 'react-native': '0.72.5' },
      }),
      'android/gradle.properties': 'newArchEnabled=false\nhermesEnabled=true\n',
      'android/build.gradle': [
        'buildscript {',
        '  ext {',
        '    kotlinVersion = "1.8.10"',
        '    compileSdkVersion = 33',
        '    minSdkVersion = 21',
        '    targetSdkVersion = 33',
        '  }',
        '}',
      ].join('\n'),
      'ios/Podfile': [
        "platform :ios, :deployment_target => '13.0'",
        "target 'App' do",
        '  use_react_native!(:path => config[:reactNativePath], :hermes_enabled => true)',
        'end',
      ].join('\n'),
    })
    try {
      const v = detectVersions(dir)
      expect(v.hasPackageJson).toBe(true)
      expect(v.rnVersion).toBe('0.72.5')
      expect(v.expoVersion).toBeNull()
      expect(v.tooling).toBe('rn-cli')
      expect(v.android.hermesEnabled).toBe(true)
      expect(v.android.newArchEnabled).toBe(false)
      expect(v.android.kotlinVersion).toBe('1.8.10')
      expect(v.android.compileSdkVersion).toBe('33')
      expect(v.android.minSdkVersion).toBe('21')
      expect(v.ios.hermesEnabled).toBe(true)
      expect(v.ios.newArchFlag).toBe(false)
      expect(v.newArch?.enabled).toBe(false)
    } finally {
      cleanup(dir)
    }
  })

  it('detects an Expo project and the Podfile new-arch flag', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { expo: '52.0.0', 'react-native': '0.76.5' },
      }),
      'ios/Podfile': "ENV['RCT_NEW_ARCH_ENABLED'] == '1'\n",
      'app.json': JSON.stringify({ expo: { name: 'app', newArchEnabled: true } }),
    })
    try {
      const v = detectVersions(dir)
      expect(v.tooling).toBe('expo')
      expect(v.expoVersion).toBe('52.0.0')
      expect(v.ios.newArchFlag).toBe(true)
      expect(v.newArch?.enabled).toBe(true)
      expect(v.newArch?.sources).toContain('ios/Podfile')
    } finally {
      cleanup(dir)
    }
  })

  it('handles a project without package.json gracefully', () => {
    const dir = createTempProject({ 'README.md': 'hi' })
    try {
      const v = detectVersions(dir)
      expect(v.hasPackageJson).toBe(false)
      expect(v.tooling).toBeNull()
      expect(v.rnVersion).toBeNull()
      expect(v.android.gradleProperties).toBeNull()
      expect(v.ios.podfile).toBeNull()
    } finally {
      cleanup(dir)
    }
  })
})
