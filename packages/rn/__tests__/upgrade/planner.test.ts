import { readFileSync } from 'fs'
import { createTempProject, cleanup } from '../helpers/tmp'
import { planUpgrade, resolveTarget } from '../../src/upgrade/planner'
import { analyzeUpgradeImpact } from '../../src/upgrade/impact'
import { detectVersions } from '../../src/upgrade/detect'

const FIXTURE: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { react: '18.2.0', 'react-native': '0.72.5' },
  }),
  'android/gradle.properties': 'newArchEnabled=false\n',
  'android/build.gradle': [
    'buildscript {',
    '  ext {',
    '    kotlinVersion = "1.8.10"',
    '    compileSdkVersion = 33',
    '    minSdkVersion = 21',
    '    targetSdkVersion = 33',
    '  }',
    '}',
    'enableHermes true',
  ].join('\n'),
  'ios/Podfile': [
    "platform :ios, :deployment_target => '13.0'",
    "ENV['RCT_NEW_ARCH_ENABLED'] = '0'",
    "target 'App' do",
    '  use_react_native!(:path => config[:reactNativePath], :hermes_enabled => true)',
    'end',
  ].join('\n'),
  'src/legacy.js': [
    "import { NativeModules } from 'react-native'",
    "import { requireNativeComponent } from 'react-native'",
    'const NativeThing = requireNativeComponent("NativeThing")',
    'export const M = NativeModules.MyModule',
  ].join('\n'),
}

describe('resolveTarget', () => {
  it('accepts RN semver targets', () => {
    expect(resolveTarget('0.76', 'rn-cli')).toEqual({ target: '0.76.0', error: null })
    expect(resolveTarget('0.76.3', 'rn-cli')).toEqual({ target: '0.76.3', error: null })
  })

  it('accepts Expo SDK targets', () => {
    expect(resolveTarget('53', 'expo')).toEqual({ target: '53', error: null })
  })

  it('defaults to latest known when omitted', () => {
    expect(resolveTarget(undefined, 'rn-cli')?.target).toBe('0.81.0')
    expect(resolveTarget('latest', 'expo')?.target).toBe('53')
  })

  it('rejects garbage targets', () => {
    expect(resolveTarget('banana', 'rn-cli')?.error).toContain('Could not parse')
    expect(resolveTarget('7', 'rn-cli')?.error).toBeTruthy()
  })
})

describe('planUpgrade', () => {
  it('produces a deterministic plan with steps, edits, and risk', () => {
    const dir = createTempProject(FIXTURE)
    try {
      const plan = planUpgrade(dir, { to: '0.76', dryRun: true })
      expect(plan.errors).toEqual([])
      expect(plan.target).toBe('0.76.0')
      expect(plan.tooling).toBe('rn-cli')
      const ids = plan.steps.map(s => s.id)
      expect(ids).toContain('dep-react-native')
      expect(ids).toContain('dep-react')
      expect(ids).toContain('rn-070-hermes-flag')
      expect(ids).toContain('rn-071-newarch-flag')
      expect(ids).toContain('rn-070-codegen-native-component')
      expect(plan.impact.length).toBeGreaterThan(0)
      expect(plan.totalRisk).toBeGreaterThan(0)
      // dry-run: nothing on disk
      const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf-8'))
      expect(pkg.dependencies['react-native']).toBe('0.72.5')
    } finally {
      cleanup(dir)
    }
  })

  it('marks risky codemods as review (not applied without --force)', () => {
    const dir = createTempProject(FIXTURE)
    try {
      const plan = planUpgrade(dir, { to: '0.77', dryRun: true })
      const review = plan.steps.filter(s => s.kind === 'review')
      expect(review.some(s => s.id === 'rn-077-android-build-requirements')).toBe(true)
      expect(review.some(s => s.id === 'rn-074-android-sdk-levels')).toBe(true)
      expect(plan.reviewSteps).toBeGreaterThan(0)
    } finally {
      cleanup(dir)
    }
  })

  it('reports a friendly error for non-RN directories', () => {
    const dir = createTempProject({ 'README.md': 'hello' })
    try {
      const plan = planUpgrade(dir, {})
      expect(plan.errors.join(' ')).toContain('No package.json')
      expect(plan.steps).toEqual([])
    } finally {
      cleanup(dir)
    }
  })

  it('refuses to plan when package.json exists but is not an RN/Expo project', () => {
    // Regression: a package.json without react-native/expo (e.g. the tool's
    // own repo, or a plain JS app) must never produce codemod steps — that
    // guard is what prevents accidental repo-root applies.
    const dir = createTempProject({ 'package.json': JSON.stringify({ name: 'not-rn', dependencies: { lodash: '4.0.0' } }) })
    try {
      const plan = planUpgrade(dir, { to: '0.76', apply: true })
      expect(plan.errors.join(' ')).toContain('No React Native / Expo project detected')
      expect(plan.steps).toEqual([])
      expect(plan.edits).toEqual([])
      expect(plan.applied).toBe(false)
    } finally {
      cleanup(dir)
    }
  })

  it('detects react-native in peerDependencies (RN libraries)', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'my-rn-lib',
        version: '1.0.0',
        peerDependencies: { react: '18.2.0', 'react-native': '0.72.5' },
      }),
    })
    try {
      const versions = detectVersions(dir)
      expect(versions.rnVersion).toBe('0.72.5')
      expect(versions.tooling).toBe('rn-cli')
    } finally {
      cleanup(dir)
    }
  })

  it('keeps planning when the target is newer than the catalog', () => {
    const dir = createTempProject(FIXTURE)
    try {
      const plan = planUpgrade(dir, { to: '0.99', dryRun: true })
      expect(plan.errors.some(e => e.includes('newer than this catalog'))).toBe(true)
      expect(plan.steps.length).toBeGreaterThan(0)
    } finally {
      cleanup(dir)
    }
  })
})

describe('analyzeUpgradeImpact', () => {
  it('finds native modules, bridge usage, and deprecated APIs', () => {
    const dir = createTempProject({
      ...FIXTURE,
      'src/notifications.js': 'import { PushNotificationIOS } from \'react-native\'\n',
      'src/ui.js': 'UIManager.setLayoutAnimationEnabledExperimental(true)\n',
    })
    try {
      const versions = detectVersions(dir)
      const findings = analyzeUpgradeImpact(versions, '0.76.0')
      const patterns = findings.map(f => f.pattern)
      expect(patterns).toContain('NativeModules')
      expect(patterns).toContain('requireNativeComponent')
      expect(patterns).toContain('UIManager (bridge)')
      expect(patterns).toContain('PushNotificationIOS')
      // New Arch default target: native modules are high risk.
      const native = findings.find(f => f.pattern === 'NativeModules' && f.file === 'src/legacy.js')
      expect(native?.risk).toBe('high')
      expect(native?.newArchRelated).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('lowers native-module risk when the target is pre-0.76', () => {
    const dir = createTempProject(FIXTURE)
    try {
      const versions = detectVersions(dir)
      const findings = analyzeUpgradeImpact(versions, '0.74.0')
      const native = findings.find(f => f.pattern === 'NativeModules' && f.file === 'src/legacy.js')
      expect(native?.risk).toBe('medium')
    } finally {
      cleanup(dir)
    }
  })
})
