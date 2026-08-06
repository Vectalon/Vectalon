import { mkdirSync, statSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { runCommand } from './runCommand'
import { reportError } from '../utils/safe'

/**
 * Deep device control for iOS Simulator / Android Emulator: boot, screenshot,
 * tap, swipe, deep-link, and log reading. Deterministic and testable — command
 * builders are pure, `dryRun` mode never executes anything, and missing
 * toolchains degrade to a clear failure result instead of throwing.
 *
 * Platform mapping:
 * - iOS: `xcrun simctl` (boot / shutdown / screenshot / openurl / logs) and
 *   `idb` for tap/swipe (simctl has no input injection).
 * - Android: `emulator` (boot) + `adb` (screenshot via screencap+pull, input
 *   tap/swipe, `am start` deep links, logcat).
 */

export type DevicePlatform = 'ios' | 'android'

export interface DeviceControllerOptions {
  /** Never execute anything; describe the intended commands instead. */
  dryRun?: boolean
  /** Force a platform; otherwise detected from the project at the root. */
  platform?: DevicePlatform
}

export interface DeviceActionResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
  /** The command that was (or would be) executed. */
  command: string
}

export interface DeviceCommand {
  command: string
  args: string[]
}

const DEFAULT_IOS_DEVICE = 'iPhone 15'
const DEFAULT_ANDROID_AVD = 'Pixel_7'

/** Resolve the platform from the project on disk (expo → ios, rn-cli → ios too; android/ dir wins). */
export function detectDevicePlatform(root: string): DevicePlatform {
  const hasAndroid = existsDir(join(root, 'android'))
  const hasIos = existsDir(join(root, 'ios'))
  if (hasAndroid && !hasIos) return 'android'
  return 'ios'
}

function existsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch (err) {
    reportError(err, `deviceControl: statting ${p}`)
    return false
  }
}

function deviceArg(device: string | undefined, platform: DevicePlatform): string {
  return device || (platform === 'android' ? DEFAULT_ANDROID_AVD : DEFAULT_IOS_DEVICE)
}

// ---------------------------------------------------------------------------
// Pure command builders
// ---------------------------------------------------------------------------

export function buildListDevicesCommands(platform: DevicePlatform): DeviceCommand[] {
  return platform === 'android'
    ? [{ command: 'adb', args: ['devices'] }]
    : [{ command: 'xcrun', args: ['simctl', 'list', 'devices', 'booted'] }]
}

export function buildBootCommands(platform: DevicePlatform, device?: string): DeviceCommand[] {
  const name = deviceArg(device, platform)
  return platform === 'android'
    ? [{ command: 'emulator', args: ['-avd', name, '-no-snapshot-save'] }]
    : [
        { command: 'xcrun', args: ['simctl', 'boot', name] },
        { command: 'xcrun', args: ['simctl', 'bootstatus', name, '-b'] },
      ]
}

export function buildShutdownCommands(platform: DevicePlatform, device?: string): DeviceCommand[] {
  return platform === 'android'
    ? [{ command: 'adb', args: ['emu', 'kill'] }]
    : [{ command: 'xcrun', args: ['simctl', 'shutdown', deviceArg(device, platform)] }]
}

export function buildScreenshotCommands(platform: DevicePlatform, localPath: string): DeviceCommand[] {
  if (platform === 'android') {
    const devicePath = '/sdcard/vectalon-screenshot.png'
    return [
      { command: 'adb', args: ['shell', 'screencap', '-p', devicePath] },
      { command: 'adb', args: ['pull', devicePath, localPath] },
      { command: 'adb', args: ['shell', 'rm', '-f', devicePath] },
    ]
  }
  return [{ command: 'xcrun', args: ['simctl', 'io', 'booted', 'screenshot', localPath] }]
}

export function buildTapCommands(platform: DevicePlatform, x: number, y: number): DeviceCommand[] {
  return platform === 'android'
    ? [{ command: 'adb', args: ['shell', 'input', 'tap', String(x), String(y)] }]
    : [{ command: 'idb', args: ['ui', 'tap', String(x), String(y)] }]
}

export function buildSwipeCommands(
  platform: DevicePlatform,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  durationMs = 300
): DeviceCommand[] {
  return platform === 'android'
    ? [{ command: 'adb', args: ['shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(durationMs)] }]
    : [{ command: 'idb', args: ['ui', 'swipe', String(x1), String(y1), String(x2), String(y2), '--duration', String(durationMs)] }]
}

export function buildOpenUrlCommands(platform: DevicePlatform, url: string): DeviceCommand[] {
  return platform === 'android'
    ? [{ command: 'adb', args: ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url] }]
    : [{ command: 'xcrun', args: ['simctl', 'openurl', 'booted', url] }]
}

export function buildLogsCommands(platform: DevicePlatform, limit = 200): DeviceCommand[] {
  if (platform === 'android') {
    return [{ command: 'adb', args: ['logcat', '-d', '-t', String(limit)] }]
  }
  // iOS `log show` has no line-count flag; map the requested line count to a
  // rolling window (200 lines ≈ 2 minutes of default system log volume).
  const minutes = Math.max(1, Math.ceil(limit / 100))
  return [{ command: 'xcrun', args: ['simctl', 'spawn', 'booted', 'log', 'show', '--last', `${minutes}m`, '--style', 'compact'] }]
}

export function buildListAvdsCommands(): DeviceCommand[] {
  return [{ command: 'emulator', args: ['-list-avds'] }]
}

/**
 * Enable/disable the platform screen reader. Android drives TalkBack through
 * the secure-settings accessibility switch; iOS flips the VoiceOver preference
 * in the simulator's Accessibility domain (takes effect on the next boot).
 */
export function buildSetAccessibilityCommands(platform: DevicePlatform, enabled: boolean): DeviceCommand[] {
  if (platform === 'android') {
    return enabled
      ? [
          {
            command: 'adb',
            args: ['shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService'],
          },
          { command: 'adb', args: ['shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1'] },
        ]
      : [
          { command: 'adb', args: ['shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'null'] },
          { command: 'adb', args: ['shell', 'settings', 'put', 'secure', 'accessibility_enabled', '0'] },
        ]
  }
  return [
    {
      command: 'xcrun',
      args: ['simctl', 'spawn', 'booted', 'defaults', 'write', 'com.apple.Accessibility', 'VoiceOverTouchEnabled', '-bool', enabled ? 'YES' : 'NO'],
    },
  ]
}

/**
 * Dump the current accessibility tree. Android uses `uiautomator dump` (the
 * XML TalkBack navigates, with content-desc/text/bounds); iOS uses `idb ui
 * describe-all` when idb is installed.
 */
export function buildReadAccessibilityTreeCommands(platform: DevicePlatform): DeviceCommand[] {
  return platform === 'android'
    ? [
        { command: 'adb', args: ['shell', 'uiautomator', 'dump', '/sdcard/vectalon-ui.xml'] },
        { command: 'adb', args: ['shell', 'cat', '/sdcard/vectalon-ui.xml'] },
        { command: 'adb', args: ['shell', 'rm', '-f', '/sdcard/vectalon-ui.xml'] },
      ]
    : [{ command: 'idb', args: ['ui', 'describe-all'] }]
}

/**
 * Read recent screen-reader announcements. Android TalkBack announcements are
 * logged under the TalkBack / Accessibility tags; iOS VoiceOver announcements
 * flow through the Accessibility subsystem log.
 */
export function buildReadAnnouncementsCommands(platform: DevicePlatform, limit = 100): DeviceCommand[] {
  if (platform === 'android') {
    return [{ command: 'adb', args: ['logcat', '-d', '-t', String(Math.max(1, Math.round(limit))), '-s', 'TalkBack', 'Accessibility'] }]
  }
  const minutes = Math.max(1, Math.ceil(limit / 100))
  return [
    {
      command: 'xcrun',
      args: ['simctl', 'spawn', 'booted', 'log', 'show', '--last', `${minutes}m`, '--predicate', 'subsystem CONTAINS "com.apple.Accessibility" OR eventMessage CONTAINS[c] "VoiceOver"', '--style', 'compact'],
    },
  ]
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class DeviceController {
  readonly platform: DevicePlatform
  private readonly dryRun: boolean
  private readonly root: string

  constructor(root: string, options: DeviceControllerOptions = {}) {
    this.root = root
    this.dryRun = options.dryRun === true
    this.platform = options.platform || detectDevicePlatform(root)
  }

  private describe(cmd: DeviceCommand): string {
    return `${cmd.command} ${cmd.args.join(' ')}`.trim()
  }

  private async execute(cmds: DeviceCommand[]): Promise<DeviceActionResult> {
    const description = cmds.map(c => this.describe(c)).join(' && ')
    if (this.dryRun) {
      return {
        success: true,
        stdout: `[dry-run] ${description}`,
        stderr: '',
        exitCode: 0,
        command: description,
      }
    }

    let last: { success: boolean; stdout: string; stderr: string; exitCode: number } | null = null
    let stdout = ''
    let stderr = ''
    for (const cmd of cmds) {
      last = await runCommand(cmd.command, cmd.args, { cwd: this.root, timeout: 120000 })
      stdout += last.stdout ? `${last.stdout}\n` : ''
      stderr += last.stderr ? `${last.stderr}\n` : ''
      if (!last.success) {
        return {
          success: false,
          stdout: stdout.trim(),
          stderr: stderr.trim() || `Command failed: ${this.describe(cmd)}`,
          exitCode: last.exitCode,
          command: description,
        }
      }
    }
    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: last?.exitCode ?? 0,
      command: description,
    }
  }

  async listDevices(): Promise<DeviceActionResult> {
    return this.execute(buildListDevicesCommands(this.platform))
  }

  async listAvds(): Promise<DeviceActionResult> {
    return this.execute(buildListAvdsCommands())
  }

  async boot(device?: string): Promise<DeviceActionResult> {
    // The Android emulator process never exits while running, so launching it
    // through runCommand would always hit the timeout. Launch it detached and
    // poll `adb` until the boot completes instead.
    if (this.platform === 'android' && !this.dryRun) {
      const name = device || DEFAULT_ANDROID_AVD
      const launch = buildBootCommands('android', name)[0]
      try {
        spawn(launch.command, launch.args, { cwd: this.root, detached: true, stdio: 'ignore' }).unref()
      } catch (err) {
        return {
          success: false,
          stdout: '',
          stderr: `Failed to launch emulator: ${err instanceof Error ? err.message : String(err)}`,
          exitCode: 1,
          command: `${launch.command} ${launch.args.join(' ')}`,
        }
      }
      const deadline = Date.now() + 120000
      while (Date.now() < deadline) {
        const probe = await runCommand('adb', ['shell', 'getprop', 'sys.boot_completed'], { cwd: this.root, timeout: 15000 })
        if (probe.success && probe.stdout.trim() === '1') {
          return {
            success: true,
            stdout: `Emulator ${name} booted`,
            stderr: '',
            exitCode: 0,
            command: `${launch.command} ${launch.args.join(' ')} (detached) + adb wait-for-boot`,
          }
        }
        await new Promise(r => setTimeout(r, 3000))
      }
      return {
        success: false,
        stdout: '',
        stderr: `Timed out waiting for emulator ${name} to finish booting (adb sys.boot_completed)`,
        exitCode: 1,
        command: `${launch.command} ${launch.args.join(' ')} (detached) + adb wait-for-boot`,
      }
    }
    return this.execute(buildBootCommands(this.platform, device))
  }

  async shutdown(device?: string): Promise<DeviceActionResult> {
    return this.execute(buildShutdownCommands(this.platform, device))
  }

  /** Default screenshot path lives under .vectalon/artifacts/screenshots/. */
  defaultScreenshotPath(): string {
    const dir = join(this.root, '.vectalon', 'artifacts', 'screenshots')
    // Only create the directory when we will actually write a file.
    if (!this.dryRun) mkdirSync(dir, { recursive: true })
    return join(dir, `device-${this.platform}-${Date.now()}.png`)
  }

  async screenshot(outputPath?: string): Promise<DeviceActionResult> {
    const path = outputPath || this.defaultScreenshotPath()
    return this.execute(buildScreenshotCommands(this.platform, path))
  }

  async tap(x: number, y: number): Promise<DeviceActionResult> {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { success: false, stdout: '', stderr: 'tap requires numeric x and y', exitCode: 1, command: 'tap (invalid: requires numeric x and y)' }
    }
    return this.execute(buildTapCommands(this.platform, Math.round(x), Math.round(y)))
  }

  async swipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    durationMs?: number
  ): Promise<DeviceActionResult> {
    const nums = [x1, y1, x2, y2, durationMs ?? 300]
    if (nums.some(n => !Number.isFinite(n))) {
      return { success: false, stdout: '', stderr: 'swipe requires numeric coordinates and duration', exitCode: 1, command: 'swipe (invalid: requires numeric coordinates and duration)' }
    }
    const [a, b, c, d, dur] = nums as number[]
    return this.execute(buildSwipeCommands(this.platform, a, b, c, d, Math.round(dur)))
  }

  async openUrl(url: string): Promise<DeviceActionResult> {
    if (!url) {
      return { success: false, stdout: '', stderr: 'openUrl requires a url', exitCode: 1, command: 'openUrl (invalid: requires a url)' }
    }
    return this.execute(buildOpenUrlCommands(this.platform, url))
  }

  async logs(limit?: number): Promise<DeviceActionResult> {
    const n = typeof limit === 'number' && limit > 0 ? Math.min(Math.round(limit), 2000) : 200
    return this.execute(buildLogsCommands(this.platform, n))
  }

  async setVoiceOver(enabled: boolean): Promise<DeviceActionResult> {
    return this.execute(buildSetAccessibilityCommands(this.platform, enabled))
  }

  async accessibilityTree(): Promise<DeviceActionResult> {
    return this.execute(buildReadAccessibilityTreeCommands(this.platform))
  }

  async announcements(limit?: number): Promise<DeviceActionResult> {
    const n = typeof limit === 'number' && limit > 0 ? Math.min(Math.round(limit), 2000) : 100
    return this.execute(buildReadAnnouncementsCommands(this.platform, n))
  }
}
