import type { SimulatorAdapter, SimulatorOptions, SimulatorResult } from './types'

export class ConsoleSimulatorAdapter implements SimulatorAdapter {
  name = 'console'

  async run(options: SimulatorOptions): Promise<SimulatorResult> {
    const action = options.build ? 'build and run' : 'run'
    console.log(`[Simulator] Would ${action} ${options.platform}${options.device ? ` on ${options.device}` : ''}`)

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
    console.log(`[iOS] Would run: ${command}`)

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
    console.log(`[Android] Would run: ${command}`)

    return {
      success: true,
      stdout: 'Android emulator run simulated',
      stderr: '',
      exitCode: 0,
    }
  }
}

export function createSimulatorAdapter(config: Record<string, unknown>): SimulatorAdapter {
  const provider = (config.provider as string) || 'console'

  if (provider === 'ios-simulator') {
    return new IOSSimulatorAdapter()
  }

  if (provider === 'android-emulator') {
    return new AndroidEmulatorAdapter()
  }

  return new ConsoleSimulatorAdapter()
}
