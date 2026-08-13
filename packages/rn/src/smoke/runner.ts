/**
 * Smoke runner — spawns every CLI command, captures its full output, and
 * classifies the result. Business Source License 1.1 (BSL-1.1)
 *
 * Classification:
 *  - exit 0 (or an `okExits` code)            → pass
 *  - exit in `warnOnExits`                    → warn
 *  - output announces a Pro/Team license gate → skip (tier-gated)
 *  - `skipWhen` returned a reason             → skip (can't run here)
 *  - killed by the timeout                    → timeout (fail)
 *  - anything else                            → fail
 * Long-running commands (`probe`) are boot-probed: spawn, wait for the ready
 * marker in output, then kill — so servers/daemons are verified without
 * leaving processes behind.
 */
import { spawn } from 'child_process'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolve, join } from 'path'
import pkg from '../../package.json'
import { listSmokeChecks } from './catalog'
import type { SmokeCheck, SmokeContext, SmokeReport, SmokeRun, SmokeStatus, SmokeTotals } from './types'

export interface SmokeRunnerOptions {
  /** Run only these check ids. */
  only?: string[]
  /** Skip these check ids. */
  skip?: string[]
  /** Include slow / model-heavy checks (feature, bench, selftest, pull). */
  full?: boolean
  /** Per-check timeout in ms (default 60s; probe checks use their own). */
  timeoutMs?: number
  /**
   * Run checks in dev mode (VECTALON_DEV_MODE=1) so tier-gated features run
   * for real instead of hitting the license gate. Default true — a post-release
   * verification should exercise every feature. Pass false to let tier-gated
   * checks report as skips.
   */
  devMode?: boolean
}

/** License-gate announcement in command output (e.g. "requires Pro tier"). */
const TIER_GATE = /requires\s+(Pro|Team)\s+tier|Current:\s*(free|pro)\s*\|\s*Required:\s*(pro|team)/i

/** CSI / OSC / two-byte ANSI escape sequences — stripped from captured output. */
// ANSI escapes are the point of this pattern.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g

/** Remove ANSI color / cursor / title escapes so reports stay clean. */
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

/** Executable used to run the CLI entry (node itself on every platform). */
function nodeBin(): string {
  return process.execPath
}

/** Absolute path to the CLI entry script (dist/smoke/runner.js → ../../bin). */
export function cliEntry(): string {
  return resolve(__dirname, '../../bin/rn-vectalon.js')
}

export function emptyTotals(): SmokeTotals {
  return { pass: 0, warn: 0, skip: 0, fail: 0, timeout: 0, total: 0 }
}

export function totalsFor(runs: SmokeRun[]): SmokeTotals {
  const totals = emptyTotals()
  totals.total = runs.length
  for (const run of runs) {
    if (run.status === 'pass') totals.pass++
    else if (run.status === 'warn') totals.warn++
    else if (run.status === 'skip') totals.skip++
    else if (run.status === 'timeout') totals.timeout++
    else totals.fail++
  }
  return totals
}

function classify(check: SmokeCheck, exitCode: number | null, output: string, timedOut: boolean): { status: SmokeStatus; reason?: string } {
  if (timedOut) return { status: 'timeout', reason: `exceeded the ${check.timeoutMs ?? 'default'}ms timeout` }
  if (exitCode === null) return { status: 'fail', reason: 'process did not exit cleanly' }
  if (check.okExits?.includes(exitCode) || exitCode === 0) return { status: 'pass' }
  if (TIER_GATE.test(output)) {
    const tier = /Team/i.test(output) ? 'Team' : 'Pro'
    return { status: 'skip', reason: `tier-gated (${tier}) — run with a license or --dev` }
  }
  if (check.warnOnExits?.includes(exitCode)) {
    return { status: 'warn', reason: `exit ${exitCode} (expected on a fresh project)` }
  }
  return { status: 'fail', reason: `exit ${exitCode}` }
}

interface SpawnOutcome {
  exitCode: number | null
  output: string
  timedOut: boolean
}

/** Spawn `node <cli> <args>` in the project root and capture combined output. */
function spawnCli(args: string[], ctx: SmokeContext, timeoutMs: number, devMode: boolean): Promise<SpawnOutcome> {
  return new Promise(resolvePromise => {
    const child = spawn(nodeBin(), [ctx.bin, ...args], {
      cwd: ctx.root,
      env: { ...process.env, VECTALON_DEV_MODE: devMode ? '1' : '0', FORCE_COLOR: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    })
    let output = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      // Give the child a moment to die before we resolve.
      setTimeout(() => child.kill('SIGKILL'), 500)
    }, timeoutMs)

    child.stdout.on('data', (d: Buffer) => {
      output += stripAnsi(d.toString())
    })
    child.stderr.on('data', (d: Buffer) => {
      output += stripAnsi(d.toString())
    })
    child.on('error', err => {
      clearTimeout(timer)
      output += `\n[smoke] spawn failed: ${err.message}\n`
      resolvePromise({ exitCode: 1, output, timedOut })
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolvePromise({ exitCode: code, output, timedOut })
    })
  })
}

/**
 * Boot-probe a long-running command: spawn it, watch output for the ready
 * marker, then kill. A marker within the probe timeout is a pass; a timeout
 * without the marker is a failure. The child is always killed.
 */
function probeCli(check: SmokeCheck, args: string[], ctx: SmokeContext, devMode: boolean): Promise<SmokeRun> {
  const probe = check.probe!
  const startedAt = Date.now()
  return new Promise(resolvePromise => {
    const child = spawn(nodeBin(), [ctx.bin, ...args], {
      cwd: ctx.root,
      env: { ...process.env, VECTALON_DEV_MODE: devMode ? '1' : '0', FORCE_COLOR: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    })
    let output = ''
    let settled = false
    const finish = (status: SmokeStatus, reason?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill('SIGKILL')
      resolvePromise({
        check,
        status,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        output,
        reason,
        args,
      })
    }
    const timer = setTimeout(() => finish('timeout', `server did not become ready within ${probe.timeoutMs}ms`), probe.timeoutMs)

    child.stdout.on('data', (d: Buffer) => {
      output += stripAnsi(d.toString())
      if (probe.ready.test(output)) finish('pass')
    })
    child.stderr.on('data', (d: Buffer) => {
      output += stripAnsi(d.toString())
      if (probe.ready.test(output)) finish('pass')
    })
    child.on('error', err => {
      output += `\n[smoke] spawn failed: ${err.message}\n`
      finish('fail', err.message)
    })
    child.on('close', code => {
      // Exited before becoming ready (e.g. tier gate, missing deps).
      if (TIER_GATE.test(output)) finish('skip', 'tier-gated (Pro/Team) — run with a license or --dev')
      else finish('fail', code === null ? 'exited before becoming ready' : `exited ${code} before becoming ready`)
    })
  })
}

async function runCheck(check: SmokeCheck, ctx: SmokeContext, opts: SmokeRunnerOptions): Promise<SmokeRun> {
  const args = check.args(ctx)
  const startedAt = Date.now()
  const devMode = opts.devMode ?? true

  const skipReason = check.skipWhen ? check.skipWhen(ctx) : null
  if (skipReason) {
    return { check, status: 'skip', exitCode: null, durationMs: 0, output: '', reason: skipReason, args }
  }

  if (check.probe) {
    return probeCli(check, args, ctx, devMode)
  }

  const timeoutMs = check.timeoutMs ?? opts.timeoutMs ?? 60000
  const { exitCode, output, timedOut } = await spawnCli(args, ctx, timeoutMs, devMode)
  const { status, reason } = classify(check, exitCode, output, timedOut)
  return {
    check,
    status,
    exitCode,
    durationMs: Date.now() - startedAt,
    output,
    reason,
    args,
  }
}

export interface SmokeHooks {
  onStart?: (check: SmokeCheck) => void
  onDone?: (run: SmokeRun) => void
}

export async function runSmoke(ctx: SmokeContext, opts: SmokeRunnerOptions = {}, hooks: SmokeHooks = {}): Promise<SmokeReport> {
  const checks = listSmokeChecks().filter(c => {
    if (opts.only && opts.only.length > 0 && !opts.only.includes(c.id)) return false
    if (opts.skip && opts.skip.includes(c.id)) return false
    if (c.slow && !opts.full) return false
    return true
  })

  const startedAt = Date.now()
  const runs: SmokeRun[] = []
  for (const check of checks) {
    hooks.onStart?.(check)
    const run = await runCheck(check, ctx, opts)
    runs.push(run)
    hooks.onDone?.(run)
  }

  return {
    version: pkg.version,
    flavor: ctx.flavor,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totals: totalsFor(runs),
    runs,
  }
}

/** Detect the project flavor from package.json (expo dep → expo, else rn-cli). */
export function detectFlavor(root: string): SmokeContext['flavor'] {
  try {
    // readFileSync, not require(): package.json contents change between reads
    // (and require caches by path), which would return a stale flavor.
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
    if (deps.expo) return 'expo'
    if (deps['react-native']) return 'rn-cli'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Candidate source files (App entry first, then src/**\/*). */
export function detectSourceFiles(root: string): string[] {
  const candidates = [
    'App.tsx',
    'App.jsx',
    'src/App.tsx',
    'src/App.jsx',
    'src/index.ts',
    'src/index.tsx',
    'index.ts',
    'index.js',
  ]
  const found = candidates.filter(c => existsSync(join(root, c)))

  const srcFiles: string[] = []
  try {
    const srcDir = join(root, 'src')
    if (existsSync(srcDir)) {
      const files = readdirSync(srcDir, { recursive: true }) as string[]
      srcFiles.push(...files.filter(f => /\.(tsx|jsx|ts)$/.test(f) && !f.includes('__tests__')).map(f => `src/${f}`).sort())
    }
  } catch {
    /* best-effort */
  }
  // Entries first, then src files — cap so impact/render run against a
  // bounded list (they take a single --changed / --entry value anyway).
  return [...found, ...srcFiles].slice(0, 10)
}
