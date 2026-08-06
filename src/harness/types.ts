export type ProjectTooling = 'expo' | 'rn-cli'

export type PlatformSuffix = 'ios' | 'android' | 'windows' | 'macos' | 'web' | 'native' | 'universal'

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
