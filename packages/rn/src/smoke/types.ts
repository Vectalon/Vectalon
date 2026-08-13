/**
 * Vectalon RN — Post-release smoke types
 * Business Source License 1.1 (BSL-1.1)
 *
 * The smoke suite runs EVERY CLI command against the current project and
 * captures the full output of each one, so a release can be verified "in
 * order" — every command wired, bootable, and producing sensible output.
 * Unlike selftest (which tests internal features in isolated sandboxes),
 * smoke executes the real `vectalon <command>` surface in place.
 */

export type SmokeCategory =
  | 'cli'      // version / help / status / models / auth
  | 'setup'    // init / policy / ecosystem / doctor / refresh
  | 'analysis' // impact / coverage / telemetry / bundle / profile
  | 'sandbox'  // sandbox / render
  | 'release'  // release / ci / leaderboard / visual-ci / ci-incident
  | 'e2e'      // serve / daemon / selftest / bench / feature
  | 'team'     // sync / team-policy

export type SmokeStatus = 'pass' | 'warn' | 'skip' | 'fail' | 'timeout'

export type SmokeFlavor = 'expo' | 'rn-cli' | 'unknown'

/** Everything a check needs to build its argument vector. */
export interface SmokeContext {
  /** Project root the commands run against. */
  root: string
  /** Absolute path to the `rn-vectalon` CLI entry (node script). */
  bin: string
  /** Detected project flavor. */
  flavor: SmokeFlavor
  /** Candidate source files (for impact / render), relative to root. */
  srcFiles: string[]
  /** Dev mode (VECTALON_DEV_MODE=1) — children inherit it via env. */
  devMode: boolean
}

export interface SmokeProbe {
  /**
   * Marker line that proves the long-running command booted (e.g. a server
   * announcing "serving via HTTP"). The runner spawns the command, watches
   * output for the marker, then kills the child and records a pass. Timeout
   * without the marker is a failure.
   */
  ready: RegExp
  timeoutMs: number
}

export interface SmokeCheck {
  /** Stable id, e.g. `impact`. */
  id: string
  name: string
  category: SmokeCategory
  /** Builds the argument vector (after `vectalon`) for the given context. */
  args: (ctx: SmokeContext) => string[]
  /** Per-check timeout; defaults to the runner's global timeout. */
  timeoutMs?: number
  /** Only run when `--full` is passed (model-heavy / slow / stateful). */
  slow?: boolean
  /** Exit codes that count as a pass (e.g. doctor exits 1 when issues found). */
  okExits?: number[]
  /** Exit codes that count as a warn (e.g. leaderboard with no results yet). */
  warnOnExits?: number[]
  /** Return a skip reason when the check cannot run in this project. */
  skipWhen?: (ctx: SmokeContext) => string | null
  /** Long-running commands: boot-probe instead of wait-for-exit. */
  probe?: SmokeProbe
}

export interface SmokeRun {
  check: SmokeCheck
  status: SmokeStatus
  /** Exit code of the child, when it exited. */
  exitCode: number | null
  durationMs: number
  /** The full combined stdout+stderr the command produced. */
  output: string
  /** Human-readable explanation for warn / skip / fail / timeout. */
  reason?: string
  /** The argument vector that was run. */
  args: string[]
}

export interface SmokeTotals {
  pass: number
  warn: number
  skip: number
  fail: number
  timeout: number
  total: number
}

export interface SmokeReport {
  version: string
  flavor: SmokeFlavor
  generatedAt: string
  durationMs: number
  totals: SmokeTotals
  runs: SmokeRun[]
}
