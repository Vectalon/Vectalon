import { GuardrailRule } from './types'

function findLine(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
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
]
