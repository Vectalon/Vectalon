import { createTempProject, cleanup } from '../helpers/tmp'
import { detectVersions } from '../../src/upgrade/detect'
import { MIGRATION_CATALOG, RN_REACT_PAIRS, EXPO_SDK_RN_PAIRS, KNOWN_RN_MINORS, LATEST_KNOWN_RN, resolveTargetRn } from '../../src/upgrade/catalog'
import { applyEditsToContent } from '../../src/upgrade/codemods'
import type { CatalogContext, ImpactFinding } from '../../src/upgrade'

const NO_IMPACT: ImpactFinding[] = []

function ctxFor(files: Record<string, string>, target: string): { ctx: CatalogContext; dir: string } {
  const dir = createTempProject(files)
  const versions = detectVersions(dir)
  return { ctx: { root: dir, versions, target, impact: NO_IMPACT }, dir }
}

function entry(id: string) {
  const e = MIGRATION_CATALOG.find(x => x.id === id)
  if (!e) throw new Error(`catalog entry ${id} missing`)
  return e
}

afterEach(() => undefined)

describe('catalog integrity', () => {
  it('has unique ids and valid risk levels', () => {
    const ids = MIGRATION_CATALOG.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of MIGRATION_CATALOG) {
      expect(['low', 'medium', 'high']).toContain(e.risk)
      expect(typeof e.applies).toBe('function')
    }
  })

  it('has the paired react version for every known RN minor', () => {
    for (const minor of KNOWN_RN_MINORS) {
      expect(RN_REACT_PAIRS[minor]).toBeTruthy()
    }
    expect(RN_REACT_PAIRS[76]).toBe('18.3.1')
    expect(RN_REACT_PAIRS[78]).toBe('19.0.0')
    expect(RN_REACT_PAIRS[86]).toBe('19.2.3')
  })

  it('maps Expo SDKs to paired RN minors', () => {
    expect(EXPO_SDK_RN_PAIRS[50]).toBe(73)
    expect(EXPO_SDK_RN_PAIRS[52]).toBe(76)
    expect(EXPO_SDK_RN_PAIRS[53]).toBe(79)
    expect(EXPO_SDK_RN_PAIRS[55]).toBe(83)
    expect(EXPO_SDK_RN_PAIRS[57]).toBe(86)
  })
})

describe('resolveTargetRn', () => {
  it('resolves SDK targets through the pairing table', () => {
    expect(resolveTargetRn('53')).toBe('0.79.0')
    expect(resolveTargetRn('52.0')).toBe('0.76.0')
  })

  it('normalizes RN semver targets', () => {
    expect(resolveTargetRn('0.76')).toBe('0.76.0')
    expect(resolveTargetRn('0.76.3')).toBe('0.76.3')
  })

  it('defaults to the latest known stable', () => {
    expect(resolveTargetRn(null)).toBe(LATEST_KNOWN_RN)
    expect(resolveTargetRn('latest')).toBe(LATEST_KNOWN_RN)
  })
})

describe('hermes flag codemod (rn-070)', () => {
  it('applies only when build.gradle still uses enableHermes', () => {
    const { ctx, dir } = ctxFor(
      { 'package.json': JSON.stringify({ dependencies: { 'react-native': '0.69.0' } }), 'android/build.gradle': 'enableHermes true\n' },
      '0.76.0'
    )
    try {
      // RN 0.69 fixture: no build.gradle hermes flag relocation (pre-0.70? flag existed pre-0.70 too).
      // The entry gates on target >= 0.70; the fixture target is 0.76 so it applies.
      expect(entry('rn-070-hermes-flag').applies(ctx)).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('does not apply when build.gradle has no enableHermes', () => {
    const { ctx, dir } = ctxFor(
      { 'package.json': JSON.stringify({ dependencies: { 'react-native': '0.72.5' } }), 'android/build.gradle': '// nothing\n' },
      '0.76.0'
    )
    try {
      expect(entry('rn-070-hermes-flag').applies(ctx)).toBe(false)
    } finally {
      cleanup(dir)
    }
  })

  it('removes enableHermes and inserts hermesEnabled=true', () => {
    const { ctx, dir } = ctxFor(
      {
        'package.json': JSON.stringify({ dependencies: { 'react-native': '0.72.5' } }),
        'android/build.gradle': 'enableHermes true\napply plugin: "com.android.application"\n',
        'android/gradle.properties': 'newArchEnabled=false\n',
      },
      '0.76.0'
    )
    try {
      const edits = entry('rn-070-hermes-flag').codemod?.(ctx) || []
      expect(edits.length).toBeGreaterThanOrEqual(1)

      const gradle = ctx.versions.android.buildGradle as string
      const gradleEdit = edits.find(e => e.path === 'android/build.gradle')
      const { content: gradleAfter } = applyEditsToContent(gradle, gradleEdit ? [gradleEdit] : [])
      expect(gradleAfter).not.toContain('enableHermes')

      const props = ctx.versions.android.gradleProperties as string
      const propsEdit = edits.find(e => e.path === 'android/gradle.properties')
      const { content: propsAfter } = applyEditsToContent(props, propsEdit ? [propsEdit] : [])
      expect(propsAfter).toContain('hermesEnabled=true')
    } finally {
      cleanup(dir)
    }
  })
})

describe('codegen codemod (rn-070-codegen-native-component)', () => {
  it('rewrites requireNativeComponent calls and imports', () => {
    const { ctx, dir } = ctxFor(
      {
        'package.json': JSON.stringify({ dependencies: { 'react-native': '0.72.5' } }),
        'src/NativeThing.js': [
          "import { requireNativeComponent, View } from 'react-native'",
          "const NativeThing = requireNativeComponent('NativeThing')",
          'export default NativeThing',
        ].join('\n'),
      },
      '0.76.0'
    )
    try {
      expect(entry('rn-070-codegen-native-component').applies(ctx)).toBe(true)
      const edits = entry('rn-070-codegen-native-component').codemod?.(ctx) || []
      expect(edits.length).toBeGreaterThanOrEqual(2)
      expect(edits.every(e => e.path === 'src/NativeThing.js')).toBe(true)
      const { content: after } = applyEditsToContent(
        [
          "import { requireNativeComponent, View } from 'react-native'",
          "const NativeThing = requireNativeComponent('NativeThing')",
          'export default NativeThing',
        ].join('\n'),
        edits
      )
      expect(after).toContain("codegenNativeComponent('NativeThing')")
      expect(after).toContain('react-native/Libraries/Utilities/codegenNativeComponent')
      expect(after).not.toContain('requireNativeComponent')
      expect(after).toContain('View')
    } finally {
      cleanup(dir)
    }
  })

  it('ignores files that only mention requireNativeComponent (comments/strings)', () => {
    // Regression: the codemod must only touch files with an actual call — a
    // doc comment or string mentioning the API must never trigger edits.
    const { ctx, dir } = ctxFor(
      {
        'package.json': JSON.stringify({ dependencies: { 'react-native': '0.72.5' } }),
        'src/notes.js': "// requireNativeComponent is deprecated in favor of codegenNativeComponent\nconst msg = 'requireNativeComponent is legacy'\n",
      },
      '0.76.0'
    )
    try {
      expect(entry('rn-070-codegen-native-component').applies(ctx)).toBe(false)
      const edits = entry('rn-070-codegen-native-component').codemod?.(ctx) || []
      expect(edits).toEqual([])
    } finally {
      cleanup(dir)
    }
  })
})

describe('android ext block codemods', () => {
  it('preserves `;` separators when bumping values in a single-line ext block', () => {
    // Regression: the value regex must not swallow `;`/`}` in one-line
    // `ext { … }` blocks (`compileSdkVersion = 33; minSdkVersion = 21` →
    // `compileSdkVersion = "35"; minSdkVersion = "23"`, separators intact).
    const { ctx, dir } = ctxFor(
      {
        'package.json': JSON.stringify({ dependencies: { 'react-native': '0.72.5' } }),
        'android/build.gradle': 'ext { kotlinVersion = "1.8.10"; compileSdkVersion = 33; minSdkVersion = 21 }\n',
      },
      '0.77.0'
    )
    try {
      const edits = entry('rn-074-android-sdk-levels').codemod?.(ctx) || []
      const gradle = ctx.versions.android.buildGradle as string
      const gradleEdits = edits.filter(e => e.path === 'android/build.gradle')
      const { content: after } = applyEditsToContent(gradle, gradleEdits)
      expect(after).toContain('compileSdkVersion = "35"; minSdkVersion')
      expect(after).toContain('minSdkVersion = "23" }')
      expect(after).not.toContain('"35" minSdkVersion')
    } finally {
      cleanup(dir)
    }
  })
})

describe('ReactTestRenderer codemod (rn-073)', () => {
  it('moves the import to react-test-renderer', () => {
    const { ctx, dir } = ctxFor(
      {
        'package.json': JSON.stringify({ dependencies: { 'react-native': '0.72.5' } }),
        'src/__tests__/x.test.js': "import { render, ReactTestRenderer } from 'react-native'\n",
      },
      '0.76.0'
    )
    try {
      const edits = entry('rn-073-reacttestrenderer').codemod?.(ctx) || []
      expect(edits.length).toBeGreaterThanOrEqual(2)
      const { content: after } = applyEditsToContent("import { render, ReactTestRenderer } from 'react-native'\n", edits)
      expect(after).toContain("import { render } from 'react-native'")
      expect(after).toContain("import ReactTestRenderer from 'react-test-renderer'")
      expect(after).not.toContain('ReactTestRenderer }')
    } finally {
      cleanup(dir)
    }
  })
})

describe('dependency bump codemods', () => {
  it('bumps react-native and pairs react for RN targets', () => {
    const { ctx, dir } = ctxFor(
      { 'package.json': JSON.stringify({ dependencies: { react: '18.2.0', 'react-native': '0.72.5' } }) },
      '0.76.0'
    )
    try {
      const rnEdits = entry('dep-react-native').codemod?.(ctx) || []
      const reactEdits = entry('dep-react').codemod?.(ctx) || []
      const pkg = { dependencies: { react: '18.2.0', 'react-native': '0.72.5' } }
      const combined = [...rnEdits, ...reactEdits]
      // Whole-file writes; apply sequentially.
      const { content } = applyEditsToContent(JSON.stringify(pkg), combined)
      const after = JSON.parse(content) as { dependencies: Record<string, string> }
      expect(after.dependencies['react-native']).toBe('0.76.0')
      expect(after.dependencies.react).toBe('18.3.1')
    } finally {
      cleanup(dir)
    }
  })

  it('bumps expo for SDK targets', () => {
    const { ctx, dir } = ctxFor(
      { 'package.json': JSON.stringify({ dependencies: { expo: '50.0.0', 'react-native': '0.73.5' } }) },
      '53'
    )
    try {
      expect(entry('dep-expo').applies(ctx)).toBe(true)
      const edits = entry('dep-expo').codemod?.(ctx) || []
      const { content } = applyEditsToContent(JSON.stringify({ dependencies: { expo: '50.0.0' } }), edits)
      expect(JSON.parse(content).dependencies.expo).toBe('53.0.0')
    } finally {
      cleanup(dir)
    }
  })
})
