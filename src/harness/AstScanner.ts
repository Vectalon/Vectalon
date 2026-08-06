import { parse, type ParserPlugin } from '@babel/parser'
import { extname } from 'path'

/**
 * AST-based source analysis for React Native projects.
 *
 * Replaces the regex-based component/import sniffing with a real
 * TypeScript/JSX parse, so the harness can track component trees, hook
 * dependencies, navigation structure, and native module boundaries instead
 * of pattern-matching text.
 */

export type PlatformSuffix =
  | 'ios'
  | 'android'
  | 'windows'
  | 'macos'
  | 'web'
  | 'native'
  | 'universal'

export interface ImportInfo {
  source: string
  /** Local binding of the default specifier, if any. */
  defaultName: string | null
  /** Named specifiers (imported → local binding). */
  named: string[]
  /** Namespace binding (import * as X), if any. */
  namespace: string | null
  dynamic: boolean
}

export interface ExportInfo {
  name: string
  kind: 'default' | 'named' | 're-export' | 'all'
}

export interface HookCall {
  hook: string
  /** Component binding this hook belongs to, when the call sits inside one. */
  component: string | null
  /** Dependency array for effect/memo hooks, when present and static. */
  deps: string[] | null
}

export interface NavigatorScreen {
  name: string
  component: string
}

export interface NavigatorInfo {
  /** Local binding, e.g. `Stack` in `const Stack = createNativeStackNavigator()`. */
  name: string
  type: 'native-stack' | 'stack' | 'bottom-tabs' | 'material-top-tabs' | 'drawer' | 'material-bottom-tabs' | 'unknown'
  screens: NavigatorScreen[]
}

export interface NavigationInfo {
  hasContainer: boolean
  navigators: NavigatorInfo[]
  /** Navigation hooks used (useNavigation, useRoute, …). */
  hooks: string[]
}

export interface ComponentDef {
  name: string
  kind: 'function' | 'class'
  isDefaultExport: boolean
  isNamedExport: boolean
  /** JSX element names rendered by this component (uppercase = component refs). */
  children: string[]
  /** Hook names called inside this component. */
  hooks: string[]
  /** HOC wrapper names, e.g. withNavigation, when wrapped on export. */
  hocs: string[]
  jsxElementCount: number
}

export interface SourceAnalysis {
  filePath: string
  imports: ImportInfo[]
  exports: ExportInfo[]
  components: ComponentDef[]
  hooks: HookCall[]
  navigation: NavigationInfo
  /** Native module identifiers referenced (NativeModules.X, TurboModuleRegistry.get). */
  nativeModules: string[]
  /** File-level flags (kept file-scoped for convention detection). */
  usesStyleSheet: boolean
  usesNavigation: boolean
  platform: PlatformSuffix
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

// babel AST nodes are loosely shaped; walking them dynamically requires
// casting to narrow views, so the node type is intentionally untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BabelNode = any

/** Pick the babel plugin set for a file extension. */
function pluginsFor(fileName: string): ParserPlugin[] {
  const ext = extname(fileName)
  if (ext === '.tsx') return ['typescript', 'jsx']
  if (ext === '.ts') return ['typescript']
  if (ext === '.jsx') return ['jsx']
  // Plain JS: try with flow types (common in RN codebases) then without.
  return ['jsx', 'flow']
}

/**
 * Parse a source file into a babel AST, or return null when the file cannot
 * be parsed (syntax errors, exotic syntax). The scanner treats unparseable
 * files as opaque rather than crashing the whole project scan.
 */
export function parseSource(content: string, fileName: string): BabelNode | null {
  const sourceType = 'module' as const
  try {
    return parse(content, { sourceType, plugins: pluginsFor(fileName) })
  } catch {
    // Flow-typed JS/JSX files fail the plain parse — retry with flow enabled.
    const ext = extname(fileName)
    if (ext === '.js' || ext === '.jsx') {
      try {
        return parse(content, { sourceType, plugins: ['jsx', 'flow'] })
      } catch {
        return null
      }
    }
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Generic traversal                                                   */
/* ------------------------------------------------------------------ */

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'extra', 'comments', 'tokens', 'leadingComments', 'trailingComments', 'innerComments'])

/** Depth-first walk of every AST node (object or array of objects with a `type`). */
export function walk(
  node: unknown,
  visit: (node: BabelNode, parent: BabelNode | null) => void,
  parent: BabelNode | null = null
): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit, parent)
    return
  }
  if (!node || typeof node !== 'object') return
  const n = node as BabelNode
  if (typeof n.type !== 'string') return
  visit(n, parent)
  for (const key of Object.keys(n)) {
    if (SKIP_KEYS.has(key)) continue
    const value = n[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && typeof (item as BabelNode).type === 'string') {
          walk(item, visit, n)
        }
      }
    } else if (value && typeof value === 'object' && typeof (value as BabelNode).type === 'string') {
      walk(value, visit, n)
    }
  }
}

/* ------------------------------------------------------------------ */
/* Expression → source snippet (for dependency arrays, screen names)   */
/* ------------------------------------------------------------------ */

function nodeSource(node: unknown, depth = 0): string | null {
  if (!node || typeof node !== 'object') return null
  const n = node as BabelNode
  switch (n.type) {
    case 'Identifier':
      return (n as { name: string }).name
    case 'StringLiteral':
    case 'NumericLiteral':
      return String((n as { value: unknown }).value)
    case 'BooleanLiteral':
      return String((n as { value: unknown }).value)
    case 'NullLiteral':
      return 'null'
    case 'MemberExpression': {
      const obj = nodeSource((n as { object: unknown }).object, depth + 1)
      const prop = nodeSource((n as { property: unknown }).property, depth + 1)
      if (obj === null || prop === null) return null
      const computed = (n as { computed?: boolean }).computed
      return computed ? `${obj}[${prop}]` : `${obj}.${prop}`
    }
    case 'CallExpression': {
      if (depth > 3) return null
      const callee = nodeSource((n as { callee: unknown }).callee, depth + 1)
      return callee === null ? null : `${callee}(…)`
    }
    case 'TemplateLiteral':
      return 'template'
    default:
      return null
  }
}

/** Serialize an array expression to its element names, or null if not a static array. */
function arrayToDeps(node: unknown): string[] | null {
  if (!node || typeof node !== 'object' || (node as BabelNode).type !== 'ArrayExpression') return null
  const elements = (node as { elements: unknown[] }).elements
  const deps: string[] = []
  for (const el of elements) {
    if (el === null) return null // holes — treat as dynamic
    const src = nodeSource(el)
    if (src === null) return null
    deps.push(src)
  }
  return deps
}

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useCallback', 'useMemo'])
const NAVIGATION_HOOKS = new Set(['useNavigation', 'useRoute', 'useFocusEffect', 'useIsFocused', 'useNavigationState', 'useLinkProps', 'useLinkTo'])
/** Wrapper factories whose argument is the real component (memo, forwardRef, connect, …). */
const WRAPPER_FACTORIES = new Set(['memo', 'forwardRef', 'connect', 'withNavigation', 'withRouter', 'observer', 'injectIntl', 'styled'])

/** RN host elements that are not project components (kept out of the component tree). */
const RN_PRIMITIVES = new Set([
  'View', 'Text', 'Image', 'ScrollView', 'FlatList', 'SectionList', 'VirtualizedList',
  'TextInput', 'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback',
  'Modal', 'SafeAreaView', 'ActivityIndicator', 'Switch', 'KeyboardAvoidingView', 'RefreshControl',
  'StatusBar', 'Animated', 'StyleSheet', 'Alert', 'PanResponder', 'Dimensions', 'Clipboard',
])

const NAVIGATOR_FACTORIES: Record<string, NavigatorInfo['type']> = {
  createNativeStackNavigator: 'native-stack',
  createStackNavigator: 'stack',
  createBottomTabNavigator: 'bottom-tabs',
  createMaterialTopTabNavigator: 'material-top-tabs',
  createMaterialBottomTabNavigator: 'material-bottom-tabs',
  createDrawerNavigator: 'drawer',
}

function detectPlatform(fileName: string): PlatformSuffix {
  const m = /\.(ios|android|windows|macos|web|native)\.(tsx?|jsx?|ts|js)$/.exec(fileName)
  if (m) return m[1] as PlatformSuffix
  return 'universal'
}

interface ComponentCandidate {
  name: string
  kind: 'function' | 'class'
  node: BabelNode
  isDefaultExport: boolean
  isNamedExport: boolean
}

/**
 * Analyze a single source file into structured knowledge. Returns null when
 * the file cannot be parsed.
 */
export function analyzeSourceFile(content: string, filePath: string): SourceAnalysis | null {
  const ast = parseSource(content, filePath)
  if (!ast) return null

  const imports: ImportInfo[] = []
  const exports: ExportInfo[] = []
  const hooks: HookCall[] = []
  const nativeModules = new Set<string>()
  const navigation: NavigationInfo = { hasContainer: false, navigators: [], hooks: [] }
  let usesStyleSheet = false
  let usesNavigation = false

  const candidates: ComponentCandidate[] = []

  walk(ast, (node) => {
    switch (node.type) {
      case 'ImportDeclaration': {
        const source = (node as { source: { value: string } }).source.value
        const info: ImportInfo = {
          source,
          defaultName: null,
          named: [],
          namespace: null,
          dynamic: false,
        }
        for (const spec of (node as { specifiers: BabelNode[] }).specifiers) {
          if (spec.type === 'ImportDefaultSpecifier') {
            info.defaultName = (spec as { local: { name: string } }).local.name
          } else if (spec.type === 'ImportSpecifier') {
            info.named.push((spec as { local: { name: string } }).local.name)
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            info.namespace = (spec as { local: { name: string } }).local.name
          }
        }
        imports.push(info)
        if (source === 'react-native') {
          if (info.named.includes('NativeModules') || info.named.includes('TurboModuleRegistry') || info.named.includes('NativeEventEmitter')) {
            nativeModules.add('react-native')
          }
        }
        break
      }
      case 'ExportNamedDeclaration': {
        const decl = (node as { declaration: BabelNode | null; source: { value: string } | null }).declaration
        const src = (node as { source: { value: string } | null }).source
        if (src) {
          exports.push({ name: src.value, kind: 're-export' })
        } else if (decl) {
          for (const name of exportNamesFromDeclaration(decl)) {
            exports.push({ name, kind: 'named' })
          }
        }
        break
      }
      case 'ExportDefaultDeclaration': {
        const decl = (node as { declaration: BabelNode }).declaration
        const name = defaultExportName(decl)
        exports.push({ name, kind: 'default' })
        break
      }
      case 'ExportAllDeclaration': {
        const src = (node as { source: { value: string } | null }).source
        exports.push({ name: src ? src.value : '*', kind: 'all' })
        break
      }
      case 'CallExpression': {
        const callee = (node as { callee: BabelNode }).callee
        if (callee?.type === 'Import') {
          const arg = (node as { arguments: BabelNode[] }).arguments[0]
          if (arg?.type === 'StringLiteral') {
            imports.push({
              source: String((arg as { value: unknown }).value),
              defaultName: null,
              named: [],
              namespace: null,
              dynamic: true,
            })
          }
        }
        analyzeCallExpression(node, nativeModules, navigation)
        break
      }
      case 'MemberExpression': {
        // NativeModules.SomeNativeModule (property access, not a call).
        const me = node as { object: BabelNode | null; property: BabelNode | null }
        const obj = me.object
        const prop = me.property
        if (obj?.type === 'Identifier' && (obj as { name: string }).name === 'NativeModules' && prop?.type === 'Identifier') {
          const propName = (prop as { name: string }).name
          if (/^[A-Z]/.test(propName)) nativeModules.add(propName)
        }
        break
      }
      case 'VariableDeclarator': {
        const id = (node as { id: BabelNode }).id
        const init = (node as { init: BabelNode | null }).init
        if (init && id.type === 'Identifier') {
          const name = (id as { name: string }).name
          if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
            candidates.push({ name, kind: 'function', node: init, isDefaultExport: false, isNamedExport: false })
          } else if (init.type === 'ClassExpression') {
            if (extendsComponent(init)) {
              candidates.push({ name, kind: 'class', node: init, isDefaultExport: false, isNamedExport: false })
            }
          } else if (init.type === 'CallExpression') {
            // const Comp = memo(() => <View/>) / forwardRef((props, ref) => …)
            const inner = unwrapComponentCall(init)
            if (inner && (inner.type === 'ArrowFunctionExpression' || inner.type === 'FunctionExpression')) {
              candidates.push({ name, kind: 'function', node: inner, isDefaultExport: false, isNamedExport: false })
            }
          }
          if (init.type === 'CallExpression') {
            const callee = (init as { callee: BabelNode }).callee
            if (callee.type === 'Identifier') {
              const factory = (callee as { name: string }).name
              if (NAVIGATOR_FACTORIES[factory]) {
                navigation.navigators.push({ name, type: NAVIGATOR_FACTORIES[factory], screens: [] })
              }
            }
          }
        }
        break
      }
      case 'FunctionDeclaration': {
        const name = (node as { id: { name: string } | null }).id?.name
        if (name) {
          candidates.push({ name, kind: 'function', node, isDefaultExport: false, isNamedExport: false })
        }
        break
      }
      case 'ClassDeclaration': {
        const name = (node as { id: { name: string } | null }).id?.name
        if (name && extendsComponent(node)) {
          candidates.push({ name, kind: 'class', node, isDefaultExport: false, isNamedExport: false })
        }
        break
      }
      case 'JSXElement': {
        const opening = (node as { openingElement: BabelNode }).openingElement
        const nameNode = (opening as { name: BabelNode }).name
        if (nameNode.type === 'JSXIdentifier' && (nameNode as { name: string }).name === 'NavigationContainer') {
          navigation.hasContainer = true
          usesNavigation = true
        }
        if (nameNode.type === 'JSXMemberExpression') {
          // <Stack.Screen name="X" component={Y} />
          const obj = (nameNode as { object: BabelNode }).object
          const prop = (nameNode as { property: { name: string } }).property
          if (obj.type === 'JSXIdentifier' && prop.name === 'Screen') {
            const navigatorName = (obj as { name: string }).name
            const screens = navigation.navigators.find(n => n.name === navigatorName)?.screens
            if (screens) {
              const attrs = openingAttributes(opening)
              const screenName = attrs.name ?? navigatorName
              const component = attrs.component ?? 'unknown'
              screens.push({ name: screenName, component })
            }
          }
        }
        break
      }
    }
  })

  // Track hook calls and JSX per component body; also file-level flags.
  const fileLevel: ComponentDef[] = []
  for (const cand of candidates) {
    const bodyHooks = new Set<string>()
    const children = new Set<string>()
    let jsxCount = 0
    const body = cand.kind === 'class' ? (cand.node as { body: BabelNode }).body : cand.node
    walk(body, (n) => {
      if (n.type === 'CallExpression') {
        const callee = (n as { callee: BabelNode }).callee
        if (callee.type === 'Identifier') {
          const name = (callee as { name: string }).name
          if (/^use[A-Z]/.test(name)) {
            bodyHooks.add(name)
            const args = (n as { arguments: unknown[] }).arguments
            const deps = EFFECT_HOOKS.has(name) && args.length >= 2 ? arrayToDeps(args[args.length - 1]) : null
            hooks.push({ hook: name, component: cand.name, deps })
          }
        }
      } else if (n.type === 'JSXElement') {
        jsxCount++
        const opening = (n as { openingElement: BabelNode }).openingElement
        const nameNode = (opening as { name: BabelNode }).name
        if (nameNode.type === 'JSXIdentifier') {
          const tag = (nameNode as { name: string }).name
          if (/^[A-Z]/.test(tag) && !RN_PRIMITIVES.has(tag)) children.add(tag)
        } else if (nameNode.type === 'JSXMemberExpression') {
          const obj = (nameNode as { object: BabelNode }).object
          if (obj.type === 'JSXIdentifier') children.add((obj as { name: string }).name)
        }
      }
    })
    if (jsxCount === 0 && cand.kind === 'function' && !/^[A-Z]/.test(cand.name)) continue
    fileLevel.push({
      name: cand.name,
      kind: cand.kind,
      isDefaultExport: cand.isDefaultExport,
      isNamedExport: cand.isNamedExport,
      children: [...children],
      hooks: [...bodyHooks],
      hocs: [],
      jsxElementCount: jsxCount,
    })
  }

  // StyleSheet usage: file-level convention flag.
  walk(ast, (n) => {
    if (n.type !== 'MemberExpression') return
    const me = n as { object: unknown; property: unknown }
    if (me.object && typeof me.object === 'object' && (me.object as BabelNode).type === 'Identifier') {
      const obj = me.object as { name: string }
      if (obj.name === 'StyleSheet' && me.property && typeof me.property === 'object') {
        const prop = me.property as { name?: string; value?: unknown }
        if (prop.name === 'create') usesStyleSheet = true
      }
    }
  })

  // Export flags + HOC wrapping on the default export.
  const hocResult = analyzeDefaultExportHocs(ast)
  for (const exp of exports) {
    if (exp.kind === 'default') {
      let defaultName = exp.name
      // `export default withNavigation(Home)` — the wrapped binding is the default export.
      if (defaultName === 'default' && hocResult.componentRef) defaultName = hocResult.componentRef
      for (const comp of fileLevel) {
        if (comp.name === defaultName) comp.isDefaultExport = true
      }
    }
  }
  const namedExportSet = new Set(exports.filter(e => e.kind === 'named').map(e => e.name))
  for (const comp of fileLevel) {
    if (namedExportSet.has(comp.name)) comp.isNamedExport = true
  }
  if (hocResult.componentRef) {
    const target = fileLevel.find(c => c.name === hocResult.componentRef)
    if (target) target.hocs = hocResult.hocs
  }

  // Navigation hook usage (file-level for the flag, per-file for the graph).
  for (const h of navigation.hooks) {
    if (NAVIGATION_HOOKS.has(h)) usesNavigation = true
  }

  return {
    filePath,
    imports,
    exports,
    components: fileLevel,
    hooks,
    navigation,
    nativeModules: [...nativeModules],
    usesStyleSheet,
    usesNavigation: usesNavigation || navigation.hasContainer,
    platform: detectPlatform(filePath),
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function exportNamesFromDeclaration(decl: BabelNode): string[] {
  switch (decl.type) {
    case 'FunctionDeclaration':
    case 'ClassDeclaration': {
      const id = (decl as { id: { name: string } | null }).id
      return id ? [id.name] : []
    }
    case 'VariableDeclaration': {
      const names: string[] = []
      for (const d of (decl as { declarations: BabelNode[] }).declarations) {
        const id = (d as { id: BabelNode }).id
        if (id.type === 'Identifier') names.push((id as { name: string }).name)
        else if (id.type === 'ObjectPattern') {
          for (const p of (id as { properties: BabelNode[] }).properties) {
            const val = (p as { value: BabelNode }).value
            if (val.type === 'Identifier') names.push((val as { name: string }).name)
          }
        }
      }
      return names
    }
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSEnumDeclaration': {
      const id = (decl as { id: { name: string } }).id
      return id ? [id.name] : []
    }
    default:
      return []
  }
}

function defaultExportName(decl: BabelNode): string {
  switch (decl.type) {
    case 'FunctionDeclaration':
    case 'ClassDeclaration': {
      const id = (decl as { id: { name: string } | null }).id
      return id ? id.name : 'default'
    }
    case 'Identifier':
      return (decl as { name: string }).name
    default:
      return 'default'
  }
}

function extendsComponent(node: BabelNode): boolean {
  const superClass = (node as { superClass: unknown }).superClass
  if (!superClass || typeof superClass !== 'object') return false
  const sc = superClass as BabelNode
  if (sc.type === 'Identifier') {
    return (sc as { name: string }).name === 'Component' || (sc as { name: string }).name === 'PureComponent'
  }
  if (sc.type === 'MemberExpression') {
    const prop = (sc as { property: { name: string } }).property
    return prop?.name === 'Component' || prop?.name === 'PureComponent'
  }
  return false
}

function analyzeCallExpression(
  node: BabelNode,
  nativeModules: Set<string>,
  navigation: NavigationInfo
): void {
  const callee = (node as { callee: BabelNode }).callee
  const args = (node as { arguments: unknown[] }).arguments
  if (callee.type === 'MemberExpression') {
    const obj = (callee as { object: BabelNode }).object
    const prop = (callee as { property: { name: string } | { value: string } }).property
    const propName = 'name' in prop ? prop.name : String((prop as { value: string }).value)
    if (obj.type === 'Identifier' && (obj as { name: string }).name === 'NativeModules' && /^[A-Z]/.test(propName)) {
      nativeModules.add(propName)
    }
    if (obj.type === 'Identifier' && (obj as { name: string }).name === 'TurboModuleRegistry' && propName === 'get') {
      const arg = args[0]
      if (arg && typeof arg === 'object' && (arg as BabelNode).type === 'StringLiteral') {
        nativeModules.add(String((arg as { value: unknown }).value))
      }
    }
  } else if (callee.type === 'Identifier') {
    const name = (callee as { name: string }).name
    if (NAVIGATION_HOOKS.has(name) && !navigation.hooks.includes(name)) {
      navigation.hooks.push(name)
    }
  }
}

/** Extract name/component attributes from a JSX opening element. */
function openingAttributes(opening: BabelNode): { name?: string; component?: string } {
  const attrs = (opening as { attributes: BabelNode[] }).attributes
  const out: { name?: string; component?: string } = {}
  for (const attr of attrs) {
    if (attr.type !== 'JSXAttribute') continue
    const a = attr as { name: { name: string }; value: unknown }
    if (a.name.name !== 'name' && a.name.name !== 'component') continue
    const value = a.value
    if (value && typeof value === 'object') {
      const v = value as BabelNode
      if (v.type === 'StringLiteral') {
        if (a.name.name === 'name') out.name = String((v as { value: unknown }).value)
      } else if (v.type === 'JSXExpressionContainer') {
        const inner = (v as { expression: unknown }).expression
        if (inner && typeof inner === 'object' && (inner as BabelNode).type === 'Identifier') {
          if (a.name.name === 'component') out.component = (inner as { name: string }).name
        }
      }
    }
  }
  return out
}

/** Detect HOC wrappers around the default export (withNavigation(X), connect()(X), …). */
function analyzeDefaultExportHocs(ast: BabelNode): { componentRef: string | null; hocs: string[] } {
  let result: { componentRef: string | null; hocs: string[] } = { componentRef: null, hocs: [] }
  walk(ast, (node) => {
    if (node.type !== 'ExportDefaultDeclaration') return
    const decl = (node as { declaration: BabelNode }).declaration
    const hocs: string[] = []
    let inner: BabelNode = decl
    let guard = 0
    while ((inner.type === 'CallExpression' || inner.type === 'TaggedTemplateExpression') && guard++ < 6) {
      const callee = (inner as { callee: BabelNode }).callee
      const args = (inner as { arguments: BabelNode[] }).arguments
      if (callee.type === 'Identifier') {
        const factory = (callee as { name: string }).name
        if (inner.type === 'CallExpression' && args.length > 0 && (WRAPPER_FACTORIES.has(factory) || !isCallFactory(callee, args))) {
          hocs.push(factory)
          // withNavigation(Home) / withNavigation(Home, options): first identifier arg is the component.
          const direct = args.find(a => a.type === 'Identifier')
          if (direct) {
            inner = direct
            break
          }
          const next = args[0]
          if (next && (next.type === 'CallExpression' || next.type === 'ArrowFunctionExpression' || next.type === 'FunctionExpression')) {
            inner = next
            continue
          }
          break
        }
        break
      } else if (callee.type === 'CallExpression') {
        // connect(mapState, mapDispatch)(Home) — the inner call is the HOC factory.
        const innerCallee = (callee as { callee: BabelNode }).callee
        if (innerCallee.type === 'Identifier') {
          hocs.push((innerCallee as { name: string }).name)
        }
        inner = args[0] as BabelNode
        continue
      } else if (callee.type === 'MemberExpression') {
        hocs.push('connect')
        const next = args[0]
        if (next) {
          inner = next
          continue
        }
        break
      } else {
        break
      }
    }
    result = {
      componentRef: inner.type === 'Identifier' ? (inner as { name: string }).name : null,
      hocs: hocs.reverse(),
    }
  })
  return result
}

/** Unwrap `memo(...)` / `forwardRef(...)` / `connect(...)(...)` to the inner render function. */
function unwrapComponentCall(node: BabelNode): BabelNode | null {
  let cur: BabelNode = node
  let guard = 0
  while (cur.type === 'CallExpression' && guard++ < 4) {
    const callee = (cur as { callee: BabelNode }).callee
    const args = (cur as { arguments: BabelNode[] }).arguments
    if (callee.type === 'Identifier' && WRAPPER_FACTORIES.has((callee as { name: string }).name)) {
      const next = args.find(a => a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression')
      if (next) return next
      cur = args[0] as BabelNode
    } else if (callee.type === 'CallExpression') {
      // connect(...)(Comp)
      cur = args[0] as BabelNode
    } else {
      return null
    }
  }
  return cur.type === 'ArrowFunctionExpression' || cur.type === 'FunctionExpression' ? cur : null
}

/** A call factory is a known wrapper or a PascalCase identifier (e.g. `withFoo`). */
function isCallFactory(callee: BabelNode, args: BabelNode[]): boolean {
  if (args.length === 0) return true
  const name = (callee as { name?: string }).name || ''
  return WRAPPER_FACTORIES.has(name) || /^use[A-Z]/.test(name) || /^[A-Z]/.test(name)
}
