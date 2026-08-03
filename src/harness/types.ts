export type ProjectTooling = 'expo' | 'rn-cli'

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
}

export interface ContextSnapshot {
  project: ProjectInfo
  structure: FileNode[]
  components: ComponentInfo[]
  recentChanges: string[]
  timestamp: number
  codeGraph?: import('./CodeGraph').CodeGraph
}
