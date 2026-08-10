import {
  rnDiffPurgeUrl,
  upgradeHelperUrl,
  classifyRnDiffPath,
  parseRnDiff,
  parseRnDiffFiles,
  summarizeRnDiff,
  fetchRnDiffPurge,
  renderRnDiffSummary,
} from '../../src/upgrade/rnDiffPurge'

const FIXTURE = [
  'diff --git a/RnDiffApp/package.json b/RnDiffApp/package.json',
  'index 3fa7672061..83ba1f2adc 100644',
  '--- a/RnDiffApp/package.json',
  '+++ b/RnDiffApp/package.json',
  '@@ -13,4 +13,4 @@',
  '     "react": "19.2.3",',
  '-    "react-native": "0.84.0",',
  '+    "react-native": "0.85.0",',
  'diff --git a/RnDiffApp/App.tsx b/RnDiffApp/App.tsx',
  'new file mode 100644',
  'index 0000000..1111111',
  '--- /dev/null',
  '+++ b/RnDiffApp/App.tsx',
  '@@ -0,0 +1,2 @@',
  "+import React from 'react';",
  '+export default function App() { return null; }',
  'diff --git a/RnDiffApp/android/app/build.gradle b/RnDiffApp/android/app/build.gradle',
  'index 1111111..2222222 100644',
  '--- a/RnDiffApp/android/app/build.gradle',
  '+++ b/RnDiffApp/android/app/build.gradle',
  '@@ -3,3 +3,3 @@',
  '-    compileSdkVersion = 35',
  '+    compileSdkVersion = 36',
  'diff --git a/RnDiffApp/ios/Podfile b/RnDiffApp/ios/Podfile',
  'deleted file mode 100644',
  'index 2222222..0000000',
  '--- a/RnDiffApp/ios/Podfile',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  "-platform :ios, '13.0'",
  '-use_react_native!',
  'diff --git a/RnDiffApp/ios/MyApp.xcodeproj/project.pbxproj b/RnDiffApp/ios/MyApp.xcodeproj/project.pbxproj',
  'similarity index 98%',
  'rename from RnDiffApp/ios/MyApp.xcodeproj/project.pbxproj',
  'rename to RnDiffApp/ios/MyApp.xcodeproj/project-new.pbxproj',
  'diff --git a/RnDiffApp/android/app/src/main/res/mipmap-hdpi/ic_launcher.png b/RnDiffApp/android/app/src/main/res/mipmap-hdpi/ic_launcher.png',
  'Binary files a/RnDiffApp/android/app/src/main/res/mipmap-hdpi/ic_launcher.png and b/RnDiffApp/android/app/src/main/res/mipmap-hdpi/ic_launcher.png differ',
  'diff --git a/RnDiffApp/README.md b/RnDiffApp/README.md',
  'index 0000000..3333333 100644',
  '--- a/RnDiffApp/README.md',
  '+++ b/RnDiffApp/README.md',
  '@@ -1 +1 @@',
  '-old readme',
  '+new readme',
].join('\n')

describe('rn-diff-purge URLs', () => {
  it('builds the raw diff URL from the canonical diffs branch layout', () => {
    expect(rnDiffPurgeUrl('0.72.5', '0.86.2')).toBe(
      'https://raw.githubusercontent.com/react-native-community/rn-diff-purge/diffs/diffs/0.72.5..0.86.2.diff'
    )
  })

  it('builds the interactive Upgrade Helper URL', () => {
    expect(upgradeHelperUrl('0.72.5', '0.86.2')).toBe(
      'https://react-native-community.github.io/upgrade-helper/?from=0.72.5&to=0.86.2'
    )
  })
})

describe('classifyRnDiffPath', () => {
  it('classifies native files (android/, ios/)', () => {
    expect(classifyRnDiffPath('android/app/build.gradle')).toBe('native')
    expect(classifyRnDiffPath('android/app/src/main/AndroidManifest.xml')).toBe('native')
    expect(classifyRnDiffPath('ios/Podfile')).toBe('native')
    expect(classifyRnDiffPath('ios/MyApp/AppDelegate.swift')).toBe('native')
    expect(classifyRnDiffPath('Gemfile')).toBe('native')
    expect(classifyRnDiffPath('MyNative.podspec')).toBe('native')
  })

  it('classifies JS/TS files and app config', () => {
    expect(classifyRnDiffPath('App.tsx')).toBe('js-ts')
    expect(classifyRnDiffPath('index.js')).toBe('js-ts')
    expect(classifyRnDiffPath('package.json')).toBe('js-ts')
    expect(classifyRnDiffPath('metro.config.js')).toBe('js-ts')
    expect(classifyRnDiffPath('babel.config.js')).toBe('js-ts')
    expect(classifyRnDiffPath('tsconfig.json')).toBe('js-ts')
    expect(classifyRnDiffPath('__tests__/App.test.tsx')).toBe('js-ts')
  })

  it('classifies everything else as other', () => {
    expect(classifyRnDiffPath('README.md')).toBe('other')
    expect(classifyRnDiffPath('.gitignore')).toBe('other')
    expect(classifyRnDiffPath('.watchmanconfig')).toBe('js-ts') // JS toolchain config
    expect(classifyRnDiffPath('docs/upgrade.md')).toBe('other')
  })
})

describe('parseRnDiff / summarizeRnDiff', () => {
  it('parses statuses, additions/deletions, and strips the RnDiffApp/ prefix', () => {
    const parsed = parseRnDiff(FIXTURE, '0.84.0', '0.85.0')
    expect(parsed.from).toBe('0.84.0')
    expect(parsed.to).toBe('0.85.0')
    expect(parsed.totalFiles).toBe(7)
    expect(parsed.totalAdditions).toBe(5)
    expect(parsed.totalDeletions).toBe(5)

    const pkg = parsed.jsTs.files.find(f => f.path === 'package.json')
    expect(pkg).toBeDefined()
    expect(pkg?.status).toBe('modified')
    expect(pkg?.additions).toBe(1)
    expect(pkg?.deletions).toBe(1)

    const app = parsed.jsTs.files.find(f => f.path === 'App.tsx')
    expect(app?.status).toBe('added')
    expect(app?.additions).toBe(2)

    const gradle = parsed.native.files.find(f => f.path === 'android/app/build.gradle')
    expect(gradle?.status).toBe('modified')
    expect(gradle?.additions).toBe(1)
    expect(gradle?.deletions).toBe(1)

    const podfile = parsed.native.files.find(f => f.path === 'ios/Podfile')
    expect(podfile?.status).toBe('removed')
    expect(podfile?.deletions).toBe(2)

    const renamed = parsed.native.files.find(f => f.path === 'ios/MyApp.xcodeproj/project-new.pbxproj')
    expect(renamed?.status).toBe('renamed')
    expect(renamed?.oldPath).toBe('ios/MyApp.xcodeproj/project.pbxproj')

    const icon = parsed.native.files.find(f => f.path.includes('ic_launcher.png'))
    expect(icon?.status).toBe('modified')
    expect(icon?.additions).toBe(0)
    expect(icon?.deletions).toBe(0)

    const readme = parsed.other.files.find(f => f.path === 'README.md')
    expect(readme?.status).toBe('modified')
  })

  it('groups files into native vs js-ts vs other buckets with totals', () => {
    const parsed = parseRnDiff(FIXTURE, '0.84.0', '0.85.0')
    expect(parsed.native.fileCount).toBe(4) // build.gradle, Podfile, pbxproj rename, icon
    expect(parsed.jsTs.fileCount).toBe(2) // package.json, App.tsx
    expect(parsed.other.fileCount).toBe(1) // README.md
    expect(parsed.native.deletions).toBeGreaterThan(0)
    expect(parsed.upgradeHelperUrl).toContain('0.84.0')
  })

  it('handles empty / garbage content', () => {
    const parsed = parseRnDiff('not a diff at all', '0.84.0', '0.85.0')
    expect(parsed.totalFiles).toBe(0)
    expect(parsed.native.fileCount).toBe(0)
    expect(parseRnDiffFiles('')).toEqual([])
  })

  it('summarizeRnDiff derives totals from raw file lists', () => {
    const files = parseRnDiffFiles(FIXTURE)
    const summary = summarizeRnDiff(files, '0.84.0', '0.85.0')
    expect(summary.source).toBe('rn-diff-purge')
    expect(summary.url).toBe(rnDiffPurgeUrl('0.84.0', '0.85.0'))
    expect(summary.totalFiles).toBe(7)
  })
})

describe('fetchRnDiffPurge', () => {
  it('fetches and parses a diff from the canonical URL', async () => {
    const seen: string[] = []
    const stub = async (input: string | URL | Request): Promise<Response> => {
      seen.push(String(input))
      return new Response(FIXTURE, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    const summary = await fetchRnDiffPurge('0.84.0', '0.85.0', { fetch: stub })
    expect(seen[0]).toBe(rnDiffPurgeUrl('0.84.0', '0.85.0'))
    expect(summary.totalFiles).toBe(7)
    expect(summary.native.fileCount).toBe(4)
  })

  it('reports a clear error when the pair has no published diff yet (404)', async () => {
    const stub = async (_input: string | URL | Request): Promise<Response> => new Response('404: Not Found', { status: 404 })
    await expect(fetchRnDiffPurge('0.85.3', '0.86.2', { fetch: stub })).rejects.toThrow(/No rn-diff-purge diff published/)
  })

  it('surfaces non-404 HTTP failures', async () => {
    const stub = async (_input: string | URL | Request): Promise<Response> => new Response('oops', { status: 500 })
    await expect(fetchRnDiffPurge('0.72.5', '0.86.2', { fetch: stub })).rejects.toThrow(/HTTP 500/)
  })
})

describe('renderRnDiffSummary', () => {
  it('renders categorized sections with the upgrade helper link', () => {
    const parsed = parseRnDiff(FIXTURE, '0.84.0', '0.85.0')
    const rendered = renderRnDiffSummary(parsed)
    expect(rendered).toContain('rn-diff-purge 0.84.0 → 0.85.0')
    expect(rendered).toContain('Native (android/, ios/) — 4 file(s)')
    expect(rendered).toContain('JS/TS — 2 file(s)')
    expect(rendered).toContain('android/app/build.gradle (modified, +1 −1)')
    expect(rendered).toContain('App.tsx (added, +2 −0)')
    expect(rendered).toContain('upgrade-helper')
  })
})
