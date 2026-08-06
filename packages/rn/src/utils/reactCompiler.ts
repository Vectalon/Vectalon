import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { reportError } from './safe'

/**
 * React 19 / React Compiler detection — Phase VI-1.
 *
 * React 19 introduces `use()`, ref-as-prop (forwardRef deprecated), new
 * useEffect cleanup semantics, and the React Compiler (babel-plugin-react-
 * compiler) auto-memoizes components. Models trained on older patterns
 * generate incompatible code, so the harness needs to know which React the
 * project runs and whether the Compiler is on — guardrails can then flag
 * render-phase ref mutation, missing effect cleanup, `use()` outside
 * Suspense, unstable dependency arrays, and obsolete forwardRef, while the
 * context prompt explains the memoization implications.
 */

export interface ReactCompilerInfo {
  /** Whether the React Compiler (babel-plugin-react-compiler) is enabled. */
  enabled: boolean
  /** Files/config keys that contributed to the decision. */
  sources: string[]
  /** Human-readable explanation. */
  reason: string
  /** The React version resolved from the manifest ('' when unknown). */
  reactVersion: string
}

interface PackageLike {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null
  try {
    return readFileSync(path, 'utf-8')
  } catch (err) {
    reportError(err, 'reactCompiler: reading config file')
    return null
  }
}

const BABEL_CONFIG_NAMES = ['babel.config.js', 'babel.config.cjs', 'babel.config.mjs', 'babel.config.json', '.babelrc', '.babelrc.json', '.babelrc.js']
const ESLINT_CONFIG_NAMES = ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', 'eslint.config.js', 'eslint.config.mjs']

/** Parse `19.1.0` / `^19.0.0` / `~18.3.1` into a comparable major. */
export function reactMajor(version: string): number | null {
  const m = version.match(/(\d+)/)
  if (!m) return null
  return Number(m[1])
}

/** True when the project runs React 19+ (ref-as-prop, use(), cleanup semantics). */
export function isReact19(version: string): boolean {
  const major = reactMajor(version)
  return major !== null && major >= 19
}

/**
 * Detect whether the React Compiler is wired up. Signals, in precedence:
 * 1. `babel-plugin-react-compiler` (or `react-compiler`) in package.json
 *    dependencies / devDependencies.
 * 2. The plugin referenced from a babel config
 *    (`babel.config.js` / `.babelrc*`).
 * 3. `eslint-plugin-react-compiler` present (development-only signal — the
 *    plugin implies the compiler pipeline is in use).
 */
export function detectReactCompiler(root: string, pkg: PackageLike): ReactCompilerInfo {
  const sources: string[] = []
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  const reactVersion = allDeps['react'] || ''

  // 1. Manifest declares the plugin.
  if (allDeps['babel-plugin-react-compiler'] || allDeps['react-compiler']) {
    sources.push('package.json')
    return {
      enabled: true,
      sources,
      reason: 'babel-plugin-react-compiler is declared in package.json',
      reactVersion,
    }
  }

  // 2. Babel config references the plugin.
  for (const name of BABEL_CONFIG_NAMES) {
    const config = readIfExists(join(root, name))
    if (config && /babel-plugin-react-compiler|['"]react-compiler['"]/.test(config)) {
      sources.push(name)
      return {
        enabled: true,
        sources,
        reason: `${name} configures babel-plugin-react-compiler`,
        reactVersion,
      }
    }
  }

  // 3. ESLint config references the compiler plugin (weak signal).
  for (const name of ESLINT_CONFIG_NAMES) {
    const config = readIfExists(join(root, name))
    if (config && /eslint-plugin-react-compiler|react-compiler/.test(config)) {
      sources.push(name)
      return {
        enabled: true,
        sources,
        reason: `${name} enables eslint-plugin-react-compiler (compiler pipeline in use)`,
        reactVersion,
      }
    }
  }

  return {
    enabled: false,
    sources,
    reason: isReact19(reactVersion)
      ? `React ${reactVersion} without the React Compiler — React 19 semantics apply, components are not auto-memoized`
      : reactVersion
        ? `React ${reactVersion} — React Compiler not detected`
        : 'React version unknown and React Compiler not detected',
    reactVersion,
  }
}

/** Short label for prompts and reports. */
export function reactCompilerLabel(info: ReactCompilerInfo | undefined): string {
  if (!info) return 'unknown'
  if (info.enabled) return 'enabled (babel-plugin-react-compiler)'
  return 'not enabled'
}
