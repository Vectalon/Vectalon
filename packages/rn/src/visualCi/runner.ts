/**
 * Visual CI runner — the deep core of `vectalon visual-ci`.
 *
 * One small interface (an options object) hides the whole PR-mode loop:
 * derive the affected screens from changed files, boot a device, deep-link,
 * capture with retries, diff against the committed baselines, classify each
 * screen, render the report + PR comment, and compute the gating exit code.
 *
 * Everything behind the interface is deterministic and injectable for tests:
 * the capture device is a `CaptureDriver` seam (DeviceController satisfies it
 * structurally; tests use a fake), the baseline store is the committed
 * `ReferenceStore` instance, and diffing is the existing in-process
 * `diffImages`. No model calls, no network (apart from the optional PR
 * comment sink), never throws past the top-level catch.
 *
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { analyzeCrossPackageImpact } from '../harness'
import { detectUrlScheme, buildDeepLink, kebabCase } from '../utils/deepLink'
import { diffImages } from '../utils/visualDiff'
import type { VisualDiffOptions, VisualDiffResult } from '../utils/visualDiff'
import { renderDiffComposite } from '../utils/visualDiffRender'
import type { ReferenceEntry, ReferenceStore } from '../utils/referenceStore'
import type { DeviceActionResult, DevicePlatform } from '../adapters/deviceControl'

/** PR comment marker so repeated runs upsert one comment instead of spamming. */
export const VISUAL_CI_COMMENT_MARKER = 'vectalon-visual-ci'

/** The capture seam: DeviceController satisfies this structurally. */
export interface CaptureDriver {
  readonly platform: DevicePlatform
  listDevices(): Promise<DeviceActionResult>
  boot(device?: string): Promise<DeviceActionResult>
  openUrl(url: string): Promise<DeviceActionResult>
  screenshot(outputPath?: string): Promise<DeviceActionResult>
  defaultScreenshotPath(): string
}

export type VerdictPolicy = 'strict' | 'warn' | 'report'

export type ScreenVerdict =
  | 'pass'
  | 'flake'
  | 'fail'
  | 'quarantined'
  | 'no-baseline'
  | 'unverified'

export interface ScreenAttempt {
  /** True when the capture + diff actually ran (no infra/decode failure). */
  ok: boolean
  /** True when the diff matched within tolerance (no error findings). */
  pass: boolean
  diff?: VisualDiffResult
  error?: string
  /** Absolute path of the captured screenshot for this attempt. */
  screenshot?: string
}

export interface ScreenRun {
  key: string
  verdict: ScreenVerdict
  attempts: ScreenAttempt[]
  /** Diff of the last attempt, when one ran. */
  diff?: VisualDiffResult
  /** Absolute path of the last captured screenshot. */
  screenshot?: string
  /** Absolute path of the rendered diff composite (fail/flake/quarantined). */
  composite?: string
  baseline: ReferenceEntry | null
}

export interface VisualCiOptions {
  root: string
  /** Committed baseline store (ReferenceStore with visualBaselineDir). */
  store: ReferenceStore
  device: CaptureDriver
  /** Changed files relative to root; drives screen derivation. */
  changedFiles: string[]
  /** Explicit screen keys; skips derivation. */
  screens?: string[]
  platform: DevicePlatform
  /** Capture attempts per screen (default 3). */
  attempts?: number
  /** Base settle wait before each capture in ms (default 2500, jittered). */
  settleMs?: number
  /** Gating policy (default 'warn'). */
  verdict?: VerdictPolicy
  /** Run output directory (artifacts land here). */
  outDir: string
  /** Optional PR comment sink; called with the marker-tagged body. */
  commenter?: (number: number, body: string) => Promise<void>
  pr?: number
}

export interface VisualCiOutcome {
  passed: boolean
  exitCode: 0 | 1 | 2
  runs: ScreenRun[]
  report: string
  comment: string
}

const DEFAULT_ATTEMPTS = 3
const DEFAULT_SETTLE_MS = 2500

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Jittered settle so animations land at slightly different phases per attempt. */
function jittered(base: number): number {
  return Math.round(base * (0.9 + Math.random() * 0.2))
}

/**
 * Derive screen keys from changed files via the cross-package impact
 * analysis (affected screens + re-render blast radius). Falls back to [] when
 * the analysis cannot run — an empty screen set is a valid "nothing to check".
 */
export function deriveScreenKeys(root: string, changedFiles: string[]): string[] {
  if (changedFiles.length === 0) return []
  try {
    const impact = analyzeCrossPackageImpact(root, changedFiles)
    const names = [...impact.affectedScreens, ...impact.reRenderScreens.map(r => r.screen)]
    const keys = new Set<string>()
    for (const name of names) {
      const key = kebabCase(name)
      if (key) keys.add(key)
    }
    return [...keys]
  } catch (err) {
    return []
  }
}

function mergeDiffOptions(baseline: ReferenceEntry | null): VisualDiffOptions {
  return baseline?.tolerance ? { ...baseline.tolerance } : {}
}

/**
 * One capture attempt: deep-link, settle, screenshot, diff. Returns the
 * attempt record; never throws.
 */
async function captureAttempt(
  device: CaptureDriver,
  deepLink: string | null,
  baselinePath: string | null,
  options: VisualDiffOptions,
  settleMs: number,
  shotPath: string
): Promise<ScreenAttempt> {
  try {
    if (deepLink) {
      const opened = await device.openUrl(deepLink)
      if (!opened.success) {
        return { ok: false, pass: false, error: `deep link failed: ${(opened.stderr || opened.stdout).slice(0, 200)}` }
      }
    }
    await sleep(jittered(settleMs))
    const shot = await device.screenshot(shotPath)
    if (!shot.success) {
      return { ok: false, pass: false, error: `screenshot failed: ${(shot.stderr || shot.stdout).slice(0, 200)}` }
    }
    const diff = baselinePath ? diffImages(baselinePath, shotPath, options) : null
    if (diff?.error) {
      return { ok: false, pass: false, error: diff.error, diff, screenshot: shotPath }
    }
    // Pass bar follows the diff engine's severity model: error findings block,
    // warning/info findings report (surfaced in the run) but never gate.
    const pass = diff ? !diff.findings.some(f => f.severity === 'error') : false
    return { ok: true, pass, diff: diff || undefined, screenshot: shotPath }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, pass: false, error: message }
  }
}

/** Error rules of an ok attempt, as a sortable signature. */
function errorRules(attempt: ScreenAttempt): string {
  const findings = attempt.diff?.findings.filter(f => f.severity === 'error') || []
  return findings
    .map(f => f.rule)
    .sort()
    .join(',')
}

/**
 * Classify a screen from its attempt history:
 * - any ok pass → 'pass' (first attempt) or 'flake' (needed retries);
 * - no pass, all ok attempts report the same error rules → 'fail' (consistent
 *   regression);
 * - no pass, varying error rules → 'flake' (timing noise);
 * - no ok attempts at all → 'unverified' (infra / decode).
 */
function classify(run: ScreenRun): void {
  if (run.baseline?.quarantine) {
    run.verdict = 'quarantined'
    return
  }
  if (!run.baseline) {
    run.verdict = 'no-baseline'
    return
  }
  const okAttempts = run.attempts.filter(a => a.ok)
  if (okAttempts.length === 0) {
    run.verdict = 'unverified'
    return
  }
  const passIndex = okAttempts.findIndex(a => a.pass)
  if (passIndex !== -1) {
    run.verdict = okAttempts.length > 1 || run.attempts.length > 1 ? 'flake' : 'pass'
    return
  }
  const first = errorRules(okAttempts[0])
  const consistent = first !== '' && okAttempts.every(a => errorRules(a) === first)
  run.verdict = consistent ? 'fail' : 'flake'
}

function gate(runs: ScreenRun[], policy: VerdictPolicy): { passed: boolean; exitCode: 0 | 1 | 2 } {
  if (policy === 'report') return { passed: true, exitCode: 0 }
  const gates = (v: ScreenVerdict): boolean =>
    v === 'fail' || (policy === 'strict' && (v === 'flake' || v === 'unverified'))
  if (runs.some(r => gates(r.verdict))) return { passed: false, exitCode: 1 }
  if (runs.length > 0 && runs.every(r => r.verdict === 'unverified')) {
    return { passed: false, exitCode: 2 }
  }
  return { passed: true, exitCode: 0 }
}

const VERDICT_LABEL: Record<ScreenVerdict, string> = {
  pass: '✅ pass',
  flake: '⚠️ flake',
  fail: '❌ fail',
  quarantined: '🚧 quarantined',
  'no-baseline': '🆕 no baseline',
  unverified: '— unverified',
}

function diffPct(run: ScreenRun): string {
  return run.diff ? `${(run.diff.diffRatio * 100).toFixed(1)}%` : '—'
}

/** First error finding (or first finding) message, truncated for tables. */
function runDetail(run: ScreenRun): string {
  const findings = run.diff?.findings || []
  if (findings.length === 0) {
    if (run.verdict === 'no-baseline') return 'approve with visual-baseline --capture'
    if (run.verdict === 'quarantined') return run.baseline?.quarantine?.reason || 'quarantined'
    if (run.verdict === 'unverified') return run.attempts[run.attempts.length - 1]?.error || 'no attempts ran'
    return 'no findings'
  }
  const first = findings[0]
  const detail = first.message.replace(/\n/g, ' ')
  return detail.length > 120 ? detail.slice(0, 120) + '…' : detail
}

export function renderVisualCiReport(outcome: Pick<VisualCiOutcome, 'runs'>, opts: { root: string; platform: DevicePlatform; base?: string }): string {
  const runs = outcome.runs
  const counts = runs.reduce(
    (acc, r) => {
      acc[r.verdict] = (acc[r.verdict] || 0) + 1
      return acc
    },
    {} as Partial<Record<ScreenVerdict, number>>
  )
  const lines = [
    '# Visual regression report',
    '',
    `Platform: ${opts.platform}${opts.base ? ` | Base: ${opts.base}` : ''} | Screens: ${runs.length}`,
    '',
    `Checked ${runs.length} screen(s): ${counts.pass || 0} passed, ${counts.fail || 0} failed, ${counts.flake || 0} flaky, ${counts['no-baseline'] || 0} without baseline, ${counts.quarantined || 0} quarantined, ${counts.unverified || 0} unverified.`,
    '',
  ]

  if (runs.length === 0) {
    lines.push('No screens are affected by the changed files — nothing to verify.')
    return lines.join('\n')
  }

  lines.push('| Screen | Verdict | Diff | Details |')
  lines.push('|---|---|---|---|')
  for (const run of runs) {
    lines.push(`| ${run.key} | ${VERDICT_LABEL[run.verdict]} | ${diffPct(run)} | ${runDetail(run)} |`)
  }
  lines.push('', '')

  for (const run of runs) {
    lines.push(`## ${run.key} — ${VERDICT_LABEL[run.verdict]}`)
    if (run.screenshot) {
      lines.push(`- Screenshot: \`${relative(opts.root, run.screenshot)}\``)
    }
    if (run.composite) {
      lines.push(`- Diff composite: \`${relative(opts.root, run.composite)}\``)
    }
    if (run.baseline) {
      lines.push(`- Baseline: \`${run.baseline.key}\` (${run.baseline.platform}, captured ${new Date(run.baseline.capturedAt).toISOString()})${run.baseline.quarantine ? ` — quarantined: ${run.baseline.quarantine.reason}` : ''}`)
    }
    run.attempts.forEach((a, i) => {
      if (!a.ok) {
        lines.push(`- attempt ${i + 1}: failed — ${a.error}`)
      } else if (a.pass) {
        lines.push(`- attempt ${i + 1}: pass`)
      } else {
        const details = (a.diff?.findings || [])
          .map(f => `[${f.severity}] ${f.rule}: ${f.message.replace(/\n/g, ' ')}`)
          .join('\n  ')
        lines.push(`- attempt ${i + 1}: ${details}`)
      }
    })
    lines.push('')
  }
  return lines.join('\n')
}

export function renderVisualCiComment(runs: ScreenRun[]): string {
  const counts = runs.reduce(
    (acc, r) => {
      acc[r.verdict] = (acc[r.verdict] || 0) + 1
      return acc
    },
    {} as Partial<Record<ScreenVerdict, number>>
  )
  const lines = [
    `### 🖼 Visual regression — ${runs.length} screen(s) · ${counts.fail || 0} failed · ${counts.flake || 0} flaky`,
    `<!-- ${VISUAL_CI_COMMENT_MARKER} -->`,
    '',
  ]
  if (runs.length === 0) {
    lines.push('No screens are affected by the changed files — nothing to verify.')
    return lines.join('\n')
  }
  lines.push('| Screen | Verdict | Diff | Details |')
  lines.push('|---|---|---|---|')
  for (const run of runs) {
    lines.push(`| ${run.key} | ${VERDICT_LABEL[run.verdict]} | ${diffPct(run)} | ${runDetail(run)} |`)
  }
  lines.push('')
  lines.push('Diff images: workflow artifact `visual-ci` (`.vectalon/visual-ci/diffs/`).')
  return lines.join('\n')
}

/** Run one screen's capture/diff/classify cycle; never throws. */
async function runScreen(
  key: string,
  deepLink: string | null,
  options: Required<Pick<VisualCiOptions, 'store' | 'device' | 'attempts' | 'settleMs' | 'outDir'>> & { root: string }
): Promise<ScreenRun> {
  const baseline = options.store.get(key)
  const run: ScreenRun = { key, verdict: 'unverified', attempts: [], baseline }
  // One capture is enough for proposal/quarantine probes — retries exist to
  // distinguish a real regression from timing noise against a real baseline.
  const attempts = !baseline || baseline.quarantine ? 1 : options.attempts
  const diffOpts = mergeDiffOptions(baseline)
  const shotsDir = join(options.outDir, 'shots')
  mkdirSync(shotsDir, { recursive: true })

  for (let i = 1; i <= attempts; i++) {
    const shotPath = join(shotsDir, `${key}-${i}.png`)
    const attempt = await captureAttempt(
      options.device,
      deepLink,
      baseline ? baseline.path : null,
      diffOpts,
      options.settleMs,
      shotPath
    )
    run.attempts.push(attempt)
    if (baseline && attempt.pass) break
    if (i < attempts) await sleep(jittered(750 * i))
  }

  classify(run)

  const last = run.attempts[run.attempts.length - 1]
  run.diff = last.diff
  run.screenshot = last.screenshot

  // No-baseline candidates land in pending/ for explicit approval.
  if (run.verdict === 'no-baseline' && run.screenshot && existsSync(run.screenshot)) {
    const pendingDir = join(options.outDir, 'pending')
    mkdirSync(pendingDir, { recursive: true })
    const pendingPath = join(pendingDir, `${key}-${options.device.platform}.png`)
    writeFileSync(pendingPath, readFileSync(run.screenshot))
    run.screenshot = pendingPath
  }

  // Render the diff composite for anything with a visible diff.
  if (
    run.screenshot &&
    baseline &&
    run.diff &&
    existsSync(run.screenshot) &&
    existsSync(baseline.path) &&
    (run.verdict === 'fail' || run.verdict === 'flake' || run.verdict === 'quarantined')
  ) {
    const diffsDir = join(options.outDir, 'diffs')
    const composite = renderDiffComposite(baseline.path, run.screenshot, run.diff, join(diffsDir, `${key}.png`))
    if (composite) run.composite = composite
  }
  return run
}

/**
 * Run the full PR-mode visual CI loop. Never throws — every screen ends with a
 * verdict and the outcome carries report + comment + exit code.
 */
export async function runVisualCi(options: VisualCiOptions): Promise<VisualCiOutcome> {
  const outDir = options.outDir
  mkdirSync(join(outDir, 'shots'), { recursive: true })
  mkdirSync(join(outDir, 'diffs'), { recursive: true })

  const attempts = options.attempts ?? DEFAULT_ATTEMPTS
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS
  const policy = options.verdict ?? 'warn'

  const keys = options.screens && options.screens.length > 0
    ? options.screens
    : deriveScreenKeys(options.root, options.changedFiles)

  const runs: ScreenRun[] = []

  if (keys.length > 0) {
    // Boot a device once for all screens (reuse one that is already booted).
    const listing = await options.device.listDevices()
    const hasBooted = listing.success && listing.stdout.trim().length > 0
    let deviceOk = hasBooted
    if (!hasBooted) {
      const boot = await options.device.boot()
      deviceOk = boot.success
    }
    const scheme = detectUrlScheme(options.root)
    for (const key of keys) {
      if (!deviceOk) {
        runs.push({ key, attempts: [], verdict: 'unverified', baseline: options.store.get(key) })
        continue
      }
      const deepLink = scheme ? buildDeepLink(scheme, key) : null
      const run = await runScreen(key, deepLink, {
        root: options.root,
        store: options.store,
        device: options.device,
        attempts,
        settleMs,
        outDir,
      })
      runs.push(run)
    }
  }

  const report = renderVisualCiReport({ runs }, { root: options.root, platform: options.platform })
  const comment = renderVisualCiComment(runs)
  const { passed, exitCode } = gate(runs, policy)

  try {
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, 'report.md'), report)
    writeFileSync(
      join(outDir, 'outcome.json'),
      JSON.stringify({ passed, exitCode, runs, report, comment }, null, 2)
    )
  } catch (err) {
    // Artifact write failure must not change the verdict.
  }

  if (options.pr && options.commenter) {
    try {
      await options.commenter(options.pr, comment)
    } catch (err) {
      // Comment failure is never a run failure (fork PRs have a read-only token).
    }
  }

  return { passed, exitCode, runs, report, comment }
}
