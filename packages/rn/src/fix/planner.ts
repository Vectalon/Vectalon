/**
 * vc fix — planner: turn each root-cause finding into one exact, literal file
 * edit (never a regex guess — `from` is the exact text present in the file).
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { reportError } from '../utils/safe'
import type { FixEdit, FixFinding } from './types'
import { readProjectContext, requirementsForRn, type ProjectContext } from './diagnose'

/** The exact build.gradle the project uses (root or app-level). */
export function buildGradlePath(root: string): string {
  if (existsSync(join(root, 'android', 'build.gradle'))) return 'android/build.gradle'
  if (existsSync(join(root, 'android', 'app', 'build.gradle'))) return 'android/app/build.gradle'
  if (existsSync(join(root, 'android', 'build.gradle.kts'))) return 'android/build.gradle.kts'
  return 'android/build.gradle'
}

function readFile(root: string, rel: string): string {
  try {
    const p = join(root, rel)
    return existsSync(p) ? readFileSync(p, 'utf-8') : ''
  } catch (err) {
    reportError(err, `vc fix: reading ${rel}`)
    return ''
  }
}

/** Bump compileSdkVersion: exact-text replace of the assignment line. */
function editCompileSdk(root: string, target: number, current: number): FixEdit | null {
  const file = buildGradlePath(root)
  const content = readFile(root, file)
  const m = content.match(/compileSdkVersion\s*=\s*(\d+)/) || content.match(/compileSdkVersion\s+(\d+)/)
  if (!m) return null
  const oldLine = m[0]
  const newLine = oldLine.replace(/\d+/, String(target))
  return {
    file,
    op: 'replace',
    from: oldLine,
    to: newLine,
    summary: `Raise compileSdkVersion ${current} → ${target}`,
  }
}

/** Bump the Kotlin plugin version in build.gradle (all common declaration forms). */
function editKotlin(root: string, target: string, current: string): FixEdit | null {
  const file = buildGradlePath(root)
  const content = readFile(root, file)
  const forms = [
    new RegExp(`kotlinVersion\\s*=\\s*['"]${current}['"]`),
    new RegExp(`ext\\.kotlin_version\\s*=\\s*['"]${current}['"]`),
    new RegExp(`kotlin\\(["']plugin["']\\)\\s*version\\s*["']${current}["']`),
    new RegExp(`org\\.jetbrains\\.kotlin(?:\\.[a-z]+)?["']?\\s*[:\\s]?["']?${current}["']?`),
  ]
  for (const re of forms) {
    const m = content.match(re)
    if (!m) continue
    const oldText = m[0]
    return {
      file,
      op: 'replace',
      from: oldText,
      to: oldText.replace(current, target),
      summary: `Upgrade Kotlin ${current} → ${target}`,
    }
  }
  return null
}

/** Bump the AGP classpath in build.gradle. */
function editAgp(root: string, target: string, current: string): FixEdit | null {
  const file = buildGradlePath(root)
  const content = readFile(root, file)
  const m = content.match(new RegExp(`com\\.android\\.tools\\.build:gradle["']?\\s*[:\\s]?["']?${current}["']?`))
  if (!m) return null
  return {
    file,
    op: 'replace',
    from: m[0],
    to: m[0].replace(current, target),
    summary: `Bump AGP ${current} → ${target}`,
  }
}

/** Bump the Gradle wrapper distributionUrl. */
function editGradleWrapper(root: string, target: string, current: string): FixEdit | null {
  const file = 'android/gradle/wrapper/gradle-wrapper.properties'
  const content = readFile(root, file)
  const m = content.match(new RegExp(`distributionUrl=.*gradle-${current}-bin\\.zip`))
  if (!m) return null
  return {
    file,
    op: 'replace',
    from: m[0],
    to: m[0].replace(`gradle-${current}-bin.zip`, `gradle-${target}-bin.zip`),
    summary: `Bump Gradle wrapper ${current} → ${target}`,
  }
}

/** Raise minSdkVersion in the root build.gradle. */
function editMinSdk(root: string, target: number, current: number): FixEdit | null {
  const file = buildGradlePath(root)
  const content = readFile(root, file)
  const m = content.match(/minSdkVersion\s*=\s*(\d+)/) || content.match(/minSdkVersion\s+(\d+)/)
  if (!m) return null
  const oldLine = m[0]
  const newLine = oldLine.replace(/\d+/, String(target))
  return {
    file,
    op: 'replace',
    from: oldLine,
    to: newLine,
    summary: `Raise minSdkVersion ${current} → ${target}`,
  }
}

/** Raise the iOS deployment target in ios/Podfile (a top CocoaPods failure). */
function editPodfileTarget(root: string, current: string, target: string): FixEdit | null {
  const file = 'ios/Podfile'
  const content = readFile(root, file)
  const m = content.match(/platform\s*:\s*ios\s*,\s*['"](\d+(?:\.\d+)?)['"]/)
  if (!m) return null
  const oldText = m[0]
  const newText = oldText.replace(m[1], target)
  return {
    file,
    op: 'replace',
    from: oldText,
    to: newText,
    summary: `Raise iOS deployment target ${current} → ${target}`,
  }
}

/** Add the missing AGP-8 namespace block to android/app/build.gradle. */
function editNamespace(root: string): FixEdit | null {
  const file = 'android/app/build.gradle'
  const content = readFile(root, file)
  if (/namespace\s+['"][^'"]+['"]/.test(content)) return null
  const m = content.match(/^\s*apply plugin: "com\.facebook\.react"/m)
  if (!m) return null
  const indent = m[0].match(/^\s*/)?.[0] ?? ''
  return {
    file,
    op: 'insert-after',
    from: m[0],
    to: `${m[0]}\n${indent}namespace "com.rnbenchapp"`,
    summary: 'Add AGP-8 namespace to android/app/build.gradle',
  }
}

/** Raise the Gradle daemon heap in android/gradle.properties. */
function editJvmArgs(root: string, current: string): FixEdit | null {
  const file = 'android/gradle.properties'
  const content = readFile(root, file)
  const m = content.match(/org\.gradle\.jvmargs=([^\n]*)/)
  if (!m) return null
  const oldText = m[0]
  const newText = oldText.replace(/Xmx\d+[gGmM]/, 'Xmx4g')
  if (newText === oldText) {
    return {
      file,
      op: 'replace',
      from: oldText,
      to: `org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g ${current.replace(/^-?\s*/, '')}`.trimEnd(),
      summary: 'Raise Gradle daemon heap to -Xmx4g',
    }
  }
  return {
    file,
    op: 'replace',
    from: oldText,
    to: newText,
    summary: 'Raise Gradle daemon heap to -Xmx4g',
  }
}

/** Align the NDK version in android/build.gradle to the RN-required NDK. */
function editNdk(root: string, target: string): FixEdit | null {
  const file = buildGradlePath(root)
  const content = readFile(root, file)
  const m = content.match(/ndkVersion\s*=\s*["']([\d.]+)["']/)
  if (!m) return null
  const oldLine = m[0]
  return {
    file,
    op: 'replace',
    from: oldLine,
    to: oldLine.replace(m[1], target),
    summary: `Align ndkVersion ${m[1]} → ${target}`,
  }
}

/** Disable the New Architecture in android/gradle.properties. */
function editNewArch(root: string): FixEdit | null {
  const file = 'android/gradle.properties'
  const content = readFile(root, file)
  const m = content.match(/newArchEnabled\s*=\s*true/)
  const oldLine = m ? m[0] : null
  if (oldLine) {
    return { file, op: 'replace', from: oldLine, to: 'newArchEnabled=false', summary: 'Disable New Architecture (newArchEnabled=false)' }
  }
  if (/newArchEnabled\s*=\s*false/.test(content)) return null
  const anchor = content.match(/org\.gradle\.jvmargs=[^\n]*/)?.[0]
  if (!anchor) return null
  return {
    file,
    op: 'insert-after',
    from: anchor,
    to: `${anchor}\nnewArchEnabled=false`,
    summary: 'Disable New Architecture (newArchEnabled=false)',
  }
}

/** Add the missing native project to android/settings.gradle (autolinking gap). */
function editSettingsInclude(root: string, project: string): FixEdit | null {
  const file = 'android/settings.gradle'
  const content = readFile(root, file)
  if (content.includes(`include ':${project}'`)) return null
  const anchor = content.match(/include ':[^']+'/)?.[0] ?? `include ':app'`
  if (!content.includes(anchor)) return null
  return {
    file,
    op: 'insert-after',
    from: anchor,
    to: `${anchor}\ninclude ':${project}'\nproject(':${project}').projectDir = new File(rootProject.projectDir, '../node_modules/${project}/android')`,
    summary: `Include :${project} in android/settings.gradle`,
  }
}

/** Declare the JitPack repository for com.github.* artifacts. */
function editJitpackRepo(root: string): FixEdit | null {
  const file = 'android/settings.gradle'
  const content = readFile(root, file)
  if (content.includes('jitpack')) return null
  const anchor = content.match(/^repositories\s*\{/m) ? 'repositories {' : content.match(/include ':[^']+'/)?.[0]
  if (!anchor) return null
  return {
    file,
    op: 'insert-after',
    from: anchor,
    to: `${anchor}\nmaven { url 'https://jitpack.io' }`,
    summary: 'Declare JitPack repository in android/settings.gradle',
  }
}

/** Force the newer of two duplicate-class modules in android/app/build.gradle, and drop the older module's explicit implementation line. */
function editResolutionStrategy(root: string, groups: Array<{ group: string; version: string }>): FixEdit[] {
  const file = 'android/app/build.gradle'
  const content = readFile(root, file)
  if (content.includes('resolutionStrategy')) return []
  const anchor = content.match(/apply plugin: "com\.facebook\.react"/)?.[0]
  if (!anchor) return []
  const forces = groups.map(g => `force "${g.group}:${g.version}"`).join('\n        ')
  const edits: FixEdit[] = [
    {
      file,
      op: 'insert-after',
      from: anchor,
      to: `${anchor}\n\nconfigurations.all {\n    resolutionStrategy {\n        ${forces}\n    }\n}`,
      summary: 'Add resolutionStrategy forcing the newer duplicate-class module',
    },
  ]
  const older = groups[groups.length - 1]
  const depLine = content.split('\n').find(l => /^\s*implementation\(/.test(l) && l.includes(older.group))
  if (depLine) {
    edits.push({ file, op: 'replace', from: depLine, to: '', summary: `Drop the older ${older.group} implementation line (dedupe to the forced version)` })
  }
  return edits
}

/** Insert a missing pod into ios/Podfile (autolinking gap for a new native package). */
function editPodfilePod(root: string, podName: string, podPath: string): FixEdit | null {
  const file = 'ios/Podfile'
  const content = readFile(root, file)
  if (content.includes(`pod '${podName}'`)) return null
  const anchor = content.match(/config = use_native_modules!/)?.[0] ?? content.match(/use_react_native!/)?.[0]
  if (!anchor) return null
  return {
    file,
    op: 'insert-after',
    from: anchor,
    to: `${anchor}\n  pod '${podName}', :path => '${podPath}'`,
    summary: `Add pod '${podName}' to ios/Podfile`,
  }
}

/** Resolve a relative module specifier against the project and rewrite the import. */
function editImportPath(root: string, file: string, specifier: string): FixEdit | null {
  const content = readFile(root, file)
  if (!content.includes(specifier)) return null
  // The specifier relative to the importing file's directory.
  const base = specifier.replace(/^[.]+\//, '')
  const last = base.split('/').pop() ?? ''
  const dir = base.slice(0, base.length - last.length)
  // Candidates: exact basename with any TS/JS extension, then prefix matches
  // (Home → HomeScreen.tsx) and index files.
  const candidates = findModuleCandidates(root, dir, last)
  if (candidates.length === 0) return null
  const target = candidates[0].replace(/\.(tsx?|jsx?)$/, '')
  // Never span newlines — the specifier sits on one import line.
  const from = content.match(new RegExp(`['"][^'\n"]*${escapeRe(last)}[^'\n"]*['"]`))?.[0]
  if (!from) return null
  const fixed = `'./${target}'`
  return {
    file,
    op: 'replace',
    from,
    to: fixed,
    summary: `Fix import ${specifier} → ${fixed}`,
  }
}

/** List files under root/<dir> whose basename matches (exact then prefix) the missing module. */
function findModuleCandidates(root: string, dir: string, basename: string): string[] {
  const full = join(root, dir)
  let entries: string[] = []
  try {
    if (existsSync(full)) entries = readdirSync(full)
  } catch {
    return []
  }
  const exts = ['.ts', '.tsx', '.js', '.jsx']
  const exact = entries.find(e => exts.some(x => e === basename + x))
  const index = entries.find(e => e.startsWith('index'))
  const prefix = entries
    .filter(e => e.toLowerCase().startsWith(basename.toLowerCase()) && exts.some(x => e.endsWith(x)))
    .sort((a, b) => a.length - b.length)[0]
  const chosen = exact ?? prefix ?? index
  if (!chosen) return []
  return [`${dir}${chosen}`]
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Extract the named exports of a module from its source text. */
function moduleExportedNames(content: string): string[] {
  const names = new Set<string>()
  const decl = /export\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/g
  for (const m of content.matchAll(decl)) names.add(m[1])
  const list = /export\s*\{([^}]+)\}/g
  for (const m of content.matchAll(list)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().match(/^(?:type\s+)?([A-Za-z_$][\w$]*)/)?.[1]
      if (n) names.add(n)
    }
  }
  const dflt = /export\s+default\s+([A-Za-z_$][\w$]*)/g
  for (const m of content.matchAll(dflt)) names.add(m[1])
  return [...names]
}

/** Longest shared prefix — the honest deterministic match for a renamed export. */
function longestSharedPrefix(a: string, b: string): string {
  let i = 0
  const max = Math.min(a.length, b.length)
  while (i < max && a[i].toLowerCase() === b[i].toLowerCase()) i++
  return a.slice(0, i)
}

/** Read the source of a relative-specifier module ('' .ts .tsx .js .jsx /index.*). */
function readModuleSource(root: string, importer: string, specifier: string): string {
  if (!specifier.startsWith('.')) return ''
  const base = join(dirname(importer), specifier)
  for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']) {
    const content = readFile(root, `${base}${ext}`)
    if (content) return content
  }
  return ''
}

/**
 * Rewrite a named import binding (TS2305): the missing name → the tsc
 * "Did you mean" suggestion (or the module-export match). Only the brace
 * list is touched — the specifier is never rewritten.
 */
function editRenameImportBinding(root: string, file: string, line: number, missing: string, replacement: string): FixEdit | null {
  const content = readFile(root, file)
  const lines = content.split('\n')
  const idx = line - 1
  if (idx < 0 || idx >= lines.length) return null
  const oldLine = lines[idx]
  const listMatch = oldLine.match(/\{\s*([^}]+)\}/)
  if (!listMatch) return null
  const entries = listMatch[1].split(',').map(s => s.trim())
  const hit = entries.findIndex(e => e === missing || e === `type ${missing}` || e.startsWith(`${missing} as `) || e.endsWith(` as ${missing}`))
  if (hit < 0) return null
  entries[hit] = replacement
  const at = listMatch.index ?? 0
  const newLine = oldLine.slice(0, at) + '{ ' + entries.join(', ') + ' }' + oldLine.slice(at + listMatch[0].length)
  if (newLine === oldLine) return null
  return { file, op: 'replace', from: oldLine, to: newLine, summary: `Rename import binding ${missing} → ${replacement} (TS2305)` }
}

/** Drop a chained property call named by a TS2339 error (`el.getNativeNode()` → `el`). */
function editDropProperty(root: string, file: string, line: number, prop: string): FixEdit | null {
  const content = readFile(root, file)
  const lines = content.split('\n')
  const idx = line - 1
  if (idx < 0 || idx >= lines.length) return null
  const oldLine = lines[idx]
  const re = new RegExp(`\\.\\s*${escapeRe(prop)}\\s*\\(\\)`)
  const newLine = oldLine.replace(re, '')
  if (newLine === oldLine) return null
  return { file, op: 'replace', from: oldLine, to: newLine, summary: `Drop removed property call .${prop}()` }
}

/** Unquote a string literal assigned to a number-typed target (TS2322 string→number). */
function editUnquoteLiteral(root: string, file: string, line: number): FixEdit | null {
  const content = readFile(root, file)
  const lines = content.split('\n')
  const idx = line - 1
  if (idx < 0 || idx >= lines.length) return null
  const oldLine = lines[idx]
  const newLine = oldLine.replace(/['"](-?\d+(?:\.\d+)?)['"]/g, '$1')
  if (newLine === oldLine) return null
  return { file, op: 'replace', from: oldLine, to: newLine, summary: 'Convert string literal to number literal (TS2322)' }
}

/** Remove duplicate const/let declarations, keeping the last (TS2300 merge-conflict fix). */
function editDedupeDeclarations(root: string, file: string, name: string): FixEdit | null {
  const content = readFile(root, file)
  const re = new RegExp(`^(\\s*)(const|let)\\s+${escapeRe(name)}\\b[^\\n]*$`, 'gm')
  const matches = [...content.matchAll(re)]
  if (matches.length < 2) return null
  // Remove every declaration except the last.
  let next = content
  for (const m of matches.slice(0, -1)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    next = next.slice(0, start) + next.slice(end)
  }
  const from = matches.slice(0, -1).map(m => m[0]).join('\n')
  const to = ''
  return { file, op: 'replace', from, to, summary: `Remove duplicate declaration of ${name} (keep the last)` }
}

/** Strip an unknown JSX attribute named by a TS2322 object-type error. */
function editStripUnknownProp(root: string, file: string, line: number, prop: string): FixEdit | null {
  const content = readFile(root, file)
  const lines = content.split('\n')
  const idx = line - 1
  if (idx < 0 || idx >= lines.length) return null
  const oldLine = lines[idx]
  const newLine = oldLine.replace(new RegExp(`\\s+${escapeRe(prop)}\\s*=\\s*\\{[^}]*\\}`), '').replace(new RegExp(`\\s+${escapeRe(prop)}\\s*=\\s*["'][^"']*["']`), '')
  if (newLine === oldLine) return null
  return { file, op: 'replace', from: oldLine, to: newLine, summary: `Remove unknown prop ${prop}` }
}

/** Add a missing bare package to package.json dependencies (module-resolution fix). */
function editAddDependency(root: string, pkg: string, section: 'dependencies' | 'devDependencies'): FixEdit | null {
  const file = 'package.json'
  const content = readFile(root, file)
  if (content.includes(`"${pkg}"`)) return null
  const anchor = content.match(new RegExp(`"${section}"\\s*:\\s*\\{`))?.[0]
  if (!anchor) return null
  return {
    file,
    op: 'insert-after',
    from: anchor,
    to: `${anchor}\n    "${pkg}": "*"`,
    summary: `Add ${pkg} to package.json ${section}`,
  }
}

/** Raise the Metro heap via NODE_OPTIONS in the package.json start script. */
function editOomScript(root: string): FixEdit | null {
  const file = 'package.json'
  const content = readFile(root, file)
  const m = content.match(/"start"\s*:\s*"([^"]+)"/)
  if (!m) return null
  const oldLine = m[0]
  if (oldLine.includes('NODE_OPTIONS')) return null
  return {
    file,
    op: 'replace',
    from: oldLine,
    to: oldLine.replace(m[1], `NODE_OPTIONS=--max-old-space-size=4096 ${m[1]}`),
    summary: 'Raise Metro heap with NODE_OPTIONS in the start script',
  }
}

/** Align the hermes-engine dependency in package.json to the RN version. */
function editHermesAlign(root: string): FixEdit | null {
  const file = 'package.json'
  const content = readFile(root, file)
  const m = content.match(/"hermes-engine"\s*:\s*"([^"]+)"/)
  if (!m) return null
  // Align to the raw react-native version string from package.json (0.74.0),
  // never the lossy float (0.74).
  const rn = content.match(/"react-native"\s*:\s*"([^"]+)"/)?.[1]
  if (!rn || rn === m[1]) return null
  return {
    file,
    op: 'replace',
    from: m[0],
    to: m[0].replace(m[1], rn),
    summary: `Align hermes-engine to react-native ${rn}`,
  }
}

/** Enable Hermes in android/gradle.properties (hermesEnabled=true). */
function editHermesEnable(root: string): FixEdit | null {
  const file = 'android/gradle.properties'
  const content = readFile(root, file)
  if (content.includes('hermesEnabled=true')) return null
  const off = content.match(/hermesEnabled\s*=\s*false/)?.[0]
  if (off) {
    return { file, op: 'replace', from: off, to: 'hermesEnabled=true', summary: 'Enable Hermes (hermesEnabled=false → true)' }
  }
  const anchor = content.match(/android\.enableJetifier=[^\n]*/)?.[0] ?? content.match(/org\.gradle\.jvmargs=[^\n]*/)?.[0]
  if (!anchor) return null
  return {
    file,
    op: 'insert-after',
    from: anchor,
    to: `${anchor}\nhermesEnabled=true`,
    summary: 'Enable Hermes (hermesEnabled=true) in android/gradle.properties',
  }
}

/** Rewrite a JSX element to a React.createElement call (TS17004 in a .ts file). */
function editJsxToCreateElement(root: string, file: string, line: number): FixEdit | null {
  const content = readFile(root, file)
  const lines = content.split('\n')
  const idx = line - 1
  if (idx < 0 || idx >= lines.length) return null
  const oldLine = lines[idx]
  const pair = oldLine.match(/<(\w+)(?:\s+[^>]*)?>([^<]*)<\/\1>/)
  if (pair) {
    const el = pair[1]
    const children = pair[2]
    const create = children.trim() ? `React.createElement(${el}, null, '${children.trim()}')` : `React.createElement(${el}, null, null)`
    const newLine = oldLine.replace(pair[0], create)
    if (newLine === oldLine) return null
    return { file, op: 'replace', from: oldLine, to: newLine, summary: `Rewrite JSX <${el}> to React.createElement (TS17004 in a .ts file)` }
  }
  const selfClosing = oldLine.match(/<(\w+)(?:\s+[^>]*)?\s*\/>/)
  if (selfClosing) {
    const el = selfClosing[1]
    const newLine = oldLine.replace(selfClosing[0], `React.createElement(${el}, null, null)`)
    if (newLine === oldLine) return null
    return { file, op: 'replace', from: oldLine, to: newLine, summary: `Rewrite JSX <${el}/> to React.createElement (TS17004 in a .ts file)` }
  }
  return null
}

/** Annotate a bare parameter named by TS7006 with `unknown` (the honest conservative default). */
function editAnnotateParamUnknown(root: string, file: string, line: number, param: string): FixEdit | null {
  const content = readFile(root, file)
  const lines = content.split('\n')
  const idx = line - 1
  if (idx < 0 || idx >= lines.length) return null
  const oldLine = lines[idx]
  const re = escapeRe(param)
  // Only touch the parameter list, never the usages (return e; stays bare).
  const withParens = oldLine.replace(
    /(function\s+[\w$]+\s*\([^)]*\)|\([^)]*\)\s*=>)/,
    m => m.replace(new RegExp(`\\b${re}\\b`), `${param}: unknown`)
  )
  if (withParens !== oldLine) {
    return { file, op: 'replace', from: oldLine, to: withParens, summary: `Annotate parameter ${param} with : unknown (TS7006)` }
  }
  // Bare arrow param without parens: `e => ...`.
  const arrow = oldLine.replace(new RegExp(`\\b${re}\\b(?=\\s*=>)`), `${param}: unknown`)
  if (arrow !== oldLine) {
    return { file, op: 'replace', from: oldLine, to: arrow, summary: `Annotate parameter ${param} with : unknown (TS7006)` }
  }
  return null
}

/** Insert the compiler-listed missing props into a JSX opening tag as `name=""` placeholders. */
function editAddMissingProps(root: string, file: string, line: number, props: string[]): FixEdit | null {
  const content = readFile(root, file)
  const lines = content.split('\n')
  const idx = line - 1
  if (idx < 0 || idx >= lines.length || props.length === 0) return null
  const oldLine = lines[idx]
  const insert = props.map(p => `${p}=""`).join(' ')
  // Lazy [^>]*? so the self-closing slash stays with `/>`, never the attrs.
  const newLine = oldLine.replace(/<(\w+)([^>]*?)(\/?>)/, (_m, el: string, rest: string, close: string) =>
    `<${el}${rest.replace(/\s+$/, '')} ${insert}${close === '/>' ? ' ' : ''}${close}`
  )
  if (newLine === oldLine) return null
  return { file, op: 'replace', from: oldLine, to: newLine, summary: `Add missing prop${props.length > 1 ? 's' : ''} ${props.join(', ')} to <${oldLine.match(/<(\w+)/)?.[1] ?? 'component'}> (TS2739)` }
}

/** Fill an unknown identifier (TS2304) from the app manifest when it looks like an app-name constant. */
function editFillIdentifierFromManifest(root: string, file: string, line: number, identifier: string): FixEdit | null {
  if (!/app|name|display|title/i.test(identifier)) return null
  const value = manifestAppName(root)
  if (!value) return null
  const content = readFile(root, file)
  const lines = content.split('\n')
  const idx = line - 1
  if (idx < 0 || idx >= lines.length) return null
  const oldLine = lines[idx]
  const re = escapeRe(identifier)
  // JSX text braces first: `{AppName}` → the raw name; then any bare usage → a quoted literal.
  const newLine = oldLine
    .replace(new RegExp(`\\{${re}\\}`, 'g'), value)
    .replace(new RegExp(`\\b${re}\\b`, 'g'), `'${value}'`)
  if (newLine === oldLine) return null
  return { file, op: 'replace', from: oldLine, to: newLine, summary: `Fill unknown identifier ${identifier} from the app manifest (${value})` }
}

/** The app's display name: app.json displayName → app.json name → package.json name. */
function manifestAppName(root: string): string | null {
  for (const rel of ['app.json', 'package.json']) {
    const content = readFile(root, rel)
    if (!content) continue
    const m = rel === 'app.json' ? content.match(/"displayName"\s*:\s*"([^"]+)"/) ?? content.match(/"name"\s*:\s*"([^"]+)"/) : content.match(/"name"\s*:\s*"([^"]+)"/)
    if (m?.[1]) return m[1]
  }
  return null
}

/**
 * One deterministic edit per auto-fixable finding. Manual findings (SDK
 * installs, JDK, pods) produce no edit — the recommended fix is a command the
 * user runs. The RN-required version table drives the targets.
 */
export function planEdits(root: string, findings: FixFinding[], ctx?: ProjectContext): FixEdit[] {
  const project = ctx ?? readProjectContext(root)
  const req = requirementsForRn(project.rnVersion)
  const edits: FixEdit[] = []
  for (const f of findings) {
    switch (f.id) {
      case 'compile-sdk-version': {
        if (project.compileSdk !== null && req) {
          const e = editCompileSdk(root, req.compileSdk, project.compileSdk)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'kotlin-version': {
        const parsed = readKotlinTarget(f.recommendedFix)
        const target = parsed ? padVersion(parsed) : req?.kotlin ?? null
        if (project.kotlinVersion && target) {
          const e = editKotlin(root, target, padVersion(project.kotlinVersion))
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'agp-version': {
        if (project.agpVersion && req) {
          const e = editAgp(root, req.agp, project.agpVersion)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'gradle-wrapper-version': {
        if (project.gradleVersion && req) {
          const e = editGradleWrapper(root, req.gradle, project.gradleVersion)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'gradle-memory': {
        if (project.jvmArgs !== null) {
          const e = editJvmArgs(root, project.jvmArgs)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'min-sdk-version': {
        if (project.minSdk !== null) {
          const floor = Number(f.params?.minSdkFloor ?? 23)
          const e = editMinSdk(root, floor, project.minSdk)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'agp-namespace': {
        const e = editNamespace(root)
        if (e) { edits.push(e); f.edit = e }
        break
      }
      case 'deployment-target': {
        const podfile = readFile(root, 'ios/Podfile')
        const cur = podfile.match(/platform\s*:\s*ios\s*,\s*['"](\d+(?:\.\d+)?)['"]/)?.[1]
        const target = f.params?.deploymentTarget ?? '15.0'
        if (cur && (Number(cur) < Number(target))) {
          const e = editPodfileTarget(root, cur, target)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'ndk-version': {
        // Prefer the RN-required NDK — the log's NDK path names the *current*
        // (broken) version, so aligning to it would be a no-op.
        const target = req?.ndk ?? f.params?.ndkVersion ?? null
        if (target) {
          const e = editNdk(root, target)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'new-arch-mismatch': {
        const e = editNewArch(root)
        if (e) { edits.push(e); f.edit = e }
        break
      }
      case 'pod-not-found':
      case 'pod-install-needed': {
        if (f.params?.podName) {
          const e = editPodfilePod(root, f.params.podName, f.params.podPath ?? `../node_modules/${f.params.podName}`)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'module-resolution': {
        if (f.params?.specifier) {
          if (f.params.specifier.startsWith('.')) {
            const file = f.params.importer ?? 'src/App.tsx'
            const e = editImportPath(root, file, f.params.specifier)
            if (e) { edits.push(e); f.edit = e }
          } else if (f.params.specifier.startsWith('react-native')) {
            const e = editAddDependency(root, f.params.specifier, 'dependencies')
            if (e) { edits.push(e); f.edit = e }
          }
        }
        break
      }
      case 'babel-plugin-missing': {
        if (f.params?.preset) {
          const e = editAddDependency(root, f.params.preset, 'devDependencies')
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'out-of-memory': {
        const e = editOomScript(root)
        if (e) { edits.push(e); f.edit = e }
        break
      }
      case 'dependency-resolution': {
        if (f.params?.nativeProject) {
          const e = editSettingsInclude(root, f.params.nativeProject)
          if (e) { edits.push(e); f.edit = e }
        } else if (f.params?.githubRepo) {
          const e = editJitpackRepo(root)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'duplicate-class': {
        // The classifier's message is a short label; the group:version pairs
        // come from the log line (params, set by enrichFindingParams) — fall
        // back to the message only when the params were not parsed.
        let groups: Array<{ group: string; version: string }> = []
        if (f.params?.duplicateModules) {
          try { groups = JSON.parse(f.params.duplicateModules) } catch { groups = [] }
        } else {
          groups = parseDuplicateModules(f.message)
        }
        if (groups.length >= 2) {
          const es = editResolutionStrategy(root, groups)
          for (const e of es) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'ts-module-not-found': {
        if (f.params?.specifier) {
          const file = f.params.file ?? 'src/screens/Broken.tsx'
          const e = editImportPath(root, file, f.params.specifier)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'ts-property-not-exist': {
        const prop = f.params?.tsMsg?.match(/Property ['"]([^'"]+)['"]/)?.[1]
        if (prop && f.params?.file && f.params?.line) {
          const e = editDropProperty(root, f.params.file, Number(f.params.line), prop)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'ts-no-exported-member': {
        // tsc names the missing export and, when a close match exists, suggests
        // the rename itself ("Did you mean to use 'X'?") — compiler-authoritative.
        // Without a suggestion, read the module's exports and pick the unique
        // longest-prefix match (the deterministic version of "open the file");
        // ambiguity or no match → manual fix, never a guess.
        if (f.params?.file && f.params?.line && f.params?.tsMsg) {
          const missing = f.params.tsMsg.match(/has no exported member ['"]([^'"]+)['"]/)?.[1]
          let replacement = f.params.tsMsg.match(/Did you mean(?: to use)? ['"]([^'"]+)['"]/)?.[1]
          if (!replacement && missing) {
            const spec = f.params.tsMsg.match(/Module ['"]([^'"]+)['"]/)?.[1]
            if (spec) {
              const candidates = moduleExportedNames(readModuleSource(root, f.params.file, spec))
                .filter(n => n.toLowerCase() !== missing.toLowerCase())
              const scored = candidates
                .map(n => ({ n, p: longestSharedPrefix(missing, n).length }))
                .filter(s => s.p >= 2)
                .sort((a, b) => b.p - a.p)
              const best = scored[0]
              if (best && scored.filter(s => s.p === best.p).length === 1) replacement = best.n
            }
          }
          if (missing && replacement) {
            const e = editRenameImportBinding(root, f.params.file, Number(f.params.line), missing, replacement)
            if (e) { edits.push(e); f.edit = e }
          }
        }
        break
      }
      case 'ts-type-not-assignable': {
        // string → number literal unquote (setCount('5') → setCount(5))
        if (/Type ['"]string['"] is not assignable to type ['"]number['"]/.test(f.params?.tsMsg ?? '')) {
          if (f.params?.file && f.params?.line) {
            const e = editUnquoteLiteral(root, f.params.file, Number(f.params.line))
            if (e) { edits.push(e); f.edit = e }
          }
        } else if (f.params?.file && f.params?.line && f.params?.tsMsg) {
          // unknown prop in an object type: strip the named attribute(s)
          const objKeys = f.params.tsMsg.match(/\{([^}]*)\}/)?.[1]
          const props = (objKeys ?? '').match(/[A-Za-z][A-Za-z0-9_]*/g) ?? []
          for (const prop of props) {
            const e = editStripUnknownProp(root, f.params.file, Number(f.params.line), prop)
            if (e) { edits.push(e); f.edit = e }
          }
        }
        break
      }
      case 'ts-duplicate-identifier': {
        const name = f.params?.tsMsg?.match(/Duplicate identifier ['"]([^'"]+)['"]/)?.[1]
        if (name && f.params?.file) {
          const e = editDedupeDeclarations(root, f.params.file, name)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'hermes-android': {
        // Version mismatch: align hermes-engine to the RN version.
        if (project.rnVersion && f.params?.hermesVersion && f.params.hermesVersion !== String(project.rnVersion)) {
          const e = editHermesAlign(root)
          if (e) { edits.push(e); f.edit = e }
        } else if (f.params?.hermesDisabled === 'true') {
          const e = editHermesEnable(root)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'ts-jsx-not-supported': {
        if (f.params?.file && f.params?.line) {
          const e = editJsxToCreateElement(root, f.params.file, Number(f.params.line))
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'ts-this-expression': {
        // TS7006 names the bare parameter — annotate it with unknown.
        const param = f.params?.tsMsg?.match(/Parameter ['"]([^'"]+)['"]/)?.[1]
        if (param && f.params?.file && f.params?.line) {
          const e = editAnnotateParamUnknown(root, f.params.file, Number(f.params.line), param)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'ts-missing-props': {
        // TS2739 lists the missing props — insert each as a `prop=""` placeholder.
        const list = f.params?.tsMsg?.match(/missing the following properties from type ['"][^'"]*['"]:\s*([^.\n]+)/)?.[1]
        const props = (list ?? '').split(',').map(s => s.trim()).filter(s => /^[A-Za-z][\w-]*$/.test(s))
        if (props.length > 0 && f.params?.file && f.params?.line) {
          const e = editAddMissingProps(root, f.params.file, Number(f.params.line), props)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      case 'ts-cannot-find-name': {
        // TS2304 names an unknown identifier — fill it from the app manifest
        // when it looks like an app-name constant (AppName, …).
        const identifier = f.params?.tsMsg?.match(/Cannot find name ['"]([^'"]+)['"]/)?.[1]
        if (identifier && f.params?.file && f.params?.line) {
          const e = editFillIdentifierFromManifest(root, f.params.file, Number(f.params.line), identifier)
          if (e) { edits.push(e); f.edit = e }
        }
        break
      }
      default:
        // Manual: sdk-platform-not-found, java-version, network, resource-link,
        // hermes-android, code-signing/provisioning/linker/plist — no
        // deterministic file edit, the recommended fix is the command to run.
        break
    }
  }
  return dedupe(edits)
}

/** Parse `found in modules play-services-basement-17.6.0 (com.google.android.gms:play-services-basement:17.6.0) and play-services-base-18.0.0 (com.google.android.gms:play-services-base:18.0.0)` into group:version pairs. */
function parseDuplicateModules(message: string): Array<{ group: string; version: string }> {
  const re = /\(([\w.]+):([\w.-]+):([\d.]+)\)/g
  const out: Array<{ group: string; version: string }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(message)) !== null) {
    out.push({ group: `${m[1]}:${m[2]}`, version: m[3] })
  }
  // Keep the highest version first.
  return out.sort((a, b) => compareVersionParts(b.version) - compareVersionParts(a.version))
}

function compareVersionParts(v: string): number {
  return Number(v.split('.').slice(0, 3).map(p => p.padStart(4, '0')).join(''))
}

function readKotlinTarget(recommendedFix: string): string | null {
  const m = recommendedFix.match(/\b(\d+\.\d+(?:\.\d+)?)\b/)
  return m ? m[1] : null
}

/** Normalize a version to at least three parts (1.9 → 1.9.0) so the edit matches the file. */
function padVersion(v: string): string {
  const parts = v.split('.')
  while (parts.length < 3) parts.push('0')
  return parts.slice(0, 3).join('.')
}

function dedupe(edits: FixEdit[]): FixEdit[] {
  const seen = new Set<string>()
  return edits.filter(e => {
    const key = `${e.file}\u0000${e.from}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
