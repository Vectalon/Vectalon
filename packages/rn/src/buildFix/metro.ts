/**
 * vectalon build-fix — Metro bundler failure classifier (Roadmap Phase 8,
 * item 064)
 * Business Source License 1.1 (BSL-1.1)
 *
 * A pattern-based parser for `react-native bundle` / `expo export` /
 * `react-native start` failure output: module resolution, transform/syntax
 * errors, haste collisions, port conflicts, cache corruption, asset
 * resolution, memory, file-watching, and monorepo entry-point failures —
 * each with the standard fix. Mirrors the Gradle (013) / Xcode (014) log
 * analyzers in projectDiagnostics; pure text parsing, hermetic-testable.
 */

import { existsSync, readFileSync } from 'fs'
import { reportError } from '../utils/safe'
import type { LogAnalysis } from '../projectDiagnostics/types'

interface MetroPattern {
  id: string
  name: string
  re: RegExp
  fix: string
}

/** The top Metro bundler failures, ordered most-specific first. */
export const METRO_PATTERNS: MetroPattern[] = [
  {
    id: 'module-resolution',
    name: 'Module resolution failure',
    re: /Unable to resolve module .* from .*|Could not resolve module .* from .*|Cannot find module ['"][^'"]+['"]/i,
    fix: 'The import path is wrong or the package is missing: check the specifier (extension, /index) in the failing file, `npm install` the package, add the directory to `watchFolders` in metro.config.js for monorepos, then `npx react-native start --reset-cache`.',
  },
  {
    id: 'haste-collision',
    name: 'Duplicate module / haste collision',
    re: /jest-haste-map: Haste module naming collision|Duplicate module name|collision for module/i,
    fix: 'Two files export the same module name (commonly a package duplicated across node_modules): dedupe with your package manager (`npm dedupe` / `pnpm dedupe`), rename the colliding file, or map one copy out in metro.config.js resolver.',
  },
  {
    id: 'syntax-error',
    name: 'Syntax / transform error',
    re: /SyntaxError: |TransformError |Unexpected token|Syntax error/,
    fix: 'The failing file does not parse under Metro\'s Babel pipeline: fix the syntax, or align the transform — check babel.config.js presets (babel-preset-expo / @react-native/babel-preset) and that the file extension matches its syntax (TS in .ts/.tsx, JSX in .jsx/.tsx).',
  },
  {
    id: 'babel-plugin-missing',
    name: 'Babel plugin / preset not found',
    re: /Cannot find module ['"](?:babel|@babel|babel-preset)[^'"]+['"]|Could not find plugin|unknown plugin/i,
    fix: 'Install the missing Babel package (`npm i -D babel-preset-expo` or the named plugin), keep babel.config.js in sync with the app flavor, and restart Metro with `--reset-cache`.',
  },
  {
    id: 'port-in-use',
    name: 'Metro port already in use',
    re: /port 8081 is already in use|EADDRINUSE|Port 8081.*in use/i,
    fix: 'Another Metro (or process) owns 8081: stop the stale one (`lsof -ti:8081 | xargs kill` on macOS/Linux) or run on another port with `npx react-native start --port 8082` and match the app\'s debug URL.',
  },
  {
    id: 'cache-corruption',
    name: 'Metro cache corruption / stale resolution',
    re: /--reset-cache|cache is corrupted|haste map.*cached|Try running.*reset-cache|Resolution of .* failed.*cache/i,
    fix: 'Reset the Metro/Haste caches: `npx react-native start --reset-cache` (and delete node_modules/.cache + $TMPDIR/metro-* if it persists). Stale transform caches commonly mask real resolution fixes.',
  },
  {
    id: 'asset-not-found',
    name: 'Asset resolution failure',
    re: /Invalid asset name|Asset .* does not exist|The asset .* could not be found/i,
    fix: 'The referenced image/font file does not exist at the given path (case matters): fix the require/import path, verify the file is committed, and for custom fonts check the fontFamily name matches the file registered in the app config.',
  },
  {
    id: 'out-of-memory',
    name: 'Bundler out of memory',
    re: /JavaScript heap out of memory|FATAL ERROR: .*heap|Allocation failed - JavaScript heap/i,
    fix: 'Metro ran out of heap on a large graph: raise the limit (`NODE_OPTIONS=--max-old-space-size=4096` before the bundle command), trim heavy imports from the entry graph, and consider `unstable_perfLogger`/lazy bundling for debug builds.',
  },
  {
    id: 'file-watching',
    name: 'File watching failure (Watchman / EMFILE)',
    re: /Watchman error|watchman recrawl|EMFILE|too many open files|INotify/i,
    fix: 'File watching is exhausted: raise the limit (`ulimit -n 65536`), restart watchman (`watchman watch-del-all`), or drop node_modules from the watcher; on Linux CI use `--no-watchman` with polling if Watchman is unavailable.',
  },
  {
    id: 'package-entry-point',
    name: 'Package entry point not found (monorepo)',
    re: /The package .* could not be found within its ['"]main['"]|Module .* is in the [hH]aste|did not resolve to a node_modules path/i,
    fix: 'A workspace/symlinked package has no resolvable main: verify the package\'s package.json `main`/`exports` field, add the workspace root to `watchFolders` + `nodeModulesPaths` in metro.config.js, and re-install so the symlink is fresh.',
  },
]

/** Parse a Metro bundler log and return the root-cause classification. */
export function analyzeMetroLog(log: string): LogAnalysis {
  const matches: LogAnalysis['matches'] = []
  const lines = log.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of METRO_PATTERNS) {
      if (pattern.re.test(line)) {
        matches.push({ id: pattern.id, name: pattern.name, line: i + 1, fix: pattern.fix })
      }
    }
  }
  // Most specific = the first pattern in the ordered table.
  const first = matches[0] ?? null
  const rootCause = first ? { id: first.id, name: first.name, fix: first.fix } : null
  const evidence = lines.filter(l => l.trim()).slice(-25)
  return { rootCause, matches, evidence }
}

/** Read a Metro log file and analyze it; null when the file is missing. */
export function analyzeMetroLogFile(path: string): LogAnalysis | null {
  try {
    if (!existsSync(path)) return null
    return analyzeMetroLog(readFileSync(path, 'utf-8'))
  } catch (err) {
    reportError(err, `build-fix: reading metro log ${path}`)
    return null
  }
}
