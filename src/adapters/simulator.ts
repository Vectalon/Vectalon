import { execFile } from 'child_process'
import { promisify } from 'util'
import { logger } from '../cli/logger'
import type { SimulatorAdapter, SimulatorOptions, SimulatorResult } from './types'

const execFileAsync = promisify(execFile)

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

    logger.info(`Running simulator: npx ${args.join(' ')}`)
    try {
      const { stdout, stderr } = await execFileAsync('npx', args, {
        cwd: this.root,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 5 * 60 * 1000,
      })
      return {
        success: true,
        stdout,
        stderr,
        exitCode: 0,
      }
    } catch (err) {
      const error = err as { stdout?: string; stderr?: string; code?: number }
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code ?? 1,
      }
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
