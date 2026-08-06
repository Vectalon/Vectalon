import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import { reportError } from './safe'
import type { PhaseResult } from '../adapters/types'

/**
 * Deep-link helpers for the visual verification loop: detect the app's URL
 * scheme (so the workflow can open the newly generated screen on a booted
 * simulator/emulator), build a deep link, and derive the new screen's name
 * from the implementation phase's artifacts.
 */

/** `LoginScreen` → `login-screen`; `ProfileTab` → `profile-tab`. */
export function kebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function stripScheme(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

/**
 * Detect the app's URL scheme from the project on disk:
 * 1. `app.json` / `app.config.json` — the Expo `expo.scheme` key (string or array)
 * 2. `ios` Info.plist files — `CFBundleURLSchemes` strings
 * 3. fallback — the package name (or directory name) lowercased
 */
export function detectUrlScheme(root: string): string | null {
  try {
    // 1. Expo scheme from app.json (string or array).
    for (const name of ['app.json', 'app.config.json']) {
      const appPath = join(root, name)
      if (!existsSync(appPath)) continue
      const app = JSON.parse(readFileSync(appPath, 'utf-8')) as { expo?: { scheme?: string | string[] } }
      const scheme = app.expo?.scheme
      if (Array.isArray(scheme)) {
        if (scheme.length > 0) return scheme[0]
      } else if (typeof scheme === 'string' && scheme) {
        return scheme
      }
    }

    // 2. iOS Info.plist — the first CFBundleURLScheme declared anywhere.
    if (existsSync(join(root, 'ios'))) {
      const plist = readDirRecursive(join(root, 'ios'))
        .filter(f => basename(f) === 'Info.plist')
        .map(f => {
          try {
            return readFileSync(f, 'utf-8')
          } catch (err) {
            reportError(err, 'deepLink: reading Info.plist')
            return ''
          }
        })
        .join('\n')
      const schemeMatch = new RegExp('<key>\\s*CFBundleURLSchemes\\s*</key>\\s*<array>\\s*<string>([^<]+)</string>').exec(plist)
      if (schemeMatch) return schemeMatch[1]
    }
  } catch (err) {
    reportError(err, 'deepLink: detecting scheme')
  }

  // 3. Fallback: package name, then directory name.
  try {
    const pkgPath = join(root, 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string }
      if (pkg.name) {
        const stripped = stripScheme(pkg.name)
        if (stripped) return stripped
      }
    }
  } catch (err) {
    reportError(err, 'deepLink: reading package.json')
  }
  const dir = stripScheme(basename(root))
  return dir || null
}

/** `myapp` + `LoginScreen` → `myapp://login-screen`. */
export function buildDeepLink(scheme: string, screen: string): string {
  return `${scheme}://${kebabCase(screen)}`
}

/**
 * Find the newly generated screen from the implementation phase's artifacts —
 * the visual check deep-links to it. Returns the component name
 * (`LoginScreen`) or null when the implementation produced no screen.
 */
export function deriveScreenFromImplementation(phases: PhaseResult[]): string | null {
  const impl = phases.find(p => p.id === 'implementation')
  if (!impl) return null
  const screenRe = new RegExp('src/screens/([A-Z][A-Za-z0-9]*Screen)\\.[jt]sx?', 'g')
  const seen = new Set<string>()
  for (const artifact of impl.artifacts) {
    const candidates: string[] = []
    if (artifact.path) {
      const m = new RegExp('screens/([A-Z][A-Za-z0-9]*Screen)\\.[jt]sx?').exec(artifact.path)
      if (m) candidates.push(m[1])
    }
    for (const match of artifact.content.matchAll(screenRe)) {
      candidates.push(match[1])
    }
    for (const name of candidates) {
      if (!seen.has(name)) {
        seen.add(name)
        return name
      }
    }
  }
  return null
}

function readDirRecursive(dir: string): string[] {
  const files: string[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...readDirRecursive(full))
      } else if (entry.isFile()) {
        files.push(full)
      }
    }
  } catch (err) {
    reportError(err, `deepLink: listing ${dir}`)
  }
  return files
}
