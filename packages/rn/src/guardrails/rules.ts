import { GuardrailRule } from './types'
import { isNewArchitectureEnabled } from '../utils/newArchitecture'
import { isReact19 } from '../utils/reactCompiler'

function findLine(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

/**
 * True when `index` falls inside a `useEffect` / `useLayoutEffect` /
 * `useInsertionEffect` call (between its opening paren and the matching close).
 * Used to distinguish legal ref mutation inside effect callbacks from the
 * React 19 error of mutating refs during render.
 */
function isInsideEffectCall(content: string, index: number): boolean {
  const effectRe = /use(?:Layout|Insertion)?Effect\s*\(/g
  let m: RegExpExecArray | null
  let lastEffectStart = -1
  while ((m = effectRe.exec(content)) !== null) {
    if (m.index > index) break
    lastEffectStart = m.index
  }
  if (lastEffectStart === -1) return false

  // Scan forward from the effect call to its matching close paren.
  let depth = 0
  let inString = false
  let quote = ''
  let i = lastEffectStart
  for (; i < content.length; i++) {
    const c = content[i]
    if (inString) {
      if (c === quote && content[i - 1] !== '\\') inString = false
    } else if (c === '"' || c === "'" || c === '`') {
      inString = true
      quote = c
    } else if (c === '(') {
      depth++
    } else if (c === ')') {
      depth--
      if (depth === 0) break
    }
  }
  return index < i
}

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

export const rules: GuardrailRule[] = [
  {
    id: 'no-console-log',
    name: 'No console.log statements',
    description: 'Production code should not contain console.log. Use a proper logging library or remove debugging statements.',
    severity: 'error',
    check: ({ content }) => {
      const match = content.match(/console\.(log|debug|warn|error|info)\s*\(/)
      if (match) {
        return { passed: false, message: `Found console.${match[1]} call`, line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-inline-styles',
    name: 'No inline style objects in JSX',
    description: 'Use StyleSheet.create(...) for styles instead of inline objects to avoid re-renders and improve performance.',
    severity: 'warning',
    applicable: ({ filePath }) => /\.(tsx|jsx)$/.test(filePath),
    check: ({ content }) => {
      const match = content.match(/style\s*=\s*\{\s*\{/)
      if (match) {
        return { passed: false, message: 'Found inline style object', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-hardcoded-urls',
    name: 'No hardcoded API URLs',
    description: 'API base URLs should come from environment config or constants, not be hardcoded in source files.',
    severity: 'error',
    check: ({ content }) => {
      const match = content.match(/https?:\/\/[^\s'"]+\.(com|net|org|io|dev|co|app)/i)
      if (match) {
        return { passed: false, message: `Found hardcoded URL: ${match[0]}`, line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-secrets-in-code',
    name: 'No secrets or API keys in code',
    description: 'Secrets, API keys, passwords, and tokens must not be committed to source code.',
    severity: 'error',
    check: ({ content }) => {
      const patterns = [
        /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{16,}['"]/i,
        /secret\s*[:=]\s*['"][a-zA-Z0-9]{16,}['"]/i,
        /password\s*[:=]\s*['"][^'"]{6,}['"]/i,
        /token\s*[:=]\s*['"][a-zA-Z0-9]{16,}['"]/i,
        /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
      ]
      for (const pattern of patterns) {
        const match = content.match(pattern)
        if (match) {
          return { passed: false, message: 'Possible secret or key in code', line: findLine(content, match.index || 0) }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-any-type',
    name: 'No explicit any types',
    description: 'Avoid using any in TypeScript. Prefer specific types or unknown.',
    severity: 'warning',
    applicable: ({ filePath }) => /\.tsx?$/.test(filePath),
    check: ({ content }) => {
      const match = content.match(/:\s*any\b/)
      if (match) {
        return { passed: false, message: 'Found explicit any type', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'proper-error-handling',
    name: 'Async functions have error handling',
    description: 'Async functions should use try/catch or propagate errors to avoid unhandled promise rejections.',
    severity: 'warning',
    check: ({ content }) => {
      const asyncFunctions = content.match(/async\s+function\s+\w+\s*\([^)]*\)\s*\{/g) || []
      const asyncArrows = content.match(/async\s*\([^)]*\)\s*=>\s*\{/g) || []
      const asyncMethods = content.match(/async\s+\w+\s*\([^)]*\)\s*\{/g) || []
      const totalAsync = asyncFunctions.length + asyncArrows.length + asyncMethods.length
      const tryCatchCount = (content.match(/try\s*\{/g) || []).length
      if (totalAsync > 0 && tryCatchCount === 0) {
        return { passed: false, message: `${totalAsync} async function(s) found with no try/catch blocks` }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-unused-imports',
    name: 'No unused imports',
    description: 'Remove imports that are not used in the file.',
    severity: 'warning',
    check: ({ content }) => {
      const importRegex = /^\s*import\s+(?:(?:(?:type\s+)?\{[^}]+\})|(?:\*\s+as\s+\w+)|(?:\w+))\s+from\s+['"][^'"]+['"];?\s*$/gm
      const matches = Array.from(content.matchAll(importRegex))
      for (const match of matches) {
        const importLine = match[0]
        const named = importLine.match(/\{\s*([^}]+?)\s*\}/)
        if (named) {
          const names = named[1].split(',').map(s => s.trim().split(' as ')[0].trim()).filter(Boolean)
          const body = content.replace(importLine, '')
          for (const name of names) {
            if (name === 'React') continue
            const regex = new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`)
            if (!regex.test(body)) {
              return { passed: false, message: `Unused import: ${name}`, line: findLine(content, match.index || 0) }
            }
          }
        }
        const defaultImport = importLine.match(/import\s+(\w+)\s+from/)
        if (defaultImport) {
          const name = defaultImport[1]
          if (name === 'React') continue
          const body = content.replace(importLine, '')
          const regex = new RegExp(`(?<![\\w$])${name}(?![\\w$])`)
          if (!regex.test(body)) {
            return { passed: false, message: `Unused import: ${name}`, line: findLine(content, match.index || 0) }
          }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-direct-state-mutation',
    name: 'No direct state mutation',
    description: 'React state should be updated via setState hooks, never mutated directly.',
    severity: 'error',
    applicable: ({ filePath }) => /\.(tsx|jsx)$/.test(filePath),
    check: ({ content }) => {
      const match = content.match(/(state\.[a-zA-Z_$][\w$]*\s*=|setState\s*\([^)]*\)\s*\.[a-zA-Z_$])|useState\s*\(\s*\)\s*\[[^\]]+\]\.[a-zA-Z_$]/)
      if (match) {
        return { passed: false, message: 'Possible direct state mutation', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'proper-hook-deps',
    name: 'useEffect/useCallback dependencies checked',
    description: 'Hooks that accept dependency arrays should have them.',
    severity: 'warning',
    applicable: ({ filePath }) => /\.(tsx|jsx)$/.test(filePath),
    check: ({ content }) => {
      const match = content.match(/useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*\}\s*\)/)
      if (match) {
        return { passed: false, message: 'useEffect call missing dependency array', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-heavy-work-in-render',
    name: 'No heavy work in render',
    description: 'Avoid heavy computations, object/array literals, or function re-creation in render.',
    severity: 'warning',
    applicable: ({ filePath }) => /\.(tsx|jsx)$/.test(filePath),
    check: ({ content }) => {
      const match = content.match(/return\s*\(\s*<[\s\S]*?(JSON\.parse|JSON\.stringify|new\s+Date\s*\(\s*\)|Array\.from\s*\(\s*\{length:)\s*\)/)
      if (match) {
        return { passed: false, message: 'Possible heavy work inside JSX render', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'use-keyboard-avoiding-view',
    name: 'Forms use KeyboardAvoidingView on iOS',
    description: 'Screens with text inputs should use KeyboardAvoidingView for iOS to prevent keyboard overlap.',
    severity: 'info',
    applicable: ({ filePath, content }) => /\.(tsx|jsx)$/.test(filePath) && /TextInput/.test(content),
    check: ({ content }) => {
      const match = content.match(/TextInput/)
      if (match && !/KeyboardAvoidingView/.test(content)) {
        return { passed: false, message: 'TextInput found but no KeyboardAvoidingView', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'accessibility-labels',
    name: 'Interactive elements have accessibility labels',
    description: 'TouchableOpacity, Pressable, and Button components should have accessibilityLabel or accessible={false} when decorative.',
    severity: 'warning',
    applicable: ({ filePath, content }) => /\.(tsx|jsx)$/.test(filePath) && /TouchableOpacity|Pressable|Button/.test(content),
    check: ({ content }) => {
      const interactive = /<(TouchableOpacity|Pressable|Button)\b/g
      const matches = Array.from(content.matchAll(interactive))
      for (const match of matches) {
        const start = match.index || 0
        const endTag = findJsxOpeningTagEnd(content, start)
        if (endTag === -1) {
          continue
        }
        const tagContent = content.slice(start, endTag + 1)
        if (!/accessibilityLabel|accessible\s*=\s*\{\s*false\s*\}/.test(tagContent)) {
          return { passed: false, message: `Interactive element lacks accessibilityLabel`, line: findLine(content, start) }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'use-pressable',
    name: 'Prefer Pressable over TouchableOpacity',
    description: 'Pressable offers full press-state control (pressed/hovered/disabled) and better accessibility defaults than TouchableOpacity.',
    severity: 'warning',
    applicable: ({ filePath }) => /\.(tsx|jsx)$/.test(filePath),
    check: ({ content }) => {
      const match = content.match(/\bTouchableOpacity\b/)
      if (match) {
        return {
          passed: false,
          message: 'Prefer Pressable over TouchableOpacity — Pressable offers full press-state control and better accessibility defaults.',
          line: findLine(content, match.index || 0),
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-leaked-render',
    name: 'No leaked falsy values in JSX',
    description: 'Avoid {value && <Component />} when value can be a falsy string or number — a leaked 0 or empty string renders on screen. Use {value ? <Component /> : null} or coerce with !!value &&.',
    severity: 'warning',
    applicable: ({ filePath }) => /\.(tsx|jsx)$/.test(filePath),
    check: ({ content }) => {
      const match = content.match(/\{\s*[A-Za-z_$][\w$.?]*\s*&&\s*</)
      if (match) {
        return {
          passed: false,
          message: 'Avoid {value && <Component />} — a falsy string/number leaks to the screen; use a ternary or !!value &&',
          line: findLine(content, match.index || 0),
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-deprecated-apis',
    name: 'No deprecated React Native APIs',
    description: 'Avoid deprecated APIs such as ListView, AsyncStorage from react-native, or AlertIOS.',
    severity: 'error',
    check: ({ content }) => {
      const deprecated = [
        /\bListView\b/,
        /from\s+['"]react-native['"]\s*;?[\s\S]*?\bAsyncStorage\b/,
        /\bAlertIOS\b/,
        /\bStatusBarIOS\b/,
        /\bNavigator\b/,
      ]
      for (const pattern of deprecated) {
        const match = content.match(pattern)
        if (match) {
          return { passed: false, message: `Deprecated API usage: ${match[0]}`, line: findLine(content, match.index || 0) }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'platform-aware-code',
    name: 'Platform-specific code uses Platform API',
    description: 'Use Platform.OS or Platform.select for platform-specific behavior instead of hardcoded checks.',
    severity: 'warning',
    check: ({ content }) => {
      const match = content.match(/(iOS|Android)\s*&&|process\.env\.(PLATFORM|OS)/)
      if (match) {
        return { passed: false, message: 'Platform-specific code should use Platform.OS', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'proper-navigation-types',
    name: 'Navigation screens are typed',
    description: 'React Navigation screens should use typed route params.',
    severity: 'info',
    applicable: ({ filePath, content, conventions }) =>
      /\.(tsx|jsx)$/.test(filePath) &&
      !!conventions?.hasNavigation &&
      /react-navigation/.test(content),
    check: ({ content }) => {
      const match = content.match(/route\s*\.params\??\s*\.\w+/)
      if (match && !/NativeStackScreenProps|StackScreenProps|DrawerScreenProps|BottomTabScreenProps/.test(content)) {
        return { passed: false, message: 'Screen uses route.params without navigation type props', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'consistent-naming',
    name: 'File naming follows project conventions',
    description: 'Component files should use PascalCase, hooks use camelCase starting with use, utility files use camelCase.',
    severity: 'info',
    check: ({ filePath }) => {
      const fileName = filePath.split('/').pop() || ''
      if (/^(src\/screens|src\/components)\/[^/]+\/.+/.test(filePath)) {
        const base = fileName.split('.')[0]
        if (/^[A-Z]/.test(base)) {
          return { passed: true }
        }
        return { passed: false, message: `Component/screen file should be PascalCase: ${fileName}` }
      }
      if (filePath.includes('/hooks/')) {
        const base = fileName.split('.')[0]
        if (!base.startsWith('use')) {
          return { passed: false, message: `Hook file should start with use: ${fileName}` }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'use-safe-area',
    name: 'Screens use SafeAreaView or safe-area-aware layout',
    description: 'Screens should account for safe areas to avoid notches and status bars.',
    severity: 'info',
    applicable: ({ filePath }) => /Screen\.(tsx|jsx)$/.test(filePath),
    check: ({ content }) => {
      if (!/SafeAreaView|useSafeAreaInsets|safeAreaInsets/.test(content)) {
        return { passed: false, message: 'Screen does not use SafeAreaView or useSafeAreaInsets' }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-todos-in-code',
    name: 'No TODO/FIXME comments',
    description: 'TODO and FIXME comments should be resolved or tracked as tasks before merging.',
    severity: 'warning',
    check: ({ content }) => {
      const match = content.match(/\/\/\s*(TODO|FIXME|XXX|HACK)/i)
      if (match) {
        return { passed: false, message: `Found ${match[1].toUpperCase()} comment`, line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'typescript-strict',
    name: 'TypeScript files avoid implicit any',
    description: 'TypeScript functions should use explicit parameter types and return types where helpful.',
    severity: 'info',
    applicable: ({ filePath }) => /\.tsx?$/.test(filePath),
    check: ({ content }) => {
      const match = content.match(/export\s+function\s+\w+\s*\([^)]*\)\s*\{/)
      if (match && !/:\s*\w+/.test(match[0])) {
        return { passed: false, message: 'Exported function missing return type annotation', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'proper-image-assets',
    name: 'Images use require or imported assets',
    description: 'Images should not be loaded from arbitrary remote URLs without handling errors and caching.',
    severity: 'warning',
    check: ({ content }) => {
      const match = content.match(/source\s*=\s*\{\s*\{\s*uri\s*:\s*['"]https?:\/\//)
      if (match) {
        return { passed: false, message: 'Remote image source without visible caching/error handling', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'memoize-expensive-components',
    name: 'Large lists are virtualized',
    description: 'Long lists should use FlatList or SectionList instead of ScrollView with mapped items.',
    severity: 'warning',
    applicable: ({ filePath, content }) => /\.(tsx|jsx)$/.test(filePath) && /\w+\s*\.map\s*\(\s*\(\s*\w+\s*\)\s*=>\s*<[^>]+>\s*\)/.test(content),
    check: ({ content }) => {
      const match = content.match(/\w+\s*\.map\s*\(\s*\(\s*\w+\s*\)\s*=>\s*<[^>]+>\s*\)/)
      if (match && !/FlatList|SectionList/.test(content)) {
        return { passed: false, message: 'Mapped items in JSX should use FlatList or SectionList', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-mutation-in-hooks',
    name: 'No mutation in hooks or reducers',
    description: 'Hooks and reducers should not mutate state or props directly.',
    severity: 'error',
    check: ({ content }) => {
      const match = content.match(/\w+\s*\.push\s*\(|\w+\s*\.splice\s*\(|\w+\s*\.reverse\s*\(/)
      if (match) {
        return { passed: false, message: 'Possible mutation via array method', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'use-strict-equality',
    name: 'Use strict equality operators',
    description: 'Prefer === and !== over == and !=.',
    severity: 'info',
    check: ({ content }) => {
      const match = content.match(/[^=!]\s*==\s*[^=]/)
      if (match) {
        return { passed: false, message: 'Found loose equality operator', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-var-declarations',
    name: 'No var declarations',
    description: 'Use const or let instead of var.',
    severity: 'warning',
    check: ({ content }) => {
      const match = content.match(/\bvar\s+/)
      if (match) {
        return { passed: false, message: 'Found var declaration', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'proper-export-style',
    name: 'Components are exported as named exports',
    description: 'Prefer named exports for components to improve tree-shaking and refactor safety.',
    severity: 'info',
    applicable: ({ filePath }) => /\.(tsx|jsx)$/.test(filePath),
    check: ({ content }) => {
      const match = content.match(/export\s+default\s+function\s+/)
      if (match) {
        return { passed: false, message: 'Prefer named export over default export for components', line: findLine(content, match.index || 0) }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-set-native-props',
    name: 'No setNativeProps in New Architecture projects',
    description: 'setNativeProps bypasses the React render cycle and is unsupported on Fabric (New Architecture). Use state or refs instead.',
    severity: 'warning',
    applicable: ({ filePath, content, conventions }) =>
      /\.(tsx|jsx)$/.test(filePath) &&
      isNewArchitectureEnabled(conventions?.newArchitecture) &&
      /\.setNativeProps\s*\(/.test(content),
    check: ({ content }) => {
      const match = content.match(/\.setNativeProps\s*\(/)
      if (match) {
        return {
          passed: false,
          message: 'setNativeProps is not supported on Fabric (New Architecture) — drive the view via state/props instead',
          line: findLine(content, match.index || 0),
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-sync-native-module-calls',
    name: 'No synchronous NativeModules calls on New Architecture',
    description: 'Under the New Architecture TurboModules are async; synchronous NativeModules calls block the JS thread. Prefer promise-based TurboModule APIs.',
    severity: 'warning',
    applicable: ({ filePath, content, conventions }) =>
      /\.(tsx?|jsx?)$/.test(filePath) &&
      isNewArchitectureEnabled(conventions?.newArchitecture) &&
      /NativeModules\.[A-Z]\w*\.[a-zA-Z]\w*\s*\(/.test(content),
    check: ({ content }) => {
      const re = /NativeModules\.([A-Z]\w*)\.([a-zA-Z]\w*)\s*\(/g
      let match: RegExpExecArray | null
      while ((match = re.exec(content)) !== null) {
        const start = match.index
        // Look back to the statement start (previous ; or { or newline up to 200 chars).
        const window = content.slice(Math.max(0, start - 200), start)
        const statementStart = Math.max(
          window.lastIndexOf(';'),
          window.lastIndexOf('{'),
          window.lastIndexOf('}')
        )
        const before = window.slice(statementStart + 1)
        // Async-style: awaited, or the call's result is chained with .then/.catch.
        const isAwaited = /\bawait\s+$/.test(before) || /\bawait\s+NativeModules/.test(before + match[0])
        const isChained = /\.then\s*\(|\.catch\s*\(/.test(content.slice(start + match[0].length, start + match[0].length + 60))
        if (isAwaited || isChained) continue
        return {
          passed: false,
          message: `Synchronous NativeModules.${match[1]}.${match[2]}() call — TurboModules are async on New Architecture; use the promise API`,
          line: findLine(content, start),
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'missing-turbomodule-spec',
    name: 'Native modules have a TurboModule TypeScript spec',
    description: 'New Architecture native modules should be declared in a typed TurboModule spec (NativeX.ts / XSpec.ts) and accessed via TurboModuleRegistry.',
    severity: 'warning',
    applicable: ({ content, conventions }) =>
      isNewArchitectureEnabled(conventions?.newArchitecture) &&
      (/TurboModuleRegistry/.test(content) || /NativeModules\.[A-Z]\w*/.test(content)),
    check: ({ content, conventions }) => {
      const specs = conventions?.newArchitecture?.turboModuleSpecs || []
      const names = new Set<string>()
      // TurboModuleRegistry.get('X') and NativeModules.X direct access.
      const registryRe = /TurboModuleRegistry\.get\s*\(\s*['"]([A-Za-z]\w*)['"]/g
      let m: RegExpExecArray | null
      while ((m = registryRe.exec(content)) !== null) names.add(m[1])
      const directRe = /NativeModules\.([A-Z]\w*)/g
      while ((m = directRe.exec(content)) !== null) names.add(m[1])
      // A spec matches when its basename is Native<Name>, <Name>Spec, or contains the name.
      const hasSpec = (name: string): boolean =>
        specs.some(s => s === `Native${name}` || s === `${name}Spec` || s.includes(name))
      for (const name of names) {
        if (!hasSpec(name)) {
          return {
            passed: false,
            message: `Native module '${name}' is used but has no TurboModule TypeScript spec (expected Native${name}.ts or ${name}Spec.ts)`,
          }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-ref-mutation-in-render',
    name: 'Refs are not mutated during render',
    description: 'React 19 throws when a ref is mutated during render. Assign ref.current only inside effects or event handlers.',
    severity: 'warning',
    applicable: ({ filePath }) => /\.[jt]sx?$/.test(filePath),
    check: ({ content }) => {
      // `=` (but not `==` / `===`) — comparison reads are legal.
      const re = /\.current\s*=\s*(?!=)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) {
        const start = m.index
        // Assignments inside effect callbacks are legal; render-phase writes are not.
        // (Assignments inside event handlers are not inside an effect call and
        // are also flagged — a conservative heuristic; the React 19 rule is
        // render-scoped.)
        if (isInsideEffectCall(content, start)) continue
        return {
          passed: false,
          message: 'Ref assigned outside an effect callback — React 19 errors when refs are mutated during render; move the assignment into useEffect',
          line: findLine(content, start),
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'use-effect-cleanup',
    name: 'useEffect subscriptions return cleanup',
    description: 'Subscriptions set up in useEffect (timers, listeners, observers, sockets) must be torn down in a returned cleanup function — React 19 effect cleanup semantics make this a correctness issue, not just a leak.',
    severity: 'warning',
    applicable: ({ filePath }) => /\.[jt]sx?$/.test(filePath),
    check: ({ content }) => {
      const re = /useEffect\s*\(\s*(?:async\s+)?\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[/g
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) {
        const body = m[1]
        const hasSubscription = /setInterval|setTimeout|addEventListener|addListener|\.subscribe\s*\(|\.on\s*\(|\.watch\s*\(|new\s+WebSocket|\.connect\s*\(/.test(body)
        if (!hasSubscription) continue
        const hasCleanup = /return\s+(?:\(?\)?\s*=>|function\s*\()|clearInterval|clearTimeout|removeEventListener|removeListener|\.unsubscribe\s*\(|\.off\s*\(|\.dispose\s*\(|\.close\s*\(|\.destroy\s*\(|AbortController/.test(body)
        if (!hasCleanup) {
          return {
            passed: false,
            message: 'useEffect sets up a subscription (timer/listener/observer/socket) but never returns a cleanup function',
            line: findLine(content, m.index || 0),
          }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'use-outside-suspense',
    name: 'use() is inside a Suspense boundary',
    description: "React 19's use() reads a promise or context. Promise reads suspend — the consuming component must be wrapped in <Suspense>, and context reads need a matching Provider.",
    severity: 'warning',
    applicable: ({ filePath, content }) =>
      /\.[jt]sx?$/.test(filePath) &&
      /\buse\s*\(/.test(content) &&
      (/\buse\b[^;]*from\s*['"]react['"]/.test(content) || /React\.use\s*\(/.test(content)),
    check: ({ content }) => {
      // A Suspense boundary anywhere in the file means the call site is
      // (very likely) covered — treat that as passing.
      if (/<Suspense\b/.test(content)) return { passed: true }
      const m = content.match(/(?:\buse|React\.use)\s*\(/)
      if (m) {
        return {
          passed: false,
          message: 'use() called but no <Suspense> boundary found — promise reads will suspend and throw without a fallback; wrap the consuming component in <Suspense fallback={...}>',
          line: findLine(content, m.index || 0),
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'unstable-dependency-array',
    name: 'Dependency arrays are stable',
    description: 'Dependency arrays must contain stable values — inline object/array/function literals and derived calls are recreated every render and cause effect re-runs.',
    severity: 'warning',
    applicable: ({ filePath }) => /\.[jt]sx?$/.test(filePath),
    check: ({ content }) => {
      // Anchor the deps array to the hook's closing paren so `, [` sequences
      // inside the callback body (e.g. fn(a, [1])) are not mistaken for deps.
      const re = /(useEffect|useCallback|useMemo)\s*\([\s\S]*?,\s*\[([^\][]*)\]\s*\)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) {
        const deps = m[2]
        if (/=>/.test(deps)) {
          return { passed: false, message: 'Unstable dependency array — inline function is recreated every render', line: findLine(content, m.index || 0) }
        }
        if (/\.(filter|map|reduce|slice|sort|find|some|every)\s*\(/.test(deps)) {
          return { passed: false, message: 'Unstable dependency array — derived call result changes every render', line: findLine(content, m.index || 0) }
        }
        if (/\{\s*[^}]*\}|\[\s*\]/.test(deps)) {
          return { passed: false, message: 'Unstable dependency array — inline object/array literal is recreated every render', line: findLine(content, m.index || 0) }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'no-forward-ref',
    name: 'React 19 uses ref as a prop instead of forwardRef',
    description: 'React 19 supports ref as a normal prop — forwardRef is deprecated and its wrapper also interferes with React Compiler memoization.',
    severity: 'warning',
    applicable: ({ filePath, content, conventions }) =>
      /\.[jt]sx?$/.test(filePath) &&
      /\bforwardRef\s*\(/.test(content) &&
      isReact19(conventions?.reactVersion || ''),
    check: ({ content }) => {
      const m = content.match(/\bforwardRef\s*\(/)
      if (m) {
        return {
          passed: false,
          message: 'forwardRef is deprecated in React 19 — accept ref as a regular prop instead',
          line: findLine(content, m.index || 0),
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'compiler-auto-memoization',
    name: 'React Compiler auto-memoizes — avoid manual memoization',
    description: 'With the React Compiler enabled, components are memoized automatically; manual useMemo/useCallback are usually redundant and add noise.',
    severity: 'info',
    applicable: ({ filePath, content, conventions }) =>
      /\.[jt]sx?$/.test(filePath) &&
      conventions?.reactCompiler?.enabled === true &&
      /useMemo\s*\(|useCallback\s*\(/.test(content),
    check: ({ content }) => {
      const m = content.match(/useMemo\s*\(|useCallback\s*\(/)
      if (m) {
        return {
          passed: false,
          message: 'React Compiler auto-memoizes — manual useMemo/useCallback is usually redundant; keep values immutable and let the Compiler cache',
          line: findLine(content, m.index || 0),
        }
      }
      return { passed: true }
    },
  },
]
