import { existsSync } from 'fs'
import { ToolRegistry } from './base'
import { mcpTool } from './decorators'
import { DeviceController, detectDevicePlatform, type DevicePlatform } from '../../adapters/deviceControl'
import type { DeviceActionResult } from '../../adapters/deviceControl'
import { ReferenceStore, isValidReferenceKey } from '../../utils/referenceStore'
import { diffImages, formatVisualDiffResult } from '../../utils/visualDiff'

/**
 * Ecosystem tools — simulator/emulator device control. Real commands only when
 * the server was constructed with `deviceControlLive`; every other surface gets
 * a deterministic dry-run description.
 */
export class EcosystemTools extends ToolRegistry {
  @mcpTool('device_boot', 'Boot a simulator/emulator (xcrun simctl boot / emulator -avd). Pass platform and optional device/AVD name', {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['ios', 'android'] },
      device: { type: 'string' },
    },
  })
  async deviceBoot(args: Record<string, unknown>): Promise<string> {
    const result = await this.deviceControllerFor(args).boot(args.device as string | undefined)
    return this.formatDeviceResult(result)
  }

  @mcpTool('device_screenshot', 'Capture a screenshot of the booted device to .vectalon/artifacts/screenshots/ (or a given path)', {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['ios', 'android'] },
      path: { type: 'string' },
    },
  })
  async deviceScreenshot(args: Record<string, unknown>): Promise<string> {
    const result = await this.deviceControllerFor(args).screenshot(args.path as string | undefined)
    return this.formatDeviceResult(result)
  }

  @mcpTool('device_tap', 'Tap at screen coordinates on the booted device', {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['ios', 'android'] },
      x: { type: 'number' },
      y: { type: 'number' },
    },
    required: ['x', 'y'],
  })
  async deviceTap(args: Record<string, unknown>): Promise<string> {
    const result = await this.deviceControllerFor(args).tap(Number(args.x), Number(args.y))
    return this.formatDeviceResult(result)
  }

  @mcpTool('device_swipe', 'Swipe from (x1, y1) to (x2, y2) on the booted device, optional duration in ms', {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['ios', 'android'] },
      x1: { type: 'number' },
      y1: { type: 'number' },
      x2: { type: 'number' },
      y2: { type: 'number' },
      duration: { type: 'number' },
    },
    required: ['x1', 'y1', 'x2', 'y2'],
  })
  async deviceSwipe(args: Record<string, unknown>): Promise<string> {
    const result = await this.deviceControllerFor(args).swipe(
      Number(args.x1),
      Number(args.y1),
      Number(args.x2),
      Number(args.y2),
      args.duration === undefined ? undefined : Number(args.duration)
    )
    return this.formatDeviceResult(result)
  }

  @mcpTool('device_open_url', 'Open a deep link on the booted device (simctl openurl / adb am start VIEW)', {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['ios', 'android'] },
      url: { type: 'string' },
    },
    required: ['url'],
  })
  async deviceOpenUrl(args: Record<string, unknown>): Promise<string> {
    const result = await this.deviceControllerFor(args).openUrl((args.url as string) || '')
    return this.formatDeviceResult(result)
  }

  @mcpTool('device_logs', 'Read recent device logs (simctl log show / adb logcat), optional line limit', {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['ios', 'android'] },
      limit: { type: 'number' },
    },
  })
  async deviceLogs(args: Record<string, unknown>): Promise<string> {
    const result = await this.deviceControllerFor(args).logs(args.limit === undefined ? undefined : Number(args.limit))
    return this.formatDeviceResult(result)
  }

  @mcpTool('device_set_voiceover', 'Enable or disable the screen reader on the booted device (Android: TalkBack via secure settings; iOS: VoiceOver preference, effective on next boot)', {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['ios', 'android'] },
      enabled: { type: 'boolean' },
    },
    required: ['enabled'],
  })
  async deviceSetVoiceOver(args: Record<string, unknown>): Promise<string> {
    const result = await this.deviceControllerFor(args).setVoiceOver(args.enabled === true)
    const platform = this.deviceControllerFor(args).platform
    // iOS VoiceOver is a persisted preference — tell the caller it needs a
    // simulator restart to take effect, so announcement reads aren't confusing.
    const restartNote =
      result.success && platform === 'ios'
        ? '\n\n_Note: the VoiceOver preference is persisted — restart the simulator (`device_boot` or `xcrun simctl shutdown` + `boot`) for it to take effect._'
        : ''
    return `${this.formatDeviceResult(result)}${restartNote}`
  }

  @mcpTool('device_accessibility_tree', 'Dump the current accessibility tree of the booted device (Android: uiautomator dump XML; iOS: idb ui describe-all) — the view hierarchy the screen reader navigates', {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['ios', 'android'] },
    },
  })
  async deviceAccessibilityTree(args: Record<string, unknown>): Promise<string> {
    const result = await this.deviceControllerFor(args).accessibilityTree()
    return this.formatDeviceResult(result)
  }

  @mcpTool('device_announcements', 'Read recent screen-reader announcements (Android: logcat TalkBack/Accessibility tags; iOS: Accessibility subsystem log) to verify what VoiceOver/TalkBack spoke', {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['ios', 'android'] },
      limit: { type: 'number' },
    },
  })
  async deviceAnnouncements(args: Record<string, unknown>): Promise<string> {
    const result = await this.deviceControllerFor(args).announcements(args.limit === undefined ? undefined : Number(args.limit))
    return this.formatDeviceResult(result)
  }

  @mcpTool('visual_capture_reference', 'Store a screenshot (or an existing PNG via `path`) as the visual reference for a screen `key` — the baseline the visual verification loop diffs against. Live device capture requires deviceControlLive; pass `path` to import an exported Figma frame or known-good screenshot without a device.', {
    type: 'object',
    properties: {
      key: { type: 'string' },
      platform: { type: 'string', enum: ['ios', 'android'] },
      path: { type: 'string' },
    },
    required: ['key'],
  })
  async visualCaptureReference(args: Record<string, unknown>): Promise<string> {
    const key = String(args.key || '')
    if (!isValidReferenceKey(key)) {
      return '**Failed** — invalid reference key: use letters, digits, `-`, `_` or `.` (no path separators)'
    }
    const root = this.projectRoot()
    const platform = this.platformFor(args, root)
    const store = new ReferenceStore(root)
    const path = args.path as string | undefined
    if (path) {
      if (!existsSync(path)) return `**Failed** — reference image not found at \`${path}\``
      const entry = store.save(key, path, { platform, source: 'explicit path', capturedAt: Date.now() })
      return entry ? `**OK** — reference \`${key}\` stored to \`${entry.path}\`` : '**Failed** — could not store the reference'
    }
    if (!this.ctx.deviceControlLive) {
      return `[dry-run] would capture a screenshot on the ${platform} device and store it as reference \`${key}\` (start \`vectalon serve --device-control\` for live capture, or pass \`path\` to import an existing image)`
    }
    const controller = this.deviceControllerFor(args)
    const shotPath = controller.defaultScreenshotPath()
    const shot = await controller.screenshot(shotPath)
    if (!shot.success) return this.formatDeviceResult(shot)
    const entry = store.save(key, shotPath, { platform, source: 'device capture', capturedAt: Date.now() })
    return entry
      ? `**OK** — reference \`${key}\` captured from the device and stored to \`${entry.path}\``
      : '**Failed** — could not store the reference'
  }

  @mcpTool('visual_check', 'Capture a screenshot and diff it against a stored reference, reporting UI regressions (misaligned elements, missing safe-area insets, wrong colors) as annotated findings. Pass `path` + `reference` to diff two PNG files directly — deterministic and device-free.', {
    type: 'object',
    properties: {
      key: { type: 'string' },
      platform: { type: 'string', enum: ['ios', 'android'] },
      path: { type: 'string' },
      reference: { type: 'string' },
      diffThreshold: { type: 'number' },
    },
  })
  async visualCheck(args: Record<string, unknown>): Promise<string> {
    const root = this.projectRoot()
    const platform = this.platformFor(args, root)
    const store = new ReferenceStore(root)
    const referencePath = args.reference as string | undefined
    let candidatePath = args.path as string | undefined

    if (!candidatePath) {
      if (!this.ctx.deviceControlLive) {
        return '[dry-run] would capture a screenshot on the device and diff it against the stored reference (start `vectalon serve --device-control` for live capture, or pass `path` + `reference` to diff two files)'
      }
      const controller = this.deviceControllerFor(args)
      candidatePath = controller.defaultScreenshotPath()
      const shot = await controller.screenshot(candidatePath)
      if (!shot.success) return this.formatDeviceResult(shot)
    }
    if (!existsSync(candidatePath)) return `**Failed** — screenshot not found at \`${candidatePath}\``

    const key = args.key as string | undefined
    // An explicit key that does not exist is a misconfiguration — report it
    // instead of silently diffing against the newest reference for another
    // screen. The newest reference is only a fallback when no key was given.
    let resolvedReference = referencePath
    if (!resolvedReference) {
      resolvedReference = key ? store.get(key)?.path || undefined : store.latest(platform)?.path || undefined
    }
    if (!resolvedReference) {
      return `**No reference found** — no stored reference${key ? ` for \`${key}\`` : ''} to diff against. Capture one with \`visual_capture_reference\` or pass \`reference\`.`
    }
    const diff = diffImages(
      resolvedReference,
      candidatePath,
      args.diffThreshold !== undefined ? { driftThreshold: Number(args.diffThreshold) } : undefined
    )
    return formatVisualDiffResult(diff, {
      reference: resolvedReference,
      candidate: candidatePath,
      key: key || undefined,
    })
  }

  private projectRoot(): string {
    return this.ctx.engine.getSnapshot()?.project.root || process.cwd()
  }

  private platformFor(args: Record<string, unknown>, root: string): DevicePlatform {
    const platform = args.platform as DevicePlatform | undefined
    return platform === 'ios' || platform === 'android' ? platform : detectDevicePlatform(root)
  }

  private deviceControllerFor(args: Record<string, unknown>): DeviceController {
    const root = this.projectRoot()
    const platform = args.platform as DevicePlatform | undefined
    return new DeviceController(root, {
      // Live control only when the serve command opted in; every other surface
      // (tests, default `serve`) gets a deterministic dry-run description.
      dryRun: !this.ctx.deviceControlLive,
      platform: platform === 'ios' || platform === 'android' ? platform : undefined,
    })
  }

  private formatDeviceResult(result: DeviceActionResult): string {
    const fence = '```'
    const lines = [
      `**${result.success ? 'OK' : 'Failed'}**`,
      '',
      `${fence}bash`,
      result.command ? `$ ${result.command}` : '_no command — argument validation failed_',
      fence,
      '',
    ]
    if (result.stdout) lines.push(result.stdout.slice(0, 4000))
    if (result.stderr) lines.push(`\n**stderr**\n\n${fence}\n${result.stderr.slice(0, 2000)}\n${fence}`)
    return lines.join('\n')
  }
}
