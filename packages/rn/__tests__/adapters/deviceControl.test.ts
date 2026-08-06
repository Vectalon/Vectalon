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
  buildSetAccessibilityCommands,
  buildReadAccessibilityTreeCommands,
  buildReadAnnouncementsCommands,
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

  it('enables/disables TalkBack on Android via secure settings', () => {
    const on = buildSetAccessibilityCommands('android', true)
    expect(on.map(c => c.command)).toEqual(['adb', 'adb'])
    expect(on[0].args).toContain('enabled_accessibility_services')
    expect(on[0].args.join(' ')).toContain('TalkBackService')
    expect(on[1].args).toContain('accessibility_enabled')
    expect(on[1].args).toContain('1')

    const off = buildSetAccessibilityCommands('android', false)
    expect(off[0].args).toContain('null')
    expect(off[1].args).toContain('0')
  })

  it('flips the VoiceOver preference on iOS via simctl defaults', () => {
    const on = buildSetAccessibilityCommands('ios', true)
    expect(on[0].args).toEqual(['simctl', 'spawn', 'booted', 'defaults', 'write', 'com.apple.Accessibility', 'VoiceOverTouchEnabled', '-bool', 'YES'])
    expect(buildSetAccessibilityCommands('ios', false)[0].args).toContain('NO')
  })

  it('builds accessibility-tree reads (uiautomator dump vs idb describe-all)', () => {
    const android = buildReadAccessibilityTreeCommands('android')
    expect(android.map(c => c.args[1])).toEqual(['uiautomator', 'cat', 'rm'])
    expect(android[1].args).toContain('/sdcard/vectalon-ui.xml')
    expect(buildReadAccessibilityTreeCommands('ios').map(c => c.args)).toEqual([['ui', 'describe-all']])
  })

  it('builds screen-reader announcement reads (logcat tags vs Accessibility log)', () => {
    expect(buildReadAnnouncementsCommands('android', 50).map(c => c.args)).toEqual([['logcat', '-d', '-t', '50', '-s', 'TalkBack', 'Accessibility']])
    const ios = buildReadAnnouncementsCommands('ios')[0]
    expect(ios.args[0]).toBe('simctl')
    expect(ios.args.join(' ')).toContain('com.apple.Accessibility')
    expect(ios.args.join(' ')).toContain('VoiceOver')
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

  it('dry-run describes accessibility commands without executing them', async () => {
    const dir = createTempProject({ 'package.json': '{}' })
    try {
      const controller = new DeviceController(dir, { dryRun: true, platform: 'android' })
      const voice = await controller.setVoiceOver(true)
      expect(voice.success).toBe(true)
      expect(voice.stdout).toContain('[dry-run] adb shell settings put secure enabled_accessibility_services')

      const tree = await controller.accessibilityTree()
      expect(tree.stdout).toContain('[dry-run] adb shell uiautomator dump')

      const ann = await controller.announcements(50)
      expect(ann.stdout).toContain('[dry-run] adb logcat -d -t 50 -s TalkBack Accessibility')

      const ios = new DeviceController(dir, { dryRun: true, platform: 'ios' })
      expect((await ios.setVoiceOver(false)).stdout).toContain('VoiceOverTouchEnabled -bool NO')
      expect((await ios.accessibilityTree()).stdout).toContain('[dry-run] idb ui describe-all')
    } finally {
      cleanup(dir)
    }
  })
})
