/**
 * Phase V-5 benchmark — RN best-practice rubric (M2).
 *
 * Axis 2 of the benchmark (docs/BENCHMARK_PLAN.md): 16 positive, RN-specific
 * best-practice checks. Unlike the guardrails (which assert the *absence* of
 * violations), these checks assert that generated code *follows* RN idioms:
 * KeyboardAvoidingView on input screens, FlatList over ScrollView + .map,
 * typed navigation props, Platform.OS, StyleSheet.create, remote-image error
 * handling, a11y labels, try/catch with error states, immutable updates, hook
 * dependency arrays, memoization, design tokens, deep-link routing tables,
 * loading/empty/error fetch states, and — for dependency-removal scenarios —
 * no leftover pod/gradle/manifest traces of the removed packages.
 *
 * Pattern mirrors src/guardrails/rules.ts: each check has an optional
 * `applicable` predicate and a `check` returning { passed, message?, line? }.
 *
 * `adherence = applicableChecksPassed / applicableChecksTotal` (only applicable
 * checks count), aggregated across all generated files.
 */

import { BenchGeneratedFile } from './types'
import { nativePackageTokens, isReferenceLine } from '../utils/nativeScan'

export interface RubricCheckOptions {
  filePath: string
  content: string
  /** Package names this scenario removed; only the native-traces check reads it. */
  removedDependencies?: string[]
}

export interface RubricCheck {
  id: string
  name: string
  description: string
  applicable?: (options: RubricCheckOptions) => boolean
  check: (options: RubricCheckOptions) => { passed: boolean; message?: string; line?: number }
}

export interface RubricRunOptions {
  removedDependencies?: string[]
}

export interface RubricCheckResult {
  id: string
  name: string
  passed: boolean
  message?: string
  line?: number
}

export interface RubricFileResult {
  filePath: string
  applicable: number
  passed: number
  failed: number
  checks: RubricCheckResult[]
}

export interface RubricResult {
  files: RubricFileResult[]
  /** applicableChecksPassed / applicableChecksTotal across all files; null when nothing applicable. */
  overall: number | null
}

function findLine(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

/** Find the end index of a JSX opening tag, honoring quotes and nested braces. */
function findJsxOpeningTagEnd(content: string, start: number): number {
  let i = start
  let inQuotes = false
  let quoteChar = ''
  let braceDepth = 0
  let parenDepth = 0

  while (i < content.length) {
    const char = content[i]
    const prev = content[i - 1]

    if (inQuotes) {
      if (char === quoteChar && prev !== '\\') {
        inQuotes = false
      }
    } else {
      if (char === '"' || char === "'" || char === '`') {
        inQuotes = true
        quoteChar = char
      } else if (char === '{') {
        braceDepth++
      } else if (char === '}') {
        braceDepth--
      } else if (char === '(') {
        parenDepth++
      } else if (char === ')') {
        parenDepth--
      } else if (char === '>' && braceDepth === 0 && parenDepth === 0) {
        return i
      }
    }
    i++
  }

  return -1
}

export const rubricChecks: RubricCheck[] = [
  {
    id: 'keyboard-avoiding-view',
    name: 'Screens with TextInput use KeyboardAvoidingView',
    description: 'Input screens should use KeyboardAvoidingView (or Keyboard.dismiss) on iOS so the keyboard never covers focused fields.',
    applicable: ({ filePath, content }) => /\.(tsx|jsx)$/.test(filePath) && /<TextInput\b/.test(content),
    check: ({ content }) => {
      const match = content.match(/<TextInput\b/)
      if (match && !/KeyboardAvoidingView|Keyboard\.dismiss/.test(content)) {
        return { passed: false, message: 'TextInput found but no KeyboardAvoidingView or Keyboard.dismiss', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'virtualized-lists',
    name: 'Long lists use FlatList or SectionList',
    description: 'Render item collections with FlatList/SectionList instead of mapping inside a plain View/ScrollView.',
    applicable: ({ filePath, content }) => /\.(tsx|jsx)$/.test(filePath) && /\.map\s*\(/.test(content),
    check: ({ content }) => {
      const match = content.match(/\.map\s*\(/)
      if (match && !/FlatList|SectionList/.test(content)) {
        return { passed: false, message: 'Mapped list should use FlatList or SectionList', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'safe-area',
    name: 'Screens use SafeAreaView or safe-area insets',
    description: 'Screen components should account for notches and home indicators via SafeAreaView or useSafeAreaInsets.',
    applicable: ({ filePath }) => /Screen\.(tsx|jsx)$/.test(filePath),
    check: ({ content }) => {
      if (!/SafeAreaView|useSafeAreaInsets|safeAreaInsets|react-native-safe-area-context/.test(content)) {
        return { passed: false, message: 'Screen does not use SafeAreaView or useSafeAreaInsets' }
      }
      return { passed: true }
    },
  },
  {
    id: 'typed-navigation',
    name: 'Navigation screens use typed route params',
    description: 'Screens that read route.params should type them with NativeStackScreenProps or similar navigation prop types.',
    applicable: ({ filePath, content }) => /\.(tsx|jsx)$/.test(filePath) && /react-navigation/.test(content) && /route\.params|route\./.test(content),
    check: ({ content }) => {
      const match = content.match(/route\.params/)
      if (match && !/NativeStackScreenProps|StackScreenProps|DrawerScreenProps|BottomTabScreenProps|CompositeScreenProps|NavigationProp</.test(content)) {
        return { passed: false, message: 'route.params used without typed navigation props', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'platform-api',
    name: 'Platform differences use Platform.OS or Platform.select',
    description: 'Branch on Platform.OS/Platform.select instead of hardcoded platform checks (env vars, string compares).',
    applicable: ({ content }) =>
      /Platform\.|=== ['"]ios['"]|=== ['"]android['"]|(iOS|Android)\s*&&|process\.env\.(PLATFORM|OS)/.test(content),
    check: ({ content }) => {
      const match = content.match(/=== ['"]ios['"]|=== ['"]android['"]|(iOS|Android)\s*&&|process\.env\.(PLATFORM|OS)/)
      if (match && !/Platform\.(OS|select)/.test(content)) {
        return { passed: false, message: 'Platform branching should use Platform.OS or Platform.select', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'stylesheet-create',
    name: 'Styles use StyleSheet.create with no inline objects',
    description: 'Define styles via StyleSheet.create; avoid inline style={{ ... }} objects that re-create on every render.',
    applicable: ({ filePath, content }) => /\.(tsx|jsx)$/.test(filePath) && /style\s*=/.test(content),
    check: ({ content }) => {
      const match = content.match(/style\s*=\s*\{\s*\{/)
      if (match) {
        return { passed: false, message: 'Inline style object found; use StyleSheet.create', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'remote-image-handling',
    name: 'Remote images handle errors and caching',
    description: 'Remote image sources should set onError/defaultSource/caching so failures and re-fetches are handled.',
    applicable: ({ content }) => /uri\s*:\s*['"]https?:\/\//.test(content) && /<Image\b|FastImage/.test(content),
    check: ({ content }) => {
      const match = content.match(/uri\s*:\s*['"]https?:\/\//)
      if (match && !/onError|defaultSource|cache\s*[:=]|resizeMode\s*=/.test(content)) {
        return { passed: false, message: 'Remote image missing onError or caching', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'accessibility',
    name: 'Interactive elements have accessibility labels or roles',
    description: 'TouchableOpacity/Pressable/Button elements should carry accessibilityLabel, accessibilityRole, or accessible={false}.',
    applicable: ({ filePath, content }) => /\.(tsx|jsx)$/.test(filePath) && /<(TouchableOpacity|Pressable|Button)\b/.test(content),
    check: ({ content }) => {
      const interactive = /<(TouchableOpacity|Pressable|Button)\b/g
      const matches = Array.from(content.matchAll(interactive))
      for (const match of matches) {
        const start = match.index || 0
        const endTag = findJsxOpeningTagEnd(content, start)
        if (endTag === -1) continue
        const tagContent = content.slice(start, endTag + 1)
        if (!/accessibilityLabel|accessibilityRole|accessibilityState|accessible\s*=\s*\{\s*false\s*\}/.test(tagContent)) {
          return { passed: false, message: 'Interactive element lacks accessibilityLabel or role', line: findLine(content, start) }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'error-states',
    name: 'Async work uses try/catch with user-visible error states',
    description: 'Async operations should be wrapped in try/catch and surface errors to the UI (setError, error &&, isError).',
    applicable: ({ content }) => /\basync\b|\bfetch\s*\(|\.then\s*\(|axios|await\s/.test(content),
    check: ({ content }) => {
      const match = content.match(/\basync\b|\bfetch\s*\(|\.then\s*\(/)
      if (match) {
        const hasTryCatch = /try\s*\{[\s\S]*\}\s*catch\s*\(/.test(content)
        const hasErrorState = /setError\s*\(|\berror\s*&&|\berror\s*\?|\{error\}|isError|error\s*:\s*/.test(content)
        if (!hasTryCatch || !hasErrorState) {
          return {
            passed: false,
            message: !hasTryCatch ? 'Async work without try/catch' : 'try/catch present but no user-visible error state',
            line: findLine(content, match.index || 0),
          }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'immutable-updates',
    name: 'State updates are immutable',
    description: 'Update arrays/objects immutably (spread, concat, filter, map) instead of push/splice/reverse/sort in place.',
    applicable: ({ filePath, content }) => /\.(tsx|jsx)$/.test(filePath) && /useState|useReducer|set\w+\s*\(/.test(content),
    check: ({ content }) => {
      const match = content.match(/\w+\s*\.(push|splice|reverse|sort)\s*\(|(?:state|items|list|data)\s*\.\w+\s*=[^=]/)
      if (match) {
        return { passed: false, message: 'Mutable array/state update', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'hook-deps',
    name: 'Hooks pass dependency arrays',
    description: 'useEffect/useCallback/useMemo calls must include a dependency array.',
    applicable: ({ filePath, content }) => /\.(tsx|jsx)$/.test(filePath) && /useEffect|useCallback|useMemo/.test(content),
    check: ({ content }) => {
      const missing = content.match(/use(?:Effect|Callback|Memo)\s*\(\s*\(\)\s*=>\s*\{[^}]*\}\s*\)/)
      if (missing) {
        const hook = missing[0].slice(0, missing[0].indexOf('('))
        return { passed: false, message: `${hook} missing dependency array`, line: findLine(content, missing.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'memoization',
    name: 'Expensive values are memoized out of render',
    description: 'Heavy computations (sort, JSON, large Array.from) in render should be wrapped in useMemo/useCallback or React.memo.',
    applicable: ({ filePath, content }) => /\.(tsx|jsx)$/.test(filePath) && /\.sort\s*\(|JSON\.(parse|stringify)|Array\.from\s*\(\s*\{length/.test(content),
    check: ({ content }) => {
      const match = content.match(/\.sort\s*\(|JSON\.(parse|stringify)|Array\.from\s*\(\s*\{length/)
      if (match && !/useMemo|useCallback|React\.memo|memo\s*\(/.test(content)) {
        return { passed: false, message: 'Heavy work in render without memoization', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'design-tokens',
    name: 'Colors come from the design system',
    description: 'Use theme/color tokens instead of hardcoded hex or rgba literals (tokens files themselves are exempt).',
    applicable: ({ filePath, content }) =>
      !/\/(theme|tokens|colors|palette)\//.test(filePath) && /#[0-9a-fA-F]{3,8}\b|rgba?\s*\(/.test(content),
    check: ({ content }) => {
      const match = content.match(/#[0-9a-fA-F]{3,8}\b|rgba?\s*\(/)
      if (match && !/(theme|colors|tokens|palette|spacing)\s*[.[]|from\s+['"][^'"]*(theme|colors|tokens|palette)/.test(content)) {
        return { passed: false, message: 'Hardcoded color literal; use design tokens', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'deep-links',
    name: 'Deep links use a routing table',
    description: 'Declare deep links via a linking config / routing table instead of ad-hoc Linking.openURL with a literal scheme.',
    applicable: ({ content }) => /Linking|deepLink|getInitialURL/.test(content),
    check: ({ content }) => {
      const hasTable = /Linking\.addEventListener|getInitialURL|linking\s*=\s*\{|config\s*:\s*\{[\s\S]*screens/.test(content)
      const adHoc = content.match(/Linking\.openURL\s*\(\s*['"`][^'"`]+['"`]/)
      if (adHoc && !hasTable) {
        return { passed: false, message: 'Ad-hoc deep link; use a routing table', line: findLine(content, adHoc.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'fetch-states',
    name: 'Data fetching has loading, empty, and error states',
    description: 'Fetching code should expose loading, empty, and error states to the UI.',
    applicable: ({ content }) => /\bfetch\s*\(|\baxios\b|\.get\s*\(|useQuery|\.then\s*\(/.test(content),
    check: ({ content }) => {
      const match = content.match(/\bfetch\s*\(|\baxios\b|\.get\s*\(/)
      if (match) {
        const hasLoading = /loading|isLoading|isPending|useQuery/.test(content)
        const hasEmpty = /empty|isEmpty|length\s*===\s*0|length\s*==\s*0/.test(content)
        const hasError = /error|isError/.test(content)
        if (!hasLoading || !hasEmpty || !hasError) {
          return {
            passed: false,
            message: `Fetch missing states (loading=${hasLoading}, empty=${hasEmpty}, error=${hasError})`,
            line: findLine(content, match.index || 0),
          }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-removed-native-traces',
    name: 'Removed dependencies leave no pod/gradle/manifest traces',
    description: 'After a dependency removal, native config must not retain the package: Podfile pods, gradle includes/deps, AndroidManifest providers, Info.plist keys, or pbxproj entries. Scenarios declare the removed packages via `removedDependencies`; the check is N/A otherwise.',
    applicable: ({ filePath, removedDependencies }) =>
      isNativeConfigFile(filePath) && (removedDependencies?.length ?? 0) > 0,
    check: ({ content, removedDependencies }) => {
      const deps = removedDependencies || []
      const lines = content.split('\n')
      // Precompute lines inside /* */ or <!-- --> block comments so their
      // continuation lines (which don't repeat the opener) can't false-positive.
      const inComment = new Array<boolean>(lines.length).fill(false)
      let inBlock = false
      lines.forEach((line, i) => {
        const trimmed = line.trim()
        if (inBlock) {
          inComment[i] = true
          if (/\*\/\s*$/.test(trimmed) || /-->\s*$/.test(trimmed)) inBlock = false
        } else if ((/^\/\*/.test(trimmed) && !/\*\/\s*$/.test(trimmed)) || (/^<!--/.test(trimmed) && !/-->\s*$/.test(trimmed))) {
          inComment[i] = true
          inBlock = true
        }
      })
      for (const dep of deps) {
        const tokens = nativePackageTokens(dep)
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim()
          if (inComment[i] || !trimmed || /^(?:\/\/|\*|\/\*|#|<!--)/.test(trimmed)) continue
          if (tokens.some(t => isReferenceLine(lines[i], [t]))) {
            return { passed: false, message: `Native trace of removed dependency '${dep}' remains`, line: i + 1 }
          }
        }
      }
      return { passed: true }
    },
  },
]

/** True for files that can carry traces of a native dependency: Podfile,
 * gradle files, AndroidManifest, Info.plist, pbxproj, xcconfig. */
export function isNativeConfigFile(filePath: string): boolean {
  const base = filePath.split('/').pop() || filePath
  if (base === 'Podfile' || base === 'Podfile.lock' || base === 'AndroidManifest.xml') return true
  return /\.(?:gradle|kts|pbxproj|plist|xcconfig)$/.test(base)
}

/** Run the rubric over generated files and aggregate adherence per file + overall. */
export function runRubric(files: BenchGeneratedFile[], opts?: RubricRunOptions): RubricResult {
  const fileResults: RubricFileResult[] = []
  let applicableTotal = 0
  let passedTotal = 0

  for (const file of files) {
    const checks: RubricCheckResult[] = []
    let applicable = 0
    let passed = 0
    const checkOptions: RubricCheckOptions = {
      filePath: file.path,
      content: file.content,
      removedDependencies: opts?.removedDependencies,
    }
    for (const check of rubricChecks) {
      if (check.applicable && !check.applicable(checkOptions)) continue
      const outcome = check.check(checkOptions)
      applicable++
      if (outcome.passed) passed++
      checks.push({ id: check.id, name: check.name, passed: outcome.passed, message: outcome.message, line: outcome.line })
    }
    applicableTotal += applicable
    passedTotal += passed
    fileResults.push({ filePath: file.path, applicable, passed, failed: applicable - passed, checks })
  }

  return { files: fileResults, overall: applicableTotal > 0 ? passedTotal / applicableTotal : null }
}

/** Adherence seam for the runner: applicableChecksPassed / applicableChecksTotal, null when N/A. */
export function rubricAdherence(files: BenchGeneratedFile[], opts?: RubricRunOptions): number | null {
  return runRubric(files, opts).overall
}

/** Markdown summary of the rubric result for reports and the bench CLI. */
export function formatRubricResult(result: RubricResult): string {
  const lines: string[] = []
  if (result.overall === null) {
    return 'Adherence: n/a (no applicable checks)'
  }
  lines.push(`Adherence: **${(result.overall * 100).toFixed(0)}%** (${result.files.reduce((a, f) => a + f.passed, 0)}/${result.files.reduce((a, f) => a + f.applicable, 0)} applicable checks)`)
  for (const file of result.files) {
    if (file.failed === 0) continue
    lines.push('')
    lines.push(`### ${file.filePath} (${file.passed}/${file.applicable} passed)`)
    for (const check of file.checks) {
      if (!check.passed) {
        const where = check.line !== undefined ? `:${check.line}` : ''
        lines.push(`- \`${check.id}\`${where} — ${check.message || check.name}`)
      }
    }
  }
  return lines.join('\n')
}
