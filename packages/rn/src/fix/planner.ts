/**
 * vc fix — planner: turn each root-cause finding into one exact, literal file
 * edit (never a regex guess — `from` is the exact text present in the file).
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
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
        const target = readKotlinTarget(f.recommendedFix) ?? req?.kotlin ?? null
        if (project.kotlinVersion && target) {
          const e = editKotlin(root, target, project.kotlinVersion)
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
      default:
        // Manual: sdk-platform-not-found, java-version, ndk-version, network,
        // resource-link, hermes-android, xcode/cocoapods — no deterministic
        // file edit, the recommended fix is the command to run.
        break
    }
  }
  return dedupe(edits)
}

function readKotlinTarget(recommendedFix: string): string | null {
  const m = recommendedFix.match(/\b(\d+\.\d+(?:\.\d+)?)\b/)
  return m ? m[1] : null
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
