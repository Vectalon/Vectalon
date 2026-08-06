import { readFileSync } from 'fs'
import { join } from 'path'
import { logger } from '../cli/logger'
import { runCommand } from './runCommand'
import { reportError } from '../utils/safe'
import { detectProjectTooling as detectToolingFromPkg } from '../harness/Scanner'
import type { SimulatorAdapter, SimulatorOptions, SimulatorResult } from './types'

/**
 * Detect whether the project at root is Expo-managed or a bare React Native CLI
 * project, so simulator runs use the right command. Delegates to the shared
 * detection in the harness Scanner (single source of truth).
 */
export function detectProjectTooling(root: string): 'expo' | 'rn-cli' {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return detectToolingFromPkg(pkg)
  } catch (err) {
    reportError(err, 'simulator: detecting tooling from package.json')
    return 'rn-cli'
  }
}

function runArgsFor(tooling: 'expo' | 'rn-cli', platform: 'ios' | 'android', options: SimulatorOptions): string[] {
  if (tooling === 'expo') {
    const args = ['expo', 'run:' + platform]
    if (options.device) args.push('--device', options.device)
    // --scheme is iOS-only
    if (options.scheme && platform === 'ios') args.push('--scheme', options.scheme)
    return args
  }
  const args = platform === 'ios'
    ? ['react-native', 'run-ios']
    : ['react-native', 'run-android']
  if (options.device) args.push('--device', options.device)
  // --scheme is iOS-only; run-android does not accept it
  if (options.scheme && platform === 'ios') args.push('--scheme', options.scheme)
  return args
}

export class LocalSimulatorAdapter implements SimulatorAdapter {
  name = 'local'

  constructor(private root: string) {}

  async run(options: SimulatorOptions): Promise<SimulatorResult> {
    const tooling = detectProjectTooling(this.root)
    const args = runArgsFor(tooling, options.platform, options)
    const commandLabel = tooling === 'expo' ? 'expo' : 'react-native'
    logger.dim(`  Simulator: ${commandLabel} run-${options.platform}${options.device ? ` on ${options.device}` : ''}`)

    const result = await runCommand('npx', args, {
      cwd: this.root,
      timeout: 10 * 60 * 1000,
    })

    return {
      success: result.success,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    }
  }
}

export class ConsoleSimulatorAdapter implements SimulatorAdapter {
  name = 'console'

  async run(options: SimulatorOptions): Promise<SimulatorResult> {
    const action = options.build ? 'build and run' : 'run'
    logger.dim(`  Simulator: would ${action} ${options.platform}${options.device ? ` on ${options.device}` : ''}`)

    return {
      success: true,
      stdout: `Mock ${options.platform} simulator run`,
      stderr: '',
      exitCode: 0,
    }
  }
}

export class IOSSimulatorAdapter implements SimulatorAdapter {
  name = 'ios-simulator'

  constructor(private root: string) {}

  async run(options: SimulatorOptions): Promise<SimulatorResult> {
    const tooling = detectProjectTooling(this.root)
    const runner = tooling === 'expo' ? 'npx expo run:ios' : 'npx react-native run-ios'
    const command = `xcrun simctl boot "${options.device || 'iPhone 15'}" && ${runner}${options.scheme ? ` --scheme ${options.scheme}` : ''}`
    logger.info(`[iOS] Would run: ${command}`)

    return {
      success: true,
      stdout: 'iOS simulator run simulated',
      stderr: '',
      exitCode: 0,
    }
  }
}

export class AndroidEmulatorAdapter implements SimulatorAdapter {
  name = 'android-emulator'

  async run(options: SimulatorOptions): Promise<SimulatorResult> {
    const tooling = detectProjectTooling(this.root)
    const runner = tooling === 'expo' ? 'npx expo run:android' : 'npx react-native run-android'
    const command = `emulator -avd "${options.device || 'Pixel_7'}" -no-snapshot && ${runner}`
    logger.info(`[Android] Would run: ${command}`)

    return {
      success: true,
      stdout: 'Android emulator run simulated',
      stderr: '',
      exitCode: 0,
    }
  }

  constructor(private root: string) {}
}

export function createSimulatorAdapter(config: Record<string, unknown> & { root?: string; dryRun?: boolean }): SimulatorAdapter {
  const provider = (config.provider as string) || 'local'
  const root = (config.root as string) || process.cwd()
  if (config.dryRun) {
    return new ConsoleSimulatorAdapter()
  }

  if (provider === 'ios-simulator') {
    return new IOSSimulatorAdapter(root)
  }

  if (provider === 'android-emulator') {
    return new AndroidEmulatorAdapter(root)
  }

  return new LocalSimulatorAdapter(root)
}
