import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export interface ValidationCommand {
  name: string
  cmd: string
  args: string[]
  cwd?: string
  timeout: number
  source: 'package.json' | 'rn-cli-default'
}

export interface DetectedValidationCommands {
  commands: ValidationCommand[]
  packageManager: 'npm' | 'yarn' | 'pnpm'
  hasReactNativeCLI: boolean
}

function detectPackageManager(root: string): 'npm' | 'yarn' | 'pnpm' {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function readPackageScripts(root: string): Record<string, string> {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { scripts?: Record<string, string> }
    return pkg.scripts || {}
  } catch {
    return {}
  }
}

function hasReactNativeDependency(root: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return !!pkg.dependencies?.['react-native'] || !!pkg.devDependencies?.['react-native']
  } catch {
    return false
  }
}

function runArgs(pm: 'npm' | 'yarn' | 'pnpm', script: string): [string, string[]] {
  if (pm === 'yarn') return ['yarn', [script]]
  if (pm === 'pnpm') return ['pnpm', ['run', script]]
  return ['npm', ['run', script]]
}

function findScript(scripts: Record<string, string>, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (scripts[candidate]) return candidate
  }
  return undefined
}

export function detectValidationCommands(root: string, opts?: { deviceRun?: boolean }): DetectedValidationCommands {
  const pm = detectPackageManager(root)
  const scripts = readPackageScripts(root)
  const hasRN = hasReactNativeDependency(root)
  const commands: ValidationCommand[] = []

  const iosBuildScript = findScript(scripts, ['ios', 'ios:build'])
  if (iosBuildScript && opts?.deviceRun) {
    const [cmd, args] = runArgs(pm, iosBuildScript)
    commands.push({ name: 'iOS build', cmd, args, timeout: 20 * 60 * 1000, source: 'package.json' })
  }

  const androidBuildScript = findScript(scripts, ['android', 'android:build'])
  if (androidBuildScript && opts?.deviceRun) {
    const [cmd, args] = runArgs(pm, androidBuildScript)
    commands.push({ name: 'Android build', cmd, args, timeout: 20 * 60 * 1000, source: 'package.json' })
  }

  const podInstallScript = findScript(scripts, ['pod-install', 'ios:pod-install', 'pods'])
  if (podInstallScript) {
    const [cmd, args] = runArgs(pm, podInstallScript)
    commands.push({ name: 'iOS pod install', cmd, args, timeout: 20 * 60 * 1000, source: 'package.json' })
  } else if (hasRN && existsSync(join(root, 'ios', 'Podfile'))) {
    commands.push({ name: 'iOS pod install', cmd: 'pod', args: ['install'], cwd: join(root, 'ios'), timeout: 20 * 60 * 1000, source: 'rn-cli-default' })
  }

  const gradleCleanScript = findScript(scripts, ['android:clean', 'gradle:clean', 'clean-android'])
  if (gradleCleanScript) {
    const [cmd, args] = runArgs(pm, gradleCleanScript)
    commands.push({ name: 'Android clean', cmd, args, timeout: 10 * 60 * 1000, source: 'package.json' })
  } else if (hasRN && existsSync(join(root, 'android', 'gradlew'))) {
    commands.push({ name: 'Android clean', cmd: './gradlew', args: ['clean'], cwd: join(root, 'android'), timeout: 10 * 60 * 1000, source: 'rn-cli-default' })
  }

  const gradleBuildScript = findScript(scripts, ['android:assemble', 'gradle:assemble', 'assemble-android', 'android:release'])
  if (gradleBuildScript) {
    const [cmd, args] = runArgs(pm, gradleBuildScript)
    commands.push({ name: 'Android assemble', cmd, args, timeout: 20 * 60 * 1000, source: 'package.json' })
  } else if (hasRN && existsSync(join(root, 'android', 'gradlew'))) {
    commands.push({ name: 'Android assemble', cmd: './gradlew', args: ['assembleDebug'], cwd: join(root, 'android'), timeout: 20 * 60 * 1000, source: 'rn-cli-default' })
  }

  return {
    commands,
    packageManager: pm,
    hasReactNativeCLI: hasRN,
  }
}
