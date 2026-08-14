/**
 * vectalon upgrade — curated migration catalog
 * Business Source License 1.1 (BSL-1.1)
 *
 * Deterministic, version-gated migration entries covering the top React Native
 * breaking changes per release (and the Expo SDK jumps that carry them). Known
 * migrations are catalog-driven — no LLM. Each entry declares when it applies
 * and, where safe, a pure codemod producing in-memory edits. Everything else is
 * explicit manual guidance (the release-notes caveat stays visible in the plan).
 *
 * Every codemod emits non-overlapping substring edits so multiple codemods can
 * touch the same file in one pass (only package.json uses whole-file writes,
 * which the applier deep-merges as JSON).
 *
 * Version data follows the official RN templates; entries that depend on a
 * version newer than this catalog's table fall back to review guidance rather
 * than guessing.
 */

import { readProjectFile, projectHasPattern, walkProjectFiles } from './scan'
import { versionParts, isAtLeast } from './detect'
import type { CatalogContext, CatalogEntry, CodemodEdit } from './types'

/** RN minor → paired react version (official template defaults). */
export const RN_REACT_PAIRS: Record<number, string> = {
  71: '18.2.0',
  72: '18.2.0',
  73: '18.2.0',
  74: '18.2.0',
  75: '18.3.1',
  76: '18.3.1',
  77: '18.3.1',
  78: '19.0.0',
  79: '19.1.0',
  80: '19.1.0',
  81: '19.1.0',
  82: '19.1.1',
  83: '19.2.0',
  84: '19.2.3',
  85: '19.2.3',
  86: '19.2.3',
}

/** Expo SDK → paired React Native minor (official pairing table). */
export const EXPO_SDK_RN_PAIRS: Record<number, number> = {
  49: 72,
  50: 73,
  51: 74,
  52: 76,
  53: 79,
  54: 81,
  55: 83,
  56: 85,
  57: 86,
}

/** Known stable RN minors this catalog understands (highest = default target). */
export const KNOWN_RN_MINORS = [71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86]

/** Latest known stable RN version used when --to is omitted or 'latest'. */
export const LATEST_KNOWN_RN = '0.86.2'

/* ------------------------------------------------------------------ */
/* Codemod helpers — all emit substring edits that compose safely      */
/* ------------------------------------------------------------------ */

/** Bump a dependency in package.json (whole-file write; merged as JSON). */
function packageJsonEdit(ctx: CatalogContext, change: (deps: Record<string, string>, devDeps: Record<string, string>) => void): CodemodEdit | null {
  const pkg = ctx.versions.packageJson
  if (!pkg) return null
  const deps = (pkg.dependencies as Record<string, string>) || {}
  const devDeps = (pkg.devDependencies as Record<string, string>) || {}
  const before = JSON.stringify(pkg)
  change(deps, devDeps)
  const after = JSON.stringify(pkg)
  if (after === before) return null
  return {
    path: 'package.json',
    action: 'write',
    original: '',
    updated: JSON.stringify(pkg, null, 2) + '\n',
    detail: 'package.json dependencies updated',
  }
}

/** Insert `key=value` at the top of gradle.properties when the key is absent. */
function gradlePropertiesInsert(ctx: CatalogContext, key: string, value: string, detail: string): CodemodEdit | null {
  const props = ctx.versions.android.gradleProperties
  if (props === null || ctx.versions.android.gradlePropertiesPath === null) return null
  if (new RegExp(`^\\s*${key}\\s*=`, 'm').test(props)) return null
  return {
    path: ctx.versions.android.gradlePropertiesPath,
    action: 'insert',
    original: '',
    updated: `${key}=${value}\n`,
    detail,
  }
}

/** One 'remove' edit per line matching `pattern` (composes across codemods). */
function removeLines(ctx: CatalogContext, relPath: string | null, content: string | null, pattern: RegExp, detail: string): CodemodEdit[] | null {
  if (relPath === null || content === null) return null
  const edits: CodemodEdit[] = []
  for (const line of content.split('\n')) {
    pattern.lastIndex = 0
    if (pattern.test(line)) {
      edits.push({
        path: relPath,
        action: 'remove',
        original: content.includes(line + '\n') ? line + '\n' : line,
        updated: '',
        detail,
      })
    }
  }
  return edits.length > 0 ? edits : null
}

/**
 * Minimum iOS deployment target per RN release (Roadmap 036). The floor
 * jumped from 12.4 to 15.1 in RN 0.76 (official release announcement: "iOS —
 * from 13.4 to 15.1"; the 0.73+ template floor is 12.4). Lower bounds only —
 * a release above the highest known minor keeps the highest known floor.
 */
const IOS_DEPLOYMENT_FLOORS: Array<{ minor: number; floor: number }> = [
  { minor: 76, floor: 15.1 },
  { minor: 73, floor: 12.4 },
]

/** The iOS deployment target a target RN release requires, or null below 0.73. */
export function requiredIosDeploymentTarget(target: [number, number] | null): number | null {
  if (!target || target[0] !== 0) return null
  for (const { minor, floor } of IOS_DEPLOYMENT_FLOORS) {
    if (target[1] >= minor) return floor
  }
  return null
}

/** Bump `ext.<name>` values in android/build.gradle that are below `minimum`. */
function bumpGradleExt(ctx: CatalogContext, name: string, minimum: string, detail: string): CodemodEdit | null {
  const gradle = ctx.versions.android.buildGradle
  const relPath = ctx.versions.android.buildGradlePath
  if (gradle === null || relPath === null) return null
  // `;{}` excluded from the value class so single-line `ext { … }` blocks
  // keep their separators (bumping one value must not swallow the `;`).
  const re = new RegExp(`((?:ext\\.)?${name})\\s*=\\s*["']?([^"',\\s;{}]+)["']?`)
  const m = gradle.match(re)
  if (!m) return null
  if (compareVersions(m[2], minimum) >= 0) return null
  return {
    path: relPath,
    action: 'replace',
    original: m[0],
    updated: `${m[1]} = "${minimum}"`,
    detail: `${detail} → ${minimum}`,
  }
}

/** Compare version strings ("8.1.0", "1.9.22", "33"); -1/0/1. */
function compareVersions(a: string, b: string): number {
  const pa = (a.match(/\d+/g) || []).map(Number)
  const pb = (b.match(/\d+/g) || []).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * Rewrite `requireNativeComponent` call sites to `codegenNativeComponent`
 * (New Architecture) — the canonical RN 0.70+ codemod. Emits substring edits
 * per affected file: import line fixed, codegen import prepended, every call
 * rewritten keeping the string component name.
 */
function codegenCodemod(ctx: CatalogContext): CodemodEdit[] | null {
  const edits: CodemodEdit[] = []
  for (const rel of walkProjectFiles(ctx.root)) {
    const content = readProjectFile(ctx.root, rel)
    if (content === null) continue
    // Only files with an actual requireNativeComponent(...) call are touched.
    // Doc-comment / string / fixture mentions must never trigger edits (that
    // is what mangled fixture strings and stray imports during development).
    if (!/\brequireNativeComponent\s*\(/.test(content)) continue
    const fileEdits: CodemodEdit[] = []

    // 1. Drop requireNativeComponent from the react-native named import.
    const rnImport = content.match(/import\s*\{([^}]*)\}\s*from\s*['"]react-native['"]/)
    if (rnImport) {
      const names = rnImport[1].split(',').map(s => s.trim()).filter(Boolean)
      const filtered = names.filter(n => n !== 'requireNativeComponent')
      if (filtered.length !== names.length) {
        fileEdits.push({
          path: rel,
          action: 'replace',
          original: rnImport[0],
          updated: filtered.length === 0 ? '' : `import { ${filtered.join(', ')} } from 'react-native'`,
          detail: 'removed requireNativeComponent from the react-native import',
        })
      }
    }

    // 2. Ensure the codegen import exists (prepended — no anchor conflicts).
    const hasCodegenImport = /from\s*['"]react-native\/Libraries\/Utilities\/codegenNativeComponent['"]/.test(content)
    if (!hasCodegenImport) {
      fileEdits.push({
        path: rel,
        action: 'insert',
        original: '',
        updated: `import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent'\n`,
        detail: 'added codegenNativeComponent import',
      })
    }

    // 3. Rewrite calls: codegenNativeComponent('X') → codegenNativeComponent('X').
    const callRe = /requireNativeComponent\(\s*(['"][^'"]+['"])(?:\s*,\s*[^)]*)?\)/g
    let m: RegExpExecArray | null
    while ((m = callRe.exec(content)) !== null) {
      fileEdits.push({
        path: rel,
        action: 'replace',
        original: m[0],
        updated: `codegenNativeComponent(${m[1]})`,
        detail: 'requireNativeComponent → codegenNativeComponent (New Architecture)',
      })
    }

    edits.push(...fileEdits)
  }
  return edits.length > 0 ? edits : null
}

/** Move `ReactTestRenderer` out of the react-native import (removed in 0.73). */
function reactTestRendererCodemod(ctx: CatalogContext): CodemodEdit[] | null {
  const edits: CodemodEdit[] = []
  for (const rel of walkProjectFiles(ctx.root)) {
    const content = readProjectFile(ctx.root, rel)
    if (content === null) continue
    const rnImport = content.match(/import\s*\{([^}]*ReactTestRenderer[^}]*)\}\s*from\s*['"]react-native['"]/)
    if (!rnImport) continue
    const names = rnImport[1].split(',').map(s => s.trim()).filter(Boolean)
    const filtered = names.filter(n => n !== 'ReactTestRenderer')
    if (filtered.length === names.length) continue
    edits.push({
      path: rel,
      action: 'replace',
      original: rnImport[0],
      updated: filtered.length === 0 ? '' : `import { ${filtered.join(', ')} } from 'react-native'`,
      detail: 'ReactTestRenderer removed from the react-native import',
    })
    edits.push({
      path: rel,
      action: 'insert',
      original: '',
      updated: `import ReactTestRenderer from 'react-test-renderer'\n`,
      detail: 'ReactTestRenderer moved to react-test-renderer (removed from react-native in 0.73)',
    })
  }
  return edits.length > 0 ? edits : null
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export const MIGRATION_CATALOG: CatalogEntry[] = [
  {
    id: 'dep-react-native',
    title: 'Bump react-native',
    description: 'Move the react-native dependency to the target version.',
    category: 'dependency',
    risk: 'low',
    applies: ctx => ctx.versions.rnVersion !== null && ctx.target !== null,
    codemod: ctx => {
      const target = ctx.target
      if (!target) return null
      const edit = packageJsonEdit(ctx, (deps) => {
        if (deps['react-native'] !== undefined) deps['react-native'] = target
      })
      return edit ? [edit] : null
    },
  },
  {
    id: 'dep-react',
    title: 'Align react version',
    description: 'React must match the version the target RN release is built against.',
    category: 'dependency',
    risk: 'low',
    applies: ctx => ctx.target !== null && targetRnMinor(ctx) !== null,
    codemod: ctx => {
      const minor = targetRnMinor(ctx)
      if (minor === null) return null
      const paired = RN_REACT_PAIRS[minor]
      if (!paired) return null
      const edit = packageJsonEdit(ctx, (deps) => {
        if (deps.react !== undefined) deps.react = paired
      })
      return edit ? [edit] : null
    },
    manual: [
      'Expo projects: let Expo pick the react version — run `npx expo install react react-native` instead of pinning manually.',
    ],
  },
  {
    id: 'dep-expo',
    title: 'Bump expo SDK',
    description: 'Move the expo dependency to the target SDK (when --to is an SDK number).',
    category: 'dependency',
    risk: 'low',
    applies: ctx => ctx.versions.expoVersion !== null && /^\d{2}(?:\.\d+)?$/.test(ctx.target || ''),
    codemod: ctx => {
      const target = ctx.target as string
      const sdk = target.match(/^(\d{2})/)
      if (!sdk) return null
      const version = target.includes('.') ? target : `${sdk[1]}.0.0`
      const edit = packageJsonEdit(ctx, (deps) => {
        if (deps.expo !== undefined) deps.expo = version
      })
      return edit ? [edit] : null
    },
  },
  {
    id: 'expo-sdk-pairing',
    title: 'Expo SDK ↔ RN pairing',
    description: 'Keep the react-native version paired to the Expo SDK and refresh the native project.',
    category: 'config',
    risk: 'medium',
    applies: ctx => ctx.versions.tooling === 'expo' && ctx.target !== null,
    codemod: null,
    manual: ctx => {
      const sdk = (ctx.target || '').match(/^(\d{2})/)
      const rnMinor = sdk && Number(sdk[1]) >= 40 ? EXPO_SDK_RN_PAIRS[Number(sdk[1])] : null
      const lines = [
        rnMinor
          ? `Expo SDK ${sdk?.[1]} pairs with react-native 0.${rnMinor} — the plan's react-native bump reflects this.`
          : 'Target is an RN version; for Expo projects prefer targeting the SDK (e.g. --to 53).',
        'Run `npx expo install --fix` after the bump to align every expo-* package version.',
        'Run `npx expo prebuild --clean` (or `npx pod-install`) to regenerate native projects.',
        'Review config plugins in app.json/app.config.js — plugin options can break across SDKs.',
        'SDK 52+ makes edge-to-edge mandatory on Android; SDK 53+ enables the New Architecture by default.',
      ]
      return lines
    },
  },
  {
    id: 'rn-070-hermes-flag',
    title: 'Android: Hermes flag relocation',
    description: 'RN 0.70 moved Hermes from `enableHermes` (build.gradle) to `hermesEnabled` (gradle.properties).',
    category: 'android',
    risk: 'medium',
    applies: ctx => isAtLeast(targetRn(ctx), [0, 70]) && ctx.versions.android.buildGradle !== null && /enableHermes/.test(ctx.versions.android.buildGradle || ''),
    codemod: ctx => {
      const edits: CodemodEdit[] = []
      const gradle = ctx.versions.android.buildGradle
      const relPath = ctx.versions.android.buildGradlePath
      if (gradle && relPath) {
        for (const line of gradle.split('\n')) {
          if (/enableHermes/.test(line)) {
            edits.push({
              path: relPath,
              action: 'remove',
              original: gradle.includes(line + '\n') ? line + '\n' : line,
              updated: '',
              detail: 'removed enableHermes from build.gradle (RN 0.70+ uses gradle.properties)',
            })
          }
        }
      }
      const hermesEdit = gradlePropertiesInsert(ctx, 'hermesEnabled', 'true', 'gradle.properties hermesEnabled=true (RN 0.70+ toggle)')
      if (hermesEdit) edits.push(hermesEdit)
      return edits.length > 0 ? edits : null
    },
    manual: ['If you previously disabled Hermes, set `hermesEnabled=false` in android/gradle.properties instead.'],
  },
  {
    id: 'rn-071-newarch-flag',
    title: 'Android: New Architecture flag',
    description: 'RN 0.71+ toggles the New Architecture via `newArchEnabled` in gradle.properties.',
    category: 'android',
    risk: 'medium',
    newArch: true,
    review: true,
    applies: ctx =>
      ctx.versions.android.gradlePropertiesPath !== null &&
      ctx.versions.android.newArchEnabled !== true &&
      ctx.versions.newArch?.enabled !== true &&
      isAtLeast(targetRn(ctx), [0, 71]),
    codemod: ctx => {
      // 0.76+ defaults New Arch ON — make the flag explicit and match the default.
      if (!isAtLeast(targetRn(ctx), [0, 76])) return null
      const props = ctx.versions.android.gradleProperties
      const relPath = ctx.versions.android.gradlePropertiesPath
      if (props === null || relPath === null) return null
      const keyRe = /^\s*newArchEnabled\s*=\s*(true|false)\s*$/m
      const explicit = props.match(keyRe)
      if (explicit) {
        return [{
          path: relPath,
          action: 'replace',
          original: explicit[0],
          updated: 'newArchEnabled=true',
          detail: 'newArchEnabled false → true (New Architecture — default on RN 0.76+)',
        }]
      }
      const edit = gradlePropertiesInsert(ctx, 'newArchEnabled', 'true', 'gradle.properties newArchEnabled=true (New Architecture — default on RN 0.76+)')
      return edit ? [edit] : null
    },
    manual: ctx => [
      isAtLeast(targetRn(ctx), [0, 76])
        ? 'New Architecture is the default from RN 0.76 — verify every native module is compatible (see impact report).'
        : 'RN 0.71–0.75: New Architecture is opt-in — enable deliberately with `newArchEnabled=true` after your native modules are Fabric-ready.',
    ],
  },
  {
    id: 'rn-071-podfile-hermes',
    title: 'iOS: remove Podfile Hermes flag',
    description: 'RN 0.71+ removed `:hermes_enabled` from the Podfile — Hermes is always enabled (HERMES_ENABLED env still honored).',
    category: 'ios',
    risk: 'low',
    applies: ctx => isAtLeast(targetRn(ctx), [0, 71]) && ctx.versions.ios.podfile !== null && /:hermes_enabled/.test(ctx.versions.ios.podfile || ''),
    codemod: ctx => {
      const content = ctx.versions.ios.podfile as string
      const relPath = ctx.versions.ios.podfilePath as string
      const edits: CodemodEdit[] = []
      const re = /(?:\s*,\s*:hermes_enabled\s*=>\s*(?:true|false))|(?:\s*:hermes_enabled\s*=>\s*(?:true|false)\s*,?)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) {
        edits.push({
          path: relPath,
          action: 'remove',
          original: m[0],
          updated: '',
          detail: 'removed :hermes_enabled from the Podfile (Hermes is on by default)',
        })
      }
      return edits.length > 0 ? edits : null
    },
    manual: ['To disable Hermes on iOS set `ENV[\'HERMES_ENABLED\'] = false` at the top of the Podfile.'],
  },
  {
    id: 'rn-073-ios-deployment-target',
    title: 'iOS: deployment target floor',
    description: 'Newer RN releases require a higher minimum iOS deployment target — the Podfile platform floor must match.',
    category: 'ios',
    risk: 'medium',
    review: true,
    applies: ctx => {
      const required = requiredIosDeploymentTarget(targetRn(ctx))
      if (required === null || ctx.versions.ios.podfile === null || ctx.versions.ios.podfilePath === null) return false
      const current = ctx.versions.ios.deploymentTarget
      // Absent floor = defaults apply (may be too low); explicit floor below
      // the requirement = must raise. At/above the requirement = no-op.
      return current === null || current < required
    },
    codemod: ctx => {
      const required = requiredIosDeploymentTarget(targetRn(ctx))
      const content = ctx.versions.ios.podfile
      const relPath = ctx.versions.ios.podfilePath
      if (required === null || content === null || relPath === null) return null
      // Both Podfile spellings: `platform :ios, '13.4'` and
      // `platform :ios, :deployment_target => '13.4'`.
      const platformRe = /(platform\s*:\s*ios\s*,\s*(?::\s*deployment_target\s*=>\s*)?['"])(\d+(?:\.\d+)?)(['"])/
      const m = content.match(platformRe)
      if (!m) return null // no explicit floor — leave the manual instruction
      const current = Number(m[2])
      if (current >= required) return null
      return [{
        path: relPath,
        action: 'replace',
        original: m[0],
        updated: `${m[1]}${required}${m[3]}`,
        detail: `iOS deployment target ${current} → ${required} (required floor for the target RN release)`,
      }]
    },
    manual: ctx => {
      const required = requiredIosDeploymentTarget(targetRn(ctx))
      const current = ctx.versions.ios.deploymentTarget
      const lines = [
        required !== null
          ? `Set the Podfile floor to at least ${required}: \`platform :ios, '${required}'\`.`
          : 'Set the Podfile platform floor to the minimum your target RN release requires.',
      ]
      if (current === null) {
        lines.push('No explicit platform floor found — CocoaPods defaults may be below the RN-required minimum.', 'Also raise IPHONEOS_DEPLOYMENT_TARGET in the Xcode project / generated project settings, and re-run `cd ios && pod install`.', 'Raising the floor drops support for older iOS versions — confirm your device support matrix first.')
      } else {
        lines.push(`Current floor is ${current} — raising it drops iOS < ${required} support; confirm the device matrix.`, 'Re-run `cd ios && pod install` after the change.')
      }
      return lines
    },
  },
  {
    id: 'rn-076-podfile-newarch',
    title: 'iOS: remove New Architecture flag',
    description: 'RN 0.76+ enables the New Architecture by default — the Podfile opt-in flag is obsolete.',
    category: 'ios',
    risk: 'medium',
    review: true,
    newArch: true,
    applies: ctx =>
      isAtLeast(targetRn(ctx), [0, 76]) &&
      ctx.versions.ios.podfile !== null &&
      /(?:RCT_NEW_ARCH_ENABLED|ENABLE_NEW_ARCH_ENABLED)/.test(ctx.versions.ios.podfile || ''),
    codemod: ctx =>
      removeLines(
        ctx,
        ctx.versions.ios.podfilePath,
        ctx.versions.ios.podfile,
        /(?:RCT_NEW_ARCH_ENABLED|ENABLE_NEW_ARCH_ENABLED)/,
        'removed obsolete New Architecture flag from the Podfile'
      ),
    manual: ['Run `bundle exec pod install` after applying so the Podfile.lock and generated projects update.'],
  },
  {
    id: 'rn-070-codegen-native-component',
    title: 'JS: requireNativeComponent → codegenNativeComponent',
    description: 'New Architecture native components are declared with codegenNativeComponent instead of requireNativeComponent.',
    category: 'javascript',
    risk: 'medium',
    newArch: true,
    applies: ctx => projectHasPattern(ctx.root, /requireNativeComponent\s*\(/),
    codemod: ctx => codegenCodemod(ctx),
    manual: [
      'Verify each migrated component still renders — codegenNativeComponent needs a matching NativeComponentSpec (TurboModule) for the New Architecture.',
    ],
  },
  {
    id: 'rn-073-reacttestrenderer',
    title: 'JS: ReactTestRenderer import fix',
    description: 'ReactTestRenderer is no longer exported from react-native (0.73+); it lives in react-test-renderer.',
    category: 'javascript',
    risk: 'low',
    applies: ctx => projectHasPattern(ctx.root, /ReactTestRenderer/),
    codemod: ctx => reactTestRendererCodemod(ctx),
    manual: ['Add react-test-renderer to devDependencies: `npm i -D react-test-renderer@<react version>` (or `npx expo install react-test-renderer`).'],
  },
  {
    id: 'rn-074-android-sdk-levels',
    title: 'Android: SDK levels',
    description: 'Target RN releases raise the Android build SDK levels in android/build.gradle.',
    category: 'config',
    risk: 'medium',
    review: true,
    applies: ctx => ctx.versions.android.buildGradlePath !== null && isAtLeast(targetRn(ctx), [0, 74]),
    codemod: ctx => {
      const edits: CodemodEdit[] = []
      const min = targetRn(ctx)
      if (min === null) return null
      const compileSdkTarget = isAtLeast(min, [0, 78]) ? '36' : isAtLeast(min, [0, 76]) ? '35' : isAtLeast(min, [0, 74]) ? '34' : null
      const minSdkTarget = isAtLeast(min, [0, 74]) ? '23' : null
      if (compileSdkTarget) {
        const e = bumpGradleExt(ctx, 'compileSdkVersion', compileSdkTarget, 'compileSdkVersion')
        if (e) edits.push(e)
      }
      if (minSdkTarget) {
        const e = bumpGradleExt(ctx, 'minSdkVersion', minSdkTarget, 'minSdkVersion')
        if (e) edits.push(e)
      }
      return edits.length > 0 ? edits : null
    },
    manual: ['Also raise targetSdkVersion to match your store requirements (34+); exact values vary by release template.'],
  },
  {
    id: 'rn-077-android-build-requirements',
    title: 'Android: Kotlin / AGP requirements',
    description: 'Newer RN releases require newer Kotlin and Android Gradle Plugin versions.',
    category: 'android',
    risk: 'high',
    review: true,
    applies: ctx => ctx.versions.android.buildGradlePath !== null && isAtLeast(targetRn(ctx), [0, 74]),
    codemod: ctx => {
      const min = targetRn(ctx)
      if (min === null) return null
      const edits: CodemodEdit[] = []
      const kotlinTarget = isAtLeast(min, [0, 76]) ? '1.9.24' : '1.9.22'
      const agpTarget = isAtLeast(min, [0, 76]) ? '8.6.0' : '8.1.0'
      const kotlin = bumpGradleExt(ctx, 'kotlinVersion', kotlinTarget, 'kotlinVersion')
      if (kotlin) edits.push(kotlin)
      const agp = bumpGradleExt(ctx, 'agpVersion', agpTarget, 'agpVersion')
      if (agp) edits.push(agp)
      return edits.length > 0 ? edits : null
    },
    manual: [
      'RN 0.79+ templates move toward Kotlin 2.x and AGP 8.8+ — if your target exceeds this catalog table, align versions with the official release template.',
      'Java 17+ is required for AGP 8.x — check `org.gradle.java.home` / CI images.',
    ],
  },
  {
    id: 'rn-071-removed-prop-types',
    title: 'JS: removed react-native PropTypes',
    description: 'ColorPropType / EdgeInsetsPropType / PointPropType / ViewPropTypes were removed from react-native (0.71+).',
    category: 'deprecated',
    risk: 'medium',
    applies: ctx => projectHasPattern(ctx.root, /ColorPropType|EdgeInsetsPropType|PointPropType|ViewPropTypes/),
    codemod: null,
    manual: [
      'Replace ColorPropType with `color` / processColor-based validation, EdgeInsetsPropType with `EdgeInsets`, PointPropType with `Point`, ViewPropTypes with explicit prop types.',
    ],
  },
  {
    id: 'rn-newarch-native-modules',
    title: 'Migrate native modules to TurboModules',
    description: 'Legacy bridge modules (NativeModules / requireNativeComponent) need TurboModule specs for the New Architecture.',
    category: 'config',
    risk: 'high',
    newArch: true,
    applies: ctx => isAtLeast(targetRn(ctx), [0, 76]) && ctx.impact.some(f => f.category === 'native-module' || f.category === 'fabric'),
    codemod: null,
    manual: [
      'For each native module in the impact report: add a Native<Name>Spec.ts (TurboModuleRegistry.get) and annotate the native side with RCT_EXPORT_MODULE + getTurboModule.',
      'Unified specs: keep one spec per module — Fabric + legacy codegen share the source of truth.',
      'Set `newArchEnabled=true` (or stay on RN 0.76+ default) only after every module has a spec.',
    ],
  },
]

/* ------------------------------------------------------------------ */
/* Target helpers                                                     */
/* ------------------------------------------------------------------ */

/** Target RN minor used for version gating (SDK targets resolve via pairing). */
function targetRnMinor(ctx: CatalogContext): number | null {
  const target = ctx.target
  if (!target) return null
  const sdk = target.match(/^(\d{2})(?:\.\d+)?$/)
  if (sdk) {
    const sdkMinor = Number(sdk[1])
    if (sdkMinor >= 40) return EXPO_SDK_RN_PAIRS[sdkMinor] ?? null
  }
  const parts = versionParts(target)
  if (!parts) return null
  return parts[0] === 0 ? parts[1] : null
}

/** Target RN as [major, minor] using the Expo-SDK pairing when needed. */
export function targetRn(ctx: CatalogContext): [number, number] | null {
  const minor = targetRnMinor(ctx)
  if (minor === null) return null
  return [0, minor]
}

/** Resolve the RN version the target implies (SDK → paired RN string). */
export function resolveTargetRn(target: string | null): string | null {
  if (!target) return LATEST_KNOWN_RN
  if (target === 'latest') return LATEST_KNOWN_RN
  const sdk = target.match(/^(\d{2})(?:\.\d+)?$/)
  if (sdk) {
    const minor = Number(sdk[1])
    if (minor >= 40) {
      const rnMinor = EXPO_SDK_RN_PAIRS[minor]
      if (rnMinor) return `0.${rnMinor}.0`
    }
    return null
  }
  const parts = versionParts(target)
  if (!parts) return null
  if (parts[0] === 0 && parts[1] >= 60) return `${parts[0]}.${parts[1]}.${parts[2] ?? 0}`
  return null
}

/** Highest KNOWN_RN_MINORS (for --to latest). */
export function latestKnownRnMinor(): number {
  return Math.max(...KNOWN_RN_MINORS)
}

/** Highest Expo SDK the pairing table maps (default --to for Expo projects). */
export function latestKnownExpoSdk(): number {
  return Math.max(...Object.keys(EXPO_SDK_RN_PAIRS).map(Number))
}
