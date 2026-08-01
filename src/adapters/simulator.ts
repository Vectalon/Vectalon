import { logger } from '../cli/logger'
import { runCommand } from './runCommand'
import type { SimulatorAdapter, SimulatorOptions, SimulatorResult } from './types'

export class LocalSimulatorAdapter implements SimulatorAdapter {
  name = 'local'

  constructor(private root: string) {}

  async run(options: SimulatorOptions): Promise<SimulatorResult> {
    const args = options.platform === 'ios'
      ? ['react-native', 'run-ios']
      : ['react-native', 'run-android']

    if (options.device) {
      args.push('--device', options.device)
    }

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

  async run(options: SimulatorOptions): Promise<SimulatorResult> {
    const command = `xcrun simctl boot "${options.device || 'iPhone 15'}" && npx react-native run-ios${options.scheme ? ` --scheme ${options.scheme}` : ''}`
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
    const command = `emulator -avd "${options.device || 'Pixel_7'}" -no-snapshot && npx react-native run-android`
    logger.info(`[Android] Would run: ${command}`)

    return {
      success: true,
      stdout: 'Android emulator run simulated',
      stderr: '',
      exitCode: 0,
    }
  }
}

export function createSimulatorAdapter(config: Record<string, unknown> & { root?: string; dryRun?: boolean }): SimulatorAdapter {
  const provider = (config.provider as string) || 'local'
  if (config.dryRun) {
    return new ConsoleSimulatorAdapter()
  }

  if (provider === 'ios-simulator') {
    return new IOSSimulatorAdapter()
  }

  if (provider === 'android-emulator') {
    return new AndroidEmulatorAdapter()
  }

  return new LocalSimulatorAdapter((config.root as string) || process.cwd())
}
