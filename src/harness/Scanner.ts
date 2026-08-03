import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, relative, extname } from 'path'
import type { ProjectInfo, FileNode, ComponentInfo, LintConfigInfo } from './types'

export interface PackageJsonLike {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

/**
 * Single source of truth for Expo vs bare React Native CLI detection.
 * A project is Expo-managed when `expo` is a dependency or `@expo/config`
 * is present (the config package is what Expo-managed projects use).
 */
export function detectProjectTooling(pkg: PackageJsonLike): 'expo' | 'rn-cli' {
  return pkg.dependencies?.expo || pkg.devDependencies?.['@expo/config'] ? 'expo' : 'rn-cli'
}

export class Scanner {
  private root: string

  constructor(root: string) {
    this.root = root
  }

  scanProject(): ProjectInfo {
    const pkgPath = join(this.root, 'package.json')
    if (!existsSync(pkgPath)) {
      throw new Error(`No package.json found at ${this.root}`)
    }

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const rnVersion = pkg.dependencies?.['react-native'] || ''
    const tooling = detectProjectTooling(pkg)

    return {
      root: this.root,
      name: pkg.name || 'unknown',
      version: pkg.version || '0.0.0',
      reactNativeVersion: rnVersion,
      dependencies: pkg.dependencies || {},
      devDependencies: pkg.devDependencies || {},
      scripts: pkg.scripts || {},
      platforms: this.detectPlatforms(pkg),
      hasTypeScript: existsSync(join(this.root, 'tsconfig.json')),
      hasMetro: existsSync(join(this.root, 'metro.config.js')) || existsSync(join(this.root, 'metro.config.cjs')),
      hasExpo: tooling === 'expo',
      tooling,
      expoSdkVersion: pkg.dependencies?.expo || '',
      lintConfig: this.detectLintConfigs(),
    }
  }

  scanStructure(rootDir = 'src', maxDepth = 4): FileNode[] {
    const srcPath = join(this.root, rootDir)
    if (!existsSync(srcPath)) return []

    return this.buildTree(srcPath, 0, maxDepth)
  }

  scanComponents(): ComponentInfo[] {
    const components: ComponentInfo[] = []
    const srcDir = join(this.root, 'src')

    if (!existsSync(srcDir)) return components

    const walkDir = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry)
        const stat = statSync(fullPath)

        if (stat.isDirectory()) {
          walkDir(fullPath)
        } else if (/\.(tsx?|jsx?)$/.test(entry)) {
          const content = readFileSync(fullPath, 'utf-8')
          const name = entry.replace(/\.(tsx?|jsx?)$/, '')
          const isComponent = /\b(React|Component|View|Text|StyleSheet)\b/.test(content)

          if (isComponent) {
            components.push({
              name,
              filePath: relative(this.root, fullPath),
              isDefaultExport: /export\s+default/.test(content),
              usesStyleSheet: /\bStyleSheet\.(create|flatten)\b/.test(content),
              usesNavigation: /\buseNavigation|NavigationContainer\b/.test(content),
              imports: this.extractImports(content),
            })
          }
        }
      }
    }

    walkDir(srcDir)
    return components
  }

  private buildTree(dir: string, depth: number, maxDepth: number): FileNode[] {
    if (depth > maxDepth) return []

    const entries = readdirSync(dir)
    const nodes: FileNode[] = []

    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules') continue

      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        nodes.push({
          path: relative(this.root, fullPath),
          type: 'directory',
          children: this.buildTree(fullPath, depth + 1, maxDepth),
        })
      } else {
        nodes.push({
          path: relative(this.root, fullPath),
          type: 'file',
          extension: extname(entry),
          size: stat.size,
        })
      }
    }

    return nodes
  }

  private detectPlatforms(pkg: Record<string, unknown>): string[] {
    const platforms: string[] = ['ios', 'android']
    if (pkg.dependencies && typeof pkg.dependencies === 'object') {
      const deps = pkg.dependencies as Record<string, string>
      if (deps['react-native-windows']) platforms.push('windows')
      if (deps['react-native-macos']) platforms.push('macos')
      if (deps['react-native-web']) platforms.push('web')
      if (deps['react-native-visionos']) platforms.push('visionos')
    }
    return platforms
  }

  private extractImports(content: string): string[] {
    const imports: string[] = []
    const regex = /from\s+['"]([^'"]+)['"]/g
    let match
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1])
    }
    return imports
  }

  private detectLintConfigs(): LintConfigInfo {
    const configs: LintConfigInfo = {}
    const readIfExists = (name: string): string | undefined => {
      const path = join(this.root, name)
      if (existsSync(path)) {
        try {
          return readFileSync(path, 'utf-8').slice(0, 8000)
        } catch {
          return undefined
        }
      }
      return undefined
    }
    const eslintNames = [
      '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
      '.eslintrc.yaml', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs',
    ]
    for (const name of eslintNames) {
      const content = readIfExists(name)
      if (content) {
        configs.eslint = content
        break
      }
    }
    const biome = readIfExists('biome.json')
    if (biome) configs.biome = biome
    const prettierNames = ['.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs']
    for (const name of prettierNames) {
      const content = readIfExists(name)
      if (content) {
        configs.prettier = content
        break
      }
    }
    const tsconfig = readIfExists('tsconfig.json')
    if (tsconfig) configs.tsconfig = tsconfig
    return configs
  }
}
