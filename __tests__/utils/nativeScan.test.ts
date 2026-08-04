import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { scanNativeReferences, stripNativeReferences, nativePackageTokens } from '../../src/utils/nativeScan'

function makeProject(files: Record<string, string>): string {
  const dir = join(tmpdir(), `vectalon-native-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  return dir
}

describe('nativePackageTokens', () => {
  it('generates raw, concatenated, and PascalCase tokens', () => {
    const tokens = nativePackageTokens('appcenter-analytics')
    expect(tokens).toContain('appcenter-analytics')
    expect(tokens).toContain('appcenteranalytics')
    // Pascal variant matches any casing (matching is case-insensitive),
    // so it catches AppCenterAnalytics / appcenterAnalytics in native files.
    expect(tokens.some(t => t.toLowerCase() === 'appcenteranalytics')).toBe(true)
  })

  it('handles scoped packages without emitting ambiguous bare react-native tokens', () => {
    const tokens = nativePackageTokens('@sentry/react-native')
    expect(tokens).toContain('@sentry/react-native')
    // A bare `react-native` token would false-positive on every unrelated
    // node_modules/react-native-* path — it must never be emitted.
    expect(tokens).not.toContain('react-native')
    expect(tokens).not.toContain('ReactNative')
  })
})

describe('scanNativeReferences', () => {
  it('finds pod declarations in the iOS Podfile', () => {
    const dir = makeProject({
      'ios/Podfile': "require_relative '../node_modules/react-native/scripts/react_native_pods'\n\npod 'AppCenter', :path => '../node_modules/appcenter/ios'\npod 'React', :path => '../node_modules/react-native/ReactCommon'\n",
    })
    const refs = scanNativeReferences(dir, ['appcenter'])
    const podRefs = refs.filter(r => r.kind === 'pod' && r.file === 'ios/Podfile')
    expect(podRefs).toHaveLength(1)
    expect(podRefs[0].line).toBe(3)
    rmSync(dir, { recursive: true, force: true })
  })

  it('finds gradle includes and native imports', () => {
    const dir = makeProject({
      'android/settings.gradle': "rootProject.name = 'App'\ninclude ':app'\ninclude ':appcenter'\nproject(':appcenter').projectDir = new File(rootProject.projectDir, '../node_modules/appcenter/android')\n",
      'android/app/src/main/java/com/app/MainApplication.kt': 'import com.microsoft.appcenter.AppCenter\nimport com.microsoft.appcenter.analytics.Analytics\n\nclass MainApplication : Application() {\n  override fun onCreate() {\n    AppCenter.start(applicationContext, "secret", Analytics::class.java)\n  }\n}\n',
    })
    const refs = scanNativeReferences(dir, ['appcenter'])
    const gradle = refs.filter(r => r.file === 'android/settings.gradle')
    const imports = refs.filter(r => r.file.includes('MainApplication.kt') && r.kind === 'import')
    const code = refs.filter(r => r.file.includes('MainApplication.kt') && r.kind === 'code')
    expect(gradle.length).toBeGreaterThanOrEqual(2)
    expect(imports.length).toBeGreaterThanOrEqual(2)
    expect(code.length).toBeGreaterThanOrEqual(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('does not flag unrelated packages', () => {
    const dir = makeProject({
      'ios/Podfile': "pod 'Firebase', :path => '../node_modules/@react-native-firebase/app/ios'\n",
    })
    const refs = scanNativeReferences(dir, ['appcenter'])
    expect(refs).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('never strips unrelated react-native-* pods when removing a react-native-suffixed package', () => {
    const dir = makeProject({
      'ios/Podfile': [
        "pod 'Sentry', :path => '../node_modules/@sentry/react-native/ios'",
        "pod 'RNBlobUtil', :path => '../node_modules/react-native-blob-util/ios'",
        "pod 'RNGestureHandler', :path => '../node_modules/react-native-gesture-handler/ios'",
      ].join('\n'),
    })

    const result = stripNativeReferences(dir, ['@sentry/react-native'])
    const podfile = readFileSync(join(dir, 'ios/Podfile'), 'utf-8')
    // The target pod is removed; unrelated react-native-* pods survive.
    expect(podfile).not.toContain('@sentry/react-native')
    expect(podfile).toContain('react-native-blob-util')
    expect(podfile).toContain('react-native-gesture-handler')
    expect(result.removed.some(r => r.file === 'ios/Podfile' && r.line === 1)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('does not false-positive on short ambiguous package names like app', () => {
    const dir = makeProject({
      'ios/MyApp/AppDelegate.mm': '@implementation AppDelegate\n- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {\n  return YES;\n}\n@end\n',
    })
    const refs = scanNativeReferences(dir, ['app'])
    expect(refs).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('stripNativeReferences', () => {
  it('removes pod lines, gradle includes, and native imports; keeps runtime usages', () => {
    const dir = makeProject({
      'ios/Podfile': "pod 'AppCenter', :path => '../node_modules/appcenter/ios'\npod 'React', :path => '../node_modules/react-native/ReactCommon'\n",
      'android/settings.gradle': "include ':app'\ninclude ':appcenter'\nproject(':appcenter').projectDir = new File(rootProject.projectDir, '../node_modules/appcenter/android')\n",
      'android/app/src/main/java/com/app/MainApplication.kt': 'import com.microsoft.appcenter.AppCenter\nimport com.microsoft.appcenter.analytics.Analytics\n\nclass MainApplication : Application() {\n  override fun onCreate() {\n    AppCenter.start(applicationContext, "secret", Analytics::class.java)\n  }\n}\n',
    })

    const result = stripNativeReferences(dir, ['appcenter'])

    const podfile = readFileSync(join(dir, 'ios/Podfile'), 'utf-8')
    expect(podfile).not.toContain('AppCenter')
    expect(podfile).toContain("pod 'React'")

    const settings = readFileSync(join(dir, 'android/settings.gradle'), 'utf-8')
    expect(settings).not.toContain('appcenter')
    expect(settings).toContain("include ':app'")

    const mainApplication = readFileSync(join(dir, 'android/app/src/main/java/com/app/MainApplication.kt'), 'utf-8')
    expect(mainApplication).not.toContain('import com.microsoft.appcenter')
    // Runtime usage is reported, not deleted
    expect(mainApplication).toContain('AppCenter.start')

    expect(result.removed.length).toBeGreaterThanOrEqual(5)
    expect(result.remaining.some(r => r.kind === 'code')).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('leaves manifest and plist entries as remaining (not silently deleted)', () => {
    const dir = makeProject({
      'android/app/src/main/AndroidManifest.xml': '<manifest><application>\n  <provider android:name="com.microsoft.appcenter.utils.AppCenterProvider" />\n</application></manifest>\n',
      'ios/MyApp/Info.plist': '<dict>\n  <key>AppCenterSecret</key>\n  <string>abc</string>\n</dict>\n',
    })
    const result = stripNativeReferences(dir, ['appcenter'])
    expect(result.removed).toHaveLength(0)
    expect(result.remaining.some(r => r.kind === 'manifest')).toBe(true)
    expect(result.remaining.some(r => r.kind === 'plist')).toBe(true)
    // Files unchanged on disk
    expect(existsSync(join(dir, 'android/app/src/main/AndroidManifest.xml'))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})
