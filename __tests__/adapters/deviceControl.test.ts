import { join } from 'path'
import {
  DeviceController,
  buildBootCommands,
  buildScreenshotCommands,
  buildTapCommands,
  buildSwipeCommands,
  buildOpenUrlCommands,
  buildLogsCommands,
  buildListDevicesCommands,
  detectDevicePlatform,
} from '../../src/adapters/deviceControl'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('deviceControl command builders', () => {
  it('builds iOS boot commands via xcrun simctl', () => {
    const cmds = buildBootCommands('ios', 'iPhone 16')
    expect(cmds[0].command).toBe('xcrun')
    expect(cmds[0].args).toEqual(['simctl', 'boot', 'iPhone 16'])
    expect(cmds[1].args).toContain('bootstatus')
  })

  it('builds Android boot commands via emulator -avd with a default AVD', () => {
    const cmds = buildBootCommands('android')
    expect(cmds[0].command).toBe('emulator')
    expect(cmds[0].args).toContain('Pixel_7')
  })

  it('builds iOS screenshot via simctl io', () => {
    const cmds = buildScreenshotCommands('ios', '/tmp/shot.png')
    expect(cmds[0].args).toEqual(['simctl', 'io', 'booted', 'screenshot', '/tmp/shot.png'])
  })

  it('builds Android screenshot as screencap + pull + cleanup', () => {
    const cmds = buildScreenshotCommands('android', '/tmp/shot.png')
    expect(cmds).toHaveLength(3)
    expect(cmds[0].args).toContain('screencap')
    expect(cmds[1].args).toEqual(['pull', '/sdcard/vectalon-screenshot.png', '/tmp/shot.png'])
    expect(cmds[2].args).toContain('rm')
  })

  it('builds tap/swipe via adb input for Android and idb for iOS', () => {
    expect(buildTapCommands('android', 100, 200).map(c => c.args)).toEqual([['shell', 'input', 'tap', '100', '200']])
    expect(buildTapCommands('ios', 100, 200).map(c => c.args)).toEqual([['ui', 'tap', '100', '200']])
    expect(buildSwipeCommands('android', 0, 0, 100, 500, 400).map(c => c.args)).toEqual([['shell', 'input', 'swipe', '0', '0', '100', '500', '400']])
    expect(buildSwipeCommands('ios', 0, 0, 100, 500).map(c => c.args)).toEqual([['ui', 'swipe', '0', '0', '100', '500', '--duration', '300']])
  })

  it('builds deep-link commands for both platforms', () => {
    expect(buildOpenUrlCommands('android', 'myapp://login').map(c => c.args)).toEqual([['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'myapp://login']])
    expect(buildOpenUrlCommands('ios', 'myapp://login').map(c => c.args)).toEqual([['simctl', 'openurl', 'booted', 'myapp://login']])
  })

  it('builds log commands (logcat -d -t vs simctl log show)', () => {
    expect(buildLogsCommands('android', 100).map(c => c.args)).toEqual([['logcat', '-d', '-t', '100']])
    expect(buildLogsCommands('ios')[0].args).toEqual(['simctl', 'spawn', 'booted', 'log', 'show', '--last', '2m', '--style', 'compact'])
    // iOS maps the requested line count to a rolling log window (200 lines ≈ 2m).
    expect(buildLogsCommands('ios', 50).map(c => c.args)).toEqual([['simctl', 'spawn', 'booted', 'log', 'show', '--last', '1m', '--style', 'compact']])
  })

  it('builds device listing commands', () => {
    expect(buildListDevicesCommands('android').map(c => c.args)).toEqual([['devices']])
    expect(buildListDevicesCommands('ios').map(c => c.args)).toEqual([['simctl', 'list', 'devices', 'booted']])
  })
})

describe('DeviceController', () => {
  it('detects the platform from the project layout (android/ present → android)', () => {
    const dir = createTempProject({ 'android/build.gradle': 'x', 'package.json': '{}' })
    try {
      expect(detectDevicePlatform(dir)).toBe('android')
    } finally {
      cleanup(dir)
    }
  })

  it('defaults to ios without an android/ directory', () => {
    const dir = createTempProject({ 'package.json': '{}' })
    try {
      expect(detectDevicePlatform(dir)).toBe('ios')
    } finally {
      cleanup(dir)
    }
  })

  it('dry-run never executes — describes the intended command', async () => {
    const dir = createTempProject({ 'package.json': '{}' })
    try {
      const controller = new DeviceController(dir, { dryRun: true, platform: 'ios' })
      const boot = await controller.boot()
      expect(boot.success).toBe(true)
      expect(boot.stdout).toContain('[dry-run] xcrun simctl boot')

      const tap = await controller.tap(10, 20)
      expect(tap.stdout).toContain('idb ui tap 10 20')

      const url = await controller.openUrl('myapp://home')
      expect(url.stdout).toContain('xcrun simctl openurl booted myapp://home')
    } finally {
      cleanup(dir)
    }
  })

  it('rejects non-numeric tap/swipe coordinates with a descriptive command', async () => {
    const dir = createTempProject({ 'package.json': '{}' })
    try {
      const controller = new DeviceController(dir, { dryRun: true, platform: 'ios' })
      const tap = await controller.tap(Number('abc'), 5)
      expect(tap.success).toBe(false)
      expect(tap.stderr).toContain('numeric')
      expect(tap.command).not.toBe('')
      expect(tap.command).toContain('tap')

      const swipe = await controller.swipe(0, 0, 100, Number('abc'))
      expect(swipe.success).toBe(false)
      expect(swipe.command).not.toBe('')
    } finally {
      cleanup(dir)
    }
  })

  it('rejects an empty deep link', async () => {
    const dir = createTempProject({ 'package.json': '{}' })
    try {
      const controller = new DeviceController(dir, { dryRun: true, platform: 'android' })
      const result = await controller.openUrl('')
      expect(result.success).toBe(false)
    } finally {
      cleanup(dir)
    }
  })

  it('default screenshot path lives under .vectalon/artifacts/screenshots', async () => {
    const dir = createTempProject({ 'package.json': '{}' })
    try {
      const controller = new DeviceController(dir, { dryRun: true, platform: 'android' })
      const path = controller.defaultScreenshotPath()
      expect(path.startsWith(join(dir, '.vectalon', 'artifacts', 'screenshots'))).toBe(true)
      expect(path.endsWith('.png')).toBe(true)
    } finally {
      cleanup(dir)
    }
  })
})
