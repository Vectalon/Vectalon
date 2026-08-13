import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PNG } from 'pngjs'
import { ReferenceStore, visualBaselineDir } from '../../src/utils/referenceStore'
import { runVisualCi, deriveScreenKeys } from '../../src/visualCi/runner'
import type { CaptureDriver } from '../../src/visualCi/runner'
import type { DeviceActionResult, DevicePlatform } from '../../src/adapters/deviceControl'
import type { VisualDiffOptions } from '../../src/utils/visualDiff'

function solidImage(width: number, height: number, rgb: [number, number, number]): PNG {
  const png = new PNG({ width, height })
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgb[0]
    png.data[i * 4 + 1] = rgb[1]
    png.data[i * 4 + 2] = rgb[2]
    png.data[i * 4 + 3] = 255
  }
  return png
}

function paintBlock(png: PNG, bx: number, by: number, bw: number, bh: number, rgb: [number, number, number]): void {
  for (let y = by; y < Math.min(by + bh, png.height); y++) {
    for (let x = bx; x < Math.min(bx + bw, png.width); x++) {
      const i = (y * png.width + x) * 4
      png.data[i] = rgb[0]
      png.data[i + 1] = rgb[1]
      png.data[i + 2] = rgb[2]
    }
  }
}

/** Same size as the baseline, solid dark. */
function makeShot(kind: string): PNG {
  switch (kind) {
    case 'different':
      return solidImage(100, 100, [240, 240, 240]) // 100% diff → visual-drift error
    case 'slightly-different': {
      const png = solidImage(100, 100, [50, 60, 70])
      paintBlock(png, 20, 20, 25, 25, [255, 0, 0]) // 6.25% diff → warning, not error
      return png
    }
    case 'bigger':
      return solidImage(120, 100, [50, 60, 70]) // dimension mismatch
    default:
      return solidImage(100, 100, [50, 60, 70])
  }
}

type ShotKind = 'same' | 'different' | 'slightly-different' | 'bigger' | 'missing'

/** Deterministic device double: serves canned screenshots per call. */
class FakeDevice implements CaptureDriver {
  platform: DevicePlatform = 'ios'
  shots: ShotKind[] = []
  private shotIdx = 0
  bootResult = true
  openUrlResult = true
  booted: string | null = 'iPhone 15'
  screenshotCalls = 0
  openUrlCalls = 0

  private ok(stdout: string): DeviceActionResult {
    return { success: true, stdout, stderr: '', exitCode: 0, command: 'fake' }
  }

  async listDevices(): Promise<DeviceActionResult> {
    return this.ok(this.booted ? this.booted : '')
  }

  async boot(): Promise<DeviceActionResult> {
    if (!this.bootResult) {
      return { success: false, stdout: '', stderr: 'simulator boot failed', exitCode: 1, command: 'fake boot' }
    }
    this.booted = 'iPhone 15'
    return this.ok('booted iPhone 15')
  }

  async openUrl(): Promise<DeviceActionResult> {
    this.openUrlCalls++
    if (!this.openUrlResult) {
      return { success: false, stdout: '', stderr: 'openurl failed', exitCode: 1, command: 'fake openurl' }
    }
    return this.ok('opened')
  }

  async screenshot(path: string): Promise<DeviceActionResult> {
    this.screenshotCalls++
    const kind = this.shots[this.shotIdx++] ?? 'same'
    if (kind === 'missing') {
      return { success: false, stdout: '', stderr: 'screenshot failed', exitCode: 1, command: 'fake screenshot' }
    }
    writeFileSync(path, PNG.sync.write(makeShot(kind)))
    return this.ok(`saved ${path}`)
  }

  defaultScreenshotPath(): string {
    return join(tmpdir(), `fake-${Date.now()}.png`)
  }
}

interface Project {
  root: string
  store: ReferenceStore
  device: FakeDevice
  outDir: string
}

function makeProject(
  shots: ShotKind[],
  opts: { baseline?: boolean; quarantine?: boolean; tolerance?: Partial<VisualDiffOptions> } = {}
): Project {
  const root = mkdtempSync(join(tmpdir(), 'vectalon-vci-'))
  const store = new ReferenceStore(root, { dir: visualBaselineDir(root) })
  if (opts.baseline) {
    const baselinePath = join(root, 'baseline.png')
    writeFileSync(baselinePath, PNG.sync.write(solidImage(100, 100, [50, 60, 70])))
    store.save('login-screen', baselinePath, {
      platform: 'ios',
      source: 'test baseline',
      capturedAt: 1,
      quarantine: opts.quarantine ? { reason: 'flaky carousel', since: 1 } : null,
      tolerance: opts.tolerance,
    })
  }
  const device = new FakeDevice()
  device.shots = shots
  return { root, store, device, outDir: join(root, '.vectalon', 'visual-ci') }
}

function run(project: Project, overrides: { verdict?: 'strict' | 'warn' | 'report'; attempts?: number; pr?: number } = {}) {
  return runVisualCi({
    root: project.root,
    store: project.store,
    device: project.device,
    changedFiles: [],
    screens: ['login-screen'],
    platform: 'ios',
    attempts: overrides.attempts,
    settleMs: 10,
    verdict: overrides.verdict,
    outDir: project.outDir,
    pr: overrides.pr,
    commenter: overrides.pr ? jest.fn(async () => undefined) : undefined,
  })
}

describe('visualCi runner', () => {
  let projects: Project[] = []

  afterEach(() => {
    for (const p of projects) rmSync(p.root, { recursive: true, force: true })
    projects = []
  })

  it('passes on the first attempt', async () => {
    const p = makeProject(['same'], { baseline: true })
    projects.push(p)
    const outcome = await run(p)
    expect(outcome.exitCode).toBe(0)
    expect(outcome.passed).toBe(true)
    expect(outcome.runs[0].verdict).toBe('pass')
    expect(outcome.runs[0].attempts).toHaveLength(1)
    expect(outcome.report).toContain('login-screen')
    expect(existsSync(join(p.outDir, 'report.md'))).toBe(true)
    expect(existsSync(join(p.outDir, 'outcome.json'))).toBe(true)
  })

  it('reports a flake when the screen passes on a later attempt (warn does not gate)', async () => {
    const p = makeProject(['different', 'same'], { baseline: true })
    projects.push(p)
    const outcome = await run(p)
    expect(outcome.runs[0].verdict).toBe('flake')
    expect(outcome.passed).toBe(true)
    expect(outcome.exitCode).toBe(0)
    expect(outcome.report).toContain('⚠️ flake')
  })

  it('fails on a consistent regression and renders a diff composite', async () => {
    const p = makeProject(['different', 'different', 'different'], { baseline: true })
    projects.push(p)
    const outcome = await run(p)
    expect(outcome.runs[0].verdict).toBe('fail')
    expect(outcome.passed).toBe(false)
    expect(outcome.exitCode).toBe(1)
    const composite = outcome.runs[0].composite
    expect(composite).toBeTruthy()
    expect(existsSync(composite!)).toBe(true)
  })

  it('classifies varying error rules as a flake, not a regression', async () => {
    const p = makeProject(['bigger', 'different'], { baseline: true })
    projects.push(p)
    const outcome = await run(p)
    expect(outcome.runs[0].verdict).toBe('flake')
    expect(outcome.passed).toBe(true)
  })

  it('marks screens unverified when the device cannot boot (exit 2, never exit 1)', async () => {
    const p = makeProject([], { baseline: true })
    p.device.booted = null
    p.device.bootResult = false
    projects.push(p)
    const outcome = await run(p)
    expect(outcome.runs[0].verdict).toBe('unverified')
    expect(outcome.exitCode).toBe(2)
  })

  it('proposes a pending baseline for a screen with no baseline (never gates)', async () => {
    const p = makeProject(['same'])
    projects.push(p)
    const outcome = await run(p)
    expect(outcome.runs[0].verdict).toBe('no-baseline')
    expect(outcome.passed).toBe(true)
    expect(outcome.exitCode).toBe(0)
    expect(existsSync(join(p.outDir, 'pending', 'login-screen-ios.png'))).toBe(true)
    expect(outcome.comment).toContain('visual-baseline --capture')
  })

  it('never gates a quarantined screen even when the diff fails', async () => {
    const p = makeProject(['different'], { baseline: true, quarantine: true })
    projects.push(p)
    const outcome = await run(p)
    expect(outcome.runs[0].verdict).toBe('quarantined')
    expect(outcome.passed).toBe(true)
    expect(outcome.exitCode).toBe(0)
    expect(outcome.report).toContain('flaky carousel')
  })

  it('honors per-key tolerance overrides from the manifest', async () => {
    // 6.25% drift is warning-level: reported as a finding without the override,
    // gone entirely with a higher per-key driftThreshold.
    const without = makeProject(['slightly-different'], { baseline: true })
    projects.push(without)
    const reported = await run(without)
    expect(reported.runs[0].verdict).toBe('pass')
    expect(reported.runs[0].diff?.findings.some(f => f.rule === 'visual-drift')).toBe(true)

    const lenient = makeProject(['slightly-different'], { baseline: true, tolerance: { driftThreshold: 0.1 } })
    projects.push(lenient)
    const outcome = await run(lenient)
    expect(outcome.runs[0].verdict).toBe('pass')
    expect(outcome.exitCode).toBe(0)
    expect(outcome.runs[0].diff?.findings.filter(f => f.rule === 'visual-drift')).toHaveLength(0)
  })

  it('gates flakes and unverified screens under the strict policy', async () => {
    const flaky = makeProject(['different', 'same'], { baseline: true })
    projects.push(flaky)
    expect((await run(flaky, { verdict: 'strict' })).exitCode).toBe(1)

    const noDevice = makeProject([], { baseline: true })
    noDevice.device.booted = null
    noDevice.device.bootResult = false
    projects.push(noDevice)
    expect((await run(noDevice, { verdict: 'strict' })).exitCode).toBe(1)
  })

  it('never gates under the report policy', async () => {
    const p = makeProject(['different', 'different', 'different'], { baseline: true })
    projects.push(p)
    const outcome = await run(p, { verdict: 'report' })
    expect(outcome.runs[0].verdict).toBe('fail')
    expect(outcome.passed).toBe(true)
    expect(outcome.exitCode).toBe(0)
  })

  it('with no screens, passes and reports nothing to verify', async () => {
    const p = makeProject([])
    projects.push(p)
    const outcome = await runVisualCi({
      root: p.root,
      store: p.store,
      device: p.device,
      changedFiles: [],
      screens: [],
      platform: 'ios',
      outDir: p.outDir,
    })
    expect(outcome.runs).toHaveLength(0)
    expect(outcome.passed).toBe(true)
    expect(outcome.exitCode).toBe(0)
    expect(outcome.report).toContain('nothing to verify')
  })

  it('posts the PR comment when a commenter is wired', async () => {
    const p = makeProject(['same'], { baseline: true })
    projects.push(p)
    const commenter = jest.fn(async (_pr: number, _body: string) => undefined)
    await runVisualCi({
      root: p.root,
      store: p.store,
      device: p.device,
      changedFiles: [],
      screens: ['login-screen'],
      platform: 'ios',
      outDir: p.outDir,
      pr: 42,
      commenter,
    })
    expect(commenter).toHaveBeenCalledTimes(1)
    const [prNumber, body] = commenter.mock.calls[0]
    expect(prNumber).toBe(42)
    expect(body).toContain('vectalon-visual-ci')
    expect(body).toContain('login-screen')
  })

  it('a failed comment never changes the outcome', async () => {
    const p = makeProject(['same'], { baseline: true })
    projects.push(p)
    const commenter = jest.fn(async (_pr: number, _body: string) => {
      throw new Error('fork token is read-only')
    })
    const outcome = await runVisualCi({
      root: p.root,
      store: p.store,
      device: p.device,
      changedFiles: [],
      screens: ['login-screen'],
      platform: 'ios',
      outDir: p.outDir,
      pr: 7,
      commenter,
    })
    expect(outcome.exitCode).toBe(0)
  })
})

describe('deriveScreenKeys', () => {
  it('maps affected screens to store keys', () => {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-vci-impact-'))
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { 'react-native': '0.76.0' } })
      )
      const compDir = join(root, 'src', 'components')
      const srcDir = join(root, 'src', 'screens')
      mkdirSync(compDir, { recursive: true })
      mkdirSync(srcDir, { recursive: true })
      writeFileSync(join(compDir, 'Button.tsx'), 'export default function Button() { return null }\n')
      writeFileSync(
        join(srcDir, 'DashboardScreen.tsx'),
        'import Button from \'../components/Button\'\nexport default function DashboardScreen() { return <Button /> }\n'
      )
      // The impact analysis flags consumers of changed files — a screen that
      // renders the changed component lands in the affected-screen set.
      const keys = deriveScreenKeys(root, ['src/components/Button.tsx'])
      expect(keys).toContain('dashboard-screen')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns [] for no changed files and never throws', () => {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-vci-impact2-'))
    try {
      expect(deriveScreenKeys(root, [])).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
