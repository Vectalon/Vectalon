export type ProjectTooling = 'expo' | 'rn-cli'

export type PlatformSuffix = 'ios' | 'android' | 'windows' | 'macos' | 'web' | 'native' | 'universal'

export type WorkspaceManager = 'pnpm' | 'yarn' | 'npm' | 'turborepo' | 'lerna'

export interface WorkspaceInfo {
  /** True when the scanned root is part of a monorepo workspace. */
  isMonorepo: boolean
  /** Detected package manager / orchestrator, or null when not a monorepo. */
  manager: WorkspaceManager | null
  /** Absolute path of the workspace root (may differ from the project root). */
  root: string | null
  /** Workspace glob patterns as declared (e.g. `packages/*`). */
  patterns: string[]
  /** Absolute paths of every workspace member directory that has a package.json. */
  packages: string[]
  /** Internal package name → absolute directory (for dependency mapping). */
  internalPackages: Record<string, string>
  /** True when node_modules is hoisted to the workspace root (default for all managers). */
  hoistedNodeModules: boolean
}

export interface LintConfigInfo {
  eslint?: string
  biome?: string
  prettier?: string
  tsconfig?: string
}

export interface ProjectInfo {
  root: string
  name: string
  version: string
  reactNativeVersion: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  scripts: Record<string, string>
  platforms: string[]
  hasTypeScript: boolean
  hasMetro: boolean
  hasExpo: boolean
  /** Distinguishes Expo-managed projects from bare React Native CLI projects. */
  tooling: ProjectTooling
  /** Expo SDK version when tooling is 'expo', otherwise ''. */
  expoSdkVersion: string
  /** Detected lint / formatter / TypeScript configuration content. */
  lintConfig?: LintConfigInfo
  /** Detected React Native New Architecture state (Fabric / bridgeless / TurboModules). */
  newArchitecture?: import('../utils/newArchitecture').NewArchitectureInfo
  /** Monorepo workspace context when the project lives in a pnpm/yarn/npm/turbo/lerna workspace. */
  workspace?: import('./workspace').WorkspaceInfo
  /** React version resolved from the manifest ('' when unknown). */
  reactVersion: string
  /** Detected React 19 / React Compiler state (babel-plugin-react-compiler). */
  reactCompiler?: import('../utils/reactCompiler').ReactCompilerInfo
}

export interface FileNode {
  path: string
  type: 'file' | 'directory'
  extension?: string
  size?: number
  children?: FileNode[]
}

export interface ComponentInfo {
  name: string
  filePath: string
  isDefaultExport: boolean
  usesStyleSheet: boolean
  usesNavigation: boolean
  imports: string[]
  /** AST-derived: 'function' | 'class' component kind. */
  kind?: 'function' | 'class'
  /** AST-derived: hook names used inside the component. */
  hooks?: string[]
  /** AST-derived: HOC wrappers on export (withNavigation, connect, …). */
  hocs?: string[]
  /** AST-derived: native module identifiers referenced. */
  nativeModules?: string[]
  /** Platform-specific file variant (.ios./.android./…). */
  platform?: PlatformSuffix
  /** All export names (named + default) of the component. */
  exportedNames?: string[]
}

export interface ContextSnapshot {
  project: ProjectInfo
  structure: FileNode[]
  components: ComponentInfo[]
  recentChanges: string[]
  timestamp: number
  codeGraph?: import('./CodeGraph').CodeGraph
  /** AST-derived RN knowledge graph (component trees, hooks, navigation, native). */
  knowledgeGraph?: import('./KnowledgeGraph').RNGraph
}
