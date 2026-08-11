import { existsSync, statSync } from 'fs'
import { join } from 'path'

/** File mtime in ms, or 0 when stat fails (treat as stale). */
function statMtime(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch (err) {
    reportError(err, `doctor: statting ${path}`)
    return 0
  }
}
import { listEcosystemItems, getEcosystemItem } from './catalog'
import { readEcosystemConfig } from './config'
import type { EcosystemItem, ProjectFlavor } from './types'
import type { RegistryCheck } from './registry'
import { reportError, safe } from '../utils/safe'
import { getRemoteProviderInfo } from '../model/setup'
import type { ModelSetupProvider } from '../model/setup'
import { readCachedIntel } from '../knowledge/intel'
import { detectProjectFlavor } from './config'

/**
 * Probe failure recorded by `defensiveCheckers` — a checker that threw. The
 * doctor keeps going (that is the whole point of P0-10); these are surfaced
 * via `runDoctorSelfTest` and logged contextually.
 */
export interface ProbeFailure {
  checker: string
  context: string
  message: string
}

/**
 * Wrap every checker in safe() so a single broken probe can never kill the
 * whole report (P0-10). A throwing probe returns a neutral value — `false`,
 * an empty run result, `undefined` env — and is recorded as a ProbeFailure
 * instead of propagating. This covers the built-in checkers AND injected
 * checkers (tests, the fixer proxy), which is what makes the doctor
 * self-healing: one missing native module (better-sqlite3, node-llama-cpp)
 * degrades that one check, never the report.
 */
export function defensiveCheckers(checkers: DoctorCheckers): DoctorCheckers {
  const failures: ProbeFailure[] = []
  const record = (checker: string, context: string, error: unknown): undefined => {
    failures.push({ checker, context, message: error instanceof Error ? error.message : String(error) })
    return undefined
  }

  const wrapped: DoctorCheckers = {
    packageInstalled(packageName: string): boolean {
      const result = safe(() => checkers.packageInstalled(packageName), `doctor probe packageInstalled(${packageName})`)
      return result.ok ? result.value : !!record('packageInstalled', packageName, result.error)
    },
    run(command: string, args: string[]): { success: boolean; output: string } {
      const result = safe(() => checkers.run(command, args), `doctor probe run(${command})`)
      if (result.ok) return result.value
      record('run', command, result.error)
      return { success: false, output: '' }
    },
    dirExists(dir: string): boolean {
      const result = safe(() => checkers.dirExists(dir), `doctor probe dirExists(${dir})`)
      return result.ok ? result.value : !!record('dirExists', dir, result.error)
    },
    env(name: string): string | undefined {
      const result = safe(() => checkers.env(name), `doctor probe env(${name})`)
      return result.ok ? result.value : record('env', name, result.error)
    },
    portOpen(port: number): boolean {
      const result = safe(() => checkers.portOpen(port), `doctor probe portOpen(${port})`)
      return result.ok ? result.value : !!record('portOpen', String(port), result.error)
    },
    get platform(): NodeJS.Platform {
      const result = safe(() => checkers.platform, 'doctor probe platform')
      return result.ok ? result.value : process.platform
    },
    hasModel(presetId: string): boolean {
      const result = safe(() => checkers.hasModel(presetId), `doctor probe hasModel(${presetId})`)
      return result.ok ? result.value : !!record('hasModel', presetId, result.error)
    },
    writable(dir: string): boolean {
      const result = safe(() => checkers.writable(dir), `doctor probe writable(${dir})`)
      return result.ok ? result.value : !!record('writable', dir, result.error)
    },
  }

  // Expose the recorded probe failures (runDoctorSelfTest reads them).
  ;(wrapped as unknown as { __probeFailures: () => ProbeFailure[] }).__probeFailures = () => failures
  return wrapped
}

/** Read the probe failures recorded by defensiveCheckers (or [] if unwrapped). */
export function probeFailuresOf(checkers: DoctorCheckers): ProbeFailure[] {
  const probe = (checkers as unknown as { __probeFailures?: () => ProbeFailure[] }).__probeFailures
  return probe ? probe() : []
}

/**
 * One self-test probe: does this checker complete (without throwing) on a
 * benign input? Verifies the doctor's own wiring — a broken probe here means
 * every report that uses it would silently degrade.
 */
export interface DoctorSelfTestResult {
  id: string
  name: string
  ok: boolean
  detail: string
}

/**
 * `doctor --selftest` — verify the doctor's own probes work (P0-10). Each
 * probe runs against a benign input through defensiveCheckers; the result is
 * ok when the probe completed (a `false` answer is fine — e.g. port 1 is
 * legitimately closed). Probe *throws* are reported as failures.
 */
export function runDoctorSelfTest(root: string, checkers: DoctorCheckers): DoctorSelfTestResult[] {
  const defensive = defensiveCheckers(checkers)
  const base = (id: string, name: string): Pick<DoctorSelfTestResult, 'id' | 'name'> => ({ id, name })

  const results: DoctorSelfTestResult[] = []

  const node = defensive.run('node', ['--version'])
  results.push({
    ...base('selftest-node', 'node --version probe'),
    ok: true,
    detail: node.success ? `responded (${node.output.trim().slice(0, 40)})` : 'did not respond',
  })

  const java = defensive.run('java', ['-version'])
  results.push({
    ...base('selftest-java', 'java -version probe'),
    ok: true,
    detail: java.success ? 'responded' : 'not found on PATH (fine — checked lazily)',
  })

  results.push({
    ...base('selftest-dir', 'dirExists(cwd)'),
    ok: true,
    detail: defensive.dirExists(root) ? 'true' : 'false',
  })

  results.push({
    ...base('selftest-writable', 'writable(cwd)'),
    ok: true,
    detail: defensive.writable(root) ? 'true' : 'false',
  })

  results.push({
    ...base('selftest-env', 'env(PATH)'),
    ok: true,
    detail: defensive.env('PATH') ? 'set' : 'unset',
  })

  results.push({
    ...base('selftest-port', 'portOpen(1) probe (expect false, no throw)'),
    ok: true,
    detail: defensive.portOpen(1) ? 'open' : 'closed (expected)',
  })

  results.push({
    ...base('selftest-model', 'hasModel(nonexistent) probe'),
    ok: true,
    detail: defensive.hasModel('__selftest_nonexistent__') ? 'true (unexpected)' : 'false (expected)',
  })

  results.push({
    ...base('selftest-package', 'packageInstalled(@vectalon-dev/rn) probe'),
    ok: true,
    detail: defensive.packageInstalled('@vectalon-dev/rn') ? 'resolvable' : 'not resolvable from this project (probe still works)',
  })

  // Probe failures recorded by the defensive wrapper = broken probes.
  const failures = probeFailuresOf(defensive)
  for (const failure of failures) {
    results.push({
      ...base(`selftest-${failure.checker}`, `${failure.checker} probe threw`),
      ok: false,
      detail: `${failure.context}: ${failure.message}`,
    })
  }

  return results
}

export type DoctorStatus = 'ok' | 'missing' | 'warning'

export type DoctorCategory = EcosystemItem['category'] | 'toolchain' | 'leaderboard' | 'model' | 'ecosystem'

export interface DoctorCheckResult {
  id: string
  name: string
  category: DoctorCategory
  flavor: string
  status: DoctorStatus
  detail: string
  hint?: string
}

export interface DoctorReport {
  /** Per-enabled-ecosystem-item checks. */
  checks: DoctorCheckResult[]
  /** Native toolchain checks (Node, JDK, Android, iOS, Metro). */
  toolchain: DoctorCheckResult[]
  /** Nightly-leaderboard readiness checks (M5): API-key secrets, local model,
   * and the results directory the scheduled workflow writes to. */
  leaderboard: DoctorCheckResult[]
  /** Model-access checks: can the configured model reach tools/MCPs/skills. */
  model: DoctorCheckResult[]
  /** Detected project flavor ('expo' | 'rn-cli' | 'both'). */
  flavor: ProjectFlavor
  enabledCount: number
  okCount: number
  missingCount: number
  warningCount: number
}

/**
 * Injectable checkers so the doctor logic is unit-testable without spawning
 * real processes or touching the network. The CLI wires real implementations.
 */
export interface DoctorCheckers {
  /** Resolve an npm package from the project root; true when installed locally. */
  packageInstalled: (packageName: string) => boolean
  /**
   * Run a command and report whether it exited successfully. For MCP probes
   * the CLI passes a bounded npx --no-install invocation.
   */
  run: (command: string, args: string[]) => { success: boolean; output: string }
  /** Check whether a directory exists on disk (skills install dirs). */
  dirExists: (dir: string) => boolean
  /** Read an environment variable (e.g. ANDROID_HOME, ANDROID_SDK_ROOT). */
  env: (name: string) => string | undefined
  /** True when a TCP listener is accepting connections on localhost:port. */
  portOpen: (port: number) => boolean
  /** Host platform (darwin/darwin for Xcode/CocoaPods gating). */
  platform: NodeJS.Platform
  /** True when the given local model preset has been downloaded (leaderboard). */
  hasModel: (presetId: string) => boolean
  /** True when a directory exists and is writable (leaderboard results dir). */
  writable: (dir: string) => boolean
}

/** Toolchain IDs and their human-readable names. */
export const TOOLCHAIN_ITEM_IDS = [
  'node',
  'jdk',
  'android-sdk',
  'android-emulator',
  'xcode',
  'cocoapods',
  'metro-port',
] as const

export type ToolchainItemId = (typeof TOOLCHAIN_ITEM_IDS)[number]

export interface ToolchainCheckOptions {
  /** Minimum supported Node major (default 18 — RN 0.7x requires 20, so 18-19 warn). */
  minNodeMajor?: number
  /** Minimum supported JDK major (default 17 for RN 0.7x). */
  minJavaMajor?: number
  /** Metro dev-server port (default 8081). */
  metroPort?: number
}

/** Leaderboard readiness check ids (M5): the nightly model leaderboard. */
export const LEADERBOARD_ITEM_IDS = [
  'lb-openai-key',
  'lb-anthropic-key',
  'lb-local-model',
  'lb-results-dir',
] as const

export type LeaderboardItemId = (typeof LEADERBOARD_ITEM_IDS)[number]

export interface LeaderboardCheckOptions {
  /** Local model preset id to verify is downloaded (default qwen2.5-coder-1.5b). */
  localModelPresetId?: string
}

/**
 * Check the prerequisites of the nightly leaderboard workflow
 * (`.github/workflows/leaderboard.yml`) so a failed scheduled run is diagnosed
 * before the cron fires:
 * - remote-provider API-key secrets (OPENAI_API_KEY / ANTHROPIC_API_KEY)
 * - the local model preset is downloaded (for the `local` matrix entry)
 * - `bench/results/` is present and writable (the workflow writes per-model
 *   result JSONs there, then merges them into BENCHMARK_RESULTS.md)
 */
export function checkLeaderboardReadiness(
  root: string,
  checkers: DoctorCheckers,
  options: LeaderboardCheckOptions = {}
): DoctorCheckResult[] {
  const localModelId = options.localModelPresetId || 'qwen2.5-coder-1.5b'
  const base = (id: string, name: string): Pick<DoctorCheckResult, 'id' | 'name' | 'category' | 'flavor'> =>
    ({ id, name, category: 'leaderboard', flavor: 'both' })

  const results: DoctorCheckResult[] = []

  const openaiKey = checkers.env('OPENAI_API_KEY')
  results.push(
    openaiKey
      ? { ...base('lb-openai-key', 'OPENAI_API_KEY secret'), status: 'ok', detail: 'set' }
      : {
          ...base('lb-openai-key', 'OPENAI_API_KEY secret'),
          status: 'warning',
          detail: 'unset — the nightly openai matrix entry will be skipped',
          hint: 'Add OPENAI_API_KEY to the repo secrets (Settings → Secrets and variables → Actions)'
        }
  )

  const anthropicKey = checkers.env('ANTHROPIC_API_KEY')
  results.push(
    anthropicKey
      ? { ...base('lb-anthropic-key', 'ANTHROPIC_API_KEY secret'), status: 'ok', detail: 'set' }
      : {
          ...base('lb-anthropic-key', 'ANTHROPIC_API_KEY secret'),
          status: 'warning',
          detail: 'unset — the nightly anthropic matrix entry will be skipped',
          hint: 'Add ANTHROPIC_API_KEY to the repo secrets (Settings → Secrets and variables → Actions)'
        }
  )

  const hasModel = checkers.hasModel(localModelId)
  results.push(
    hasModel
      ? { ...base('lb-local-model', 'Local model downloaded'), status: 'ok', detail: `${localModelId} present` }
      : {
          ...base('lb-local-model', 'Local model downloaded'),
          status: 'warning',
          detail: `${localModelId} not downloaded — the nightly local matrix entry will fall back`,
          hint: 'Run `vectalon pull` to download the default Qwen model (or set an API key)'
        }
  )

  // Only the benchmark host (this repo or a fork with bench/scenarios) runs the
  // leaderboard workflow, so a missing results dir is a hard failure there but
  // merely informational in ordinary RN projects — mirror the android-degrades-
  // to-warning pattern in checkNativeToolchain.
  const resultsDir = join(root, 'bench', 'results')
  const isBenchmarkHost = checkers.dirExists(join(root, 'bench', 'scenarios'))
  const writable = checkers.writable(resultsDir)
  results.push(
    writable
      ? { ...base('lb-results-dir', 'Benchmark results directory'), status: 'ok', detail: `${resultsDir.replace(root, '.')} writable` }
      : isBenchmarkHost
        ? {
            ...base('lb-results-dir', 'Benchmark results directory'),
            status: 'missing',
            detail: `${resultsDir.replace(root, '.')} missing or not writable — the nightly run cannot write result JSONs`,
            hint: 'Create it: `mkdir -p bench/results` (or fix permissions)'
          }
        : {
            ...base('lb-results-dir', 'Benchmark results directory'),
            status: 'warning',
            detail: `${resultsDir.replace(root, '.')} not present (not a benchmark host — no bench/scenarios)`,
            hint: 'Only needed when running the nightly leaderboard: `mkdir -p bench/results`'
          }
  )

  return results
}

/** Model-access check ids: can the configured model reach tools/MCPs/skills
 * and stay current with web intel. */
export const MODEL_ACCESS_ITEM_IDS = ['ma-model', 'ma-ecosystem', 'ma-skills', 'ma-mcp', 'ma-intel'] as const

export type ModelAccessItemId = (typeof MODEL_ACCESS_ITEM_IDS)[number]

export interface ModelAccessCheckOptions {
  /** Configured provider ('local' when unset — the default). */
  provider?: ModelSetupProvider
  /** Local model preset id to verify is downloaded (default qwen2.5-coder-1.5b). */
  modelPresetId?: string
  /** Env var carrying the remote API key (default per provider). */
  apiKeyEnv?: string
}

/**
 * Check whether the configured model can actually reach the toolchain:
 * - the model itself is usable (local preset downloaded / remote API key set)
 * - ecosystem items are enabled at all (run_agent, skill injection, and the
 *   proxied MCP tools all need .vectalon/ecosystem.json entries)
 * - enabled skills are installed on disk (their SKILL.md is what gets inlined)
 * - enabled MCP servers are reachable (the agent loop calls them through
 *   `vectalon serve` sub-MCP proxying)
 *
 * All checks warn (except a missing local model, which blocks everything), so
 * ordinary projects without the optional tooling still pass doctor.
 */
export function checkModelAccess(
  root: string,
  checkers: DoctorCheckers,
  options: ModelAccessCheckOptions = {},
  ecosystemChecks?: DoctorCheckResult[]
): DoctorCheckResult[] {
  const provider = options.provider || 'local'
  const base = (id: string, name: string): Pick<DoctorCheckResult, 'id' | 'name' | 'category' | 'flavor'> =>
    ({ id, name, category: 'model', flavor: 'both' })
  const results: DoctorCheckResult[] = []

  // 1. ma-model — is the configured model usable at all?
  if (provider === 'local') {
    const presetId = options.modelPresetId || 'qwen2.5-coder-1.5b'
    if (checkers.hasModel(presetId)) {
      results.push({ ...base('ma-model', 'Configured model'), status: 'ok', detail: `local ${presetId} downloaded — tool calling (run_agent) available` })
    } else {
      results.push({
        ...base('ma-model', 'Configured model'),
        status: 'missing',
        detail: `local provider configured but ${presetId} is not downloaded — run_agent and intent detection fall back to echoing prompts`,
        hint: 'Download the model: `vectalon pull` (or pick a remote provider with `vectalon init`)',
      })
    }
  } else if (provider === 'wasm') {
    // Zero-config WASM — always usable; weights download on first use.
    results.push({
      ...base('ma-model', 'Configured model'),
      status: 'ok',
      detail: 'wasm provider — ONNX/WASM Qwen2.5-Coder downloads on first use (no API key, no native build)',
    })
  } else {
    const info = getRemoteProviderInfo(provider)
    if (info && !info.apiKeyEnv) {
      // Keyless local servers (Ollama/vLLM): there is no env var to verify —
      // the request either reaches the local server or fails at call time.
      results.push({
        ...base('ma-model', 'Configured model'),
        status: 'ok',
        detail: `${info.label} provider — no API key required; ensure a server is running at ${info.baseUrl}`,
      })
    } else {
      const apiKeyEnv = options.apiKeyEnv || info?.apiKeyEnv || ''
      if (apiKeyEnv && checkers.env(apiKeyEnv)) {
        results.push({ ...base('ma-model', 'Configured model'), status: 'ok', detail: `${provider} provider ready (${apiKeyEnv} set)` })
      } else {
        results.push({
          ...base('ma-model', 'Configured model'),
          status: 'warning',
          detail: `${provider} provider configured but ${apiKeyEnv} is not set — tool calling will fail`,
          hint: `Export ${apiKeyEnv} in your environment (or run \`vectalon init\` to switch to the local model)`,
        })
      }
    }
  }

  // 2. ma-ecosystem — are any items enabled at all?
  const config = readEcosystemConfig(root)
  const enabled = listEcosystemItems().filter(i => config.enabled.includes(i.id))
  if (enabled.length === 0) {
    results.push({
      ...base('ma-ecosystem', 'Ecosystem items enabled'),
      status: 'warning',
      detail: 'no ecosystem items enabled — the model has no MCP servers or skills to reach',
      hint: 'Enable the recommended set: `vectalon ecosystem --enable <id>` (or `vectalon init`)',
    })
  } else {
    const mcps = enabled.filter(i => i.category === 'mcp').length
    const skills = enabled.filter(i => i.category === 'skill').length
    results.push({
      ...base('ma-ecosystem', 'Ecosystem items enabled'),
      status: 'ok',
      detail: `${enabled.length} enabled (${mcps} MCP, ${skills} skill, ${enabled.length - mcps - skills} tool/hook)`,
    })
  }

  // 3. ma-skills — enabled skills must be installed for their contents to reach
  //    the model (they are inlined into the system prompt).
  const enabledSkills = enabled.filter(i => i.category === 'skill')
  const installedSkills = enabledSkills.filter(i => skillInstallDirs(root, i).some(d => checkers.dirExists(d)))
  if (enabledSkills.length === 0) {
    results.push({ ...base('ma-skills', 'Skills installed'), status: 'ok', detail: 'no skills enabled (optional)' })
  } else if (installedSkills.length === enabledSkills.length) {
    results.push({
      ...base('ma-skills', 'Skills installed'),
      status: 'ok',
      detail: `${installedSkills.length}/${enabledSkills.length} skills installed — their best practices are inlined into local prompts`,
    })
  } else {
    const missing = enabledSkills.find(i => !installedSkills.includes(i))
    results.push({
      ...base('ma-skills', 'Skills installed'),
      status: 'warning',
      detail: `${installedSkills.length}/${enabledSkills.length} skills installed — uninstalled skills never reach the model`,
      hint: missing ? `Install with: ${missing.install}` : 'Run the `npx skills add …` commands for each enabled skill',
    })
  }

  // 4. ma-mcp — enabled MCP servers must be spawnable for the agent loop to
  //    call them. Reuse the ecosystem doctor's per-item status when available
  //    (avoids re-running npx probes).
  const enabledMcps = enabled.filter(i => i.category === 'mcp')
  const statusOf = (item: EcosystemItem): DoctorStatus =>
    ecosystemChecks?.find(c => c.id === item.id)?.status ?? checkEcosystemItem(item, root, checkers).status
  const reachableMcps = enabledMcps.filter(i => statusOf(i) === 'ok')
  if (enabledMcps.length === 0) {
    results.push({ ...base('ma-mcp', 'MCP servers reachable'), status: 'ok', detail: 'no MCP servers enabled (optional)' })
  } else if (reachableMcps.length === enabledMcps.length) {
    results.push({
      ...base('ma-mcp', 'MCP servers reachable'),
      status: 'ok',
      detail: `${reachableMcps.length}/${enabledMcps.length} MCP servers reachable — the agent loop can call them`,
    })
  } else {
    const missing = enabledMcps.find(i => statusOf(i) !== 'ok')
    results.push({
      ...base('ma-mcp', 'MCP servers reachable'),
      status: 'warning',
      detail: `${reachableMcps.length}/${enabledMcps.length} MCP servers reachable — the rest are skipped by run_agent`,
      hint: missing ? `Install with: ${missing.install}` : 'Install each MCP server with its catalog install command',
    })
  }

  // 5. ma-intel — is the model fed current ecosystem intel? Vectalon keeps
  //    itself (and the model) cutting edge by periodically refreshing web
  //    headlines; a stale/absent cache means generation runs on last-known
  //    guidance. Warns (never blocks) since refresh is background/optional.
  let intelCount = 0
  try {
    intelCount = readCachedIntel(root).length
  } catch (err) {
    reportError(err, 'doctor: reading web intel cache')
  }
  // The intel cache lives under .vectalon/knowledge/refresh/intel.json; we
  // surface its freshness via the file's mtime when present. News sources
  // refresh every 6-12h (and `vectalon serve` every hour), so anything older
  // than 48h means the auto-refresh isn't running — flag it.
  const intelPath = join(root, '.vectalon', 'knowledge', 'refresh', 'intel.json')
  const intelAgeMs = existsSync(intelPath) ? Date.now() - statMtime(intelPath) : Infinity
  const intelStale = !existsSync(intelPath) || intelAgeMs > 48 * 60 * 60 * 1000
  if (intelCount === 0) {
    results.push({
      ...base('ma-intel', 'Web intel (model currency)'),
      status: 'warning',
      detail: 'no web intel cached yet — the model runs on last-known guidance until the first refresh',
      hint: 'Run `vectalon refresh` (or `vectalon serve`, which refreshes hourly) to feed the model current RN releases/news',
    })
  } else if (intelStale) {
    results.push({
      ...base('ma-intel', 'Web intel (model currency)'),
      status: 'warning',
      detail: `${intelCount} headline(s) cached but stale (>48h old) — the auto-refresh may not be running; refresh to keep the model current`,
      hint: 'Run `vectalon refresh --force` (or `vectalon serve`, which refreshes hourly)',
    })
  } else {
    results.push({
      ...base('ma-intel', 'Web intel (model currency)'),
      status: 'ok',
      detail: `${intelCount} headline(s) cached and current — the model system prompt stays aligned with the latest RN ecosystem`,
    })
  }

  return results
}

/**
 * Binaries that are installed globally / via gem / via curl (no npm package
 * resolvable from the project), probed by name with `--version` or `--help`.
 */
const GLOBAL_BIN_PROBE: Record<string, string[]> = {
  fastlane: ['--version'],
  maestro: ['--help'],
  'eas-cli': ['--version'],
}

/** Skills install into .vectalon/skills/<id> or .agents/skills/<id>. */
function skillInstallDirs(root: string, item: EcosystemItem): string[] {
  const dirs = [
    join(root, '.vectalon', 'skills', item.id),
    join(root, '.agents', 'skills', item.id),
  ]
  if (item.configPath) {
    dirs.push(join(root, item.configPath))
  }
  return dirs
}

/** Extract the npm package name from an npx-style install string. */
function packageFromInstall(install: string): string | null {
  const match = install.match(/^npx(?:\s+\S+)?\s+(@?[\w.-]+(?:\/[\w.-]+)?)/)
  return match ? match[1] : null
}

function hintForInstall(install: string): string {
  return `Install with: ${install}`
}

/**
 * Check a single ecosystem item. Category-specific rules:
 * - mcp: the npx package must be resolvable locally, or the npx binary must
 *   respond to a version/help probe (bounded); otherwise missing.
 * - tool/hook: npm package must be installed locally, unless it's a
 *   global-binary tool (fastlane/maestro/eas-cli) probed on PATH.
 * - skill: the skill's install directory must exist.
 */
export function checkEcosystemItem(
  item: EcosystemItem,
  root: string,
  checkers: DoctorCheckers
): DoctorCheckResult {
  const base = { id: item.id, name: item.name, category: item.category, flavor: item.flavor }

  if (item.category === 'skill') {
    const dirs = skillInstallDirs(root, item)
    const installed = dirs.some(d => checkers.dirExists(d))
    if (installed) {
      return { ...base, status: 'ok', detail: 'skill install directory present' }
    }
    return {
      ...base,
      status: 'missing',
      detail: `no skill directory found under ${dirs.map(d => d.replace(root, '.')).join(' or ')}`,
      hint: hintForInstall(item.install),
    }
  }

  // expo-mcp runs through the expo CLI (`npx expo mcp`), not a standalone npm
  // package, so verify the expo CLI/package instead of resolving "expo-mcp".
  if (item.id === 'expo-mcp') {
    if (checkers.packageInstalled('expo')) {
      return { ...base, status: 'ok', detail: 'expo package installed locally (npx expo mcp available)' }
    }
    const result = checkers.run('expo', ['--version'])
    if (result.success) {
      return { ...base, status: 'ok', detail: 'expo CLI responds on PATH' }
    }
    return {
      ...base,
      status: 'missing',
      detail: 'expo CLI not found — npx expo mcp requires the expo package',
      hint: hintForInstall(item.install),
    }
  }

  // rn-diff-purge is a built-in data source now: Vectalon fetches the template
  // diffs live (vectalon upgrade --diff / the get_rn_upgrade_diff MCP tool).
  // It is not an npm package and there is nothing to install — report ok
  // instead of an unactionable warning.
  if (item.id === 'rn-diff-purge') {
    return {
      ...base,
      status: 'ok',
      detail: 'built-in — upgrade diffs fetched live (vectalon upgrade --diff / get_rn_upgrade_diff)',
    }
  }

  // mcp + tool + hook all resolve an npm package when one is known.
  const packageName = item.packageName || packageFromInstall(item.install)
  if (packageName) {
    if (checkers.packageInstalled(packageName)) {
      return { ...base, status: 'ok', detail: `${packageName} installed locally` }
    }
    // npx-only tools are fetch-on-demand; still try a bounded binary probe.
    const probe = GLOBAL_BIN_PROBE[item.id]
    if (item.install.startsWith('npx') || probe) {
      // Probe the executable name, not the npm package name: scoped packages
      // publish an unscoped bin (e.g. @ohah/react-native-mcp-server →
      // react-native-mcp-server) and an install tag (@rc) is not an executable.
      const binName = probe ? item.id : packageName.replace(/^@[^/]+\//, '').replace(/@[^@]+$/, '')
      const args = probe || ['--version']
      const result = checkers.run(binName, args)
      if (result.success) {
        return { ...base, status: 'ok', detail: `${binName} responds on PATH` }
      }
      return {
        ...base,
        status: 'missing',
        detail: `${packageName} not installed locally and ${binName} did not respond`,
        hint: hintForInstall(item.install),
      }
    }
    return {
      ...base,
      status: 'missing',
      detail: `${packageName} not installed locally`,
      hint: hintForInstall(item.install),
    }
  }

  // No npm package: global binaries only.
  const probe = GLOBAL_BIN_PROBE[item.id]
  if (probe) {
    const result = checkers.run(item.id, probe)
    if (result.success) {
      return { ...base, status: 'ok', detail: `${item.id} responds on PATH` }
    }
    return {
      ...base,
      status: 'missing',
      detail: `${item.id} not found on PATH`,
      hint: hintForInstall(item.install),
    }
  }

  return {
    ...base,
    status: 'warning',
    detail: 'no automated check available for this item',
    hint: hintForInstall(item.install),
  }
}

export interface DoctorCatalogOptions {
  /**
   * Precomputed npm-registry status for enabled MCP package names (async
   * fetch by the CLI, cache-backed). Absent entries mean "not verified" —
   * the check reports ok/skipped instead of false-warning offline.
   */
  catalogRegistry?: Record<string, RegistryCheck>
}

/**
 * Catalog-health check for every ENABLED MCP item: does its npm package
 * actually exist on the registry? Catches stale/wrong catalog entries before
 * serve does — the fail-fast counterpart to the quiet spawn handling.
 *
 * Pure + sync: the registry status is precomputed by the caller (async,
 * cache-backed) so this function stays unit-testable without network.
 */
export function checkEcosystemCatalogHealth(
  root: string,
  _checkers: DoctorCheckers,
  options: DoctorCatalogOptions = {}
): DoctorCheckResult[] {
  const config = readEcosystemConfig(root)
  const enabledMcps = listEcosystemItems().filter(i => i.category === 'mcp' && config.enabled.includes(i.id))
  if (enabledMcps.length === 0) return []

  const base = (item: EcosystemItem): Pick<DoctorCheckResult, 'id' | 'name' | 'category' | 'flavor'> => ({
    id: `catalog-${item.id}`,
    name: `${item.name} — catalog entry`,
    category: 'ecosystem',
    flavor: 'both',
  })

  return enabledMcps.map(item => {
    const pkg = item.packageName
    if (!pkg) {
      return {
        ...base(item),
        status: 'warning',
        detail: 'no npm package to verify against the registry',
        hint: item.install,
      }
    }
    const check = options.catalogRegistry?.[pkg]
    if (!check || !check.verified) {
      return {
        ...base(item),
        status: 'ok',
        detail: `registry verification skipped (offline or not yet cached) — install: ${item.install}`,
      }
    }
    if (!check.exists) {
      return {
        ...base(item),
        status: 'warning',
        detail: `catalog entry points at "${pkg}" which does not exist on the npm registry`,
        hint: `Corrected install: ${item.install}`,
      }
    }
    return {
      ...base(item),
      status: 'ok',
      detail: `"${pkg}" resolves on npm${check.latestVersion ? ` (latest ${check.latestVersion})` : ''}`,
    }
  })
}

/** Run the doctor over every enabled ecosystem item in the project. */
export function runEcosystemDoctor(root: string, checkers: DoctorCheckers): DoctorReport {
  const config = readEcosystemConfig(root)
  const enabled = listEcosystemItems().filter(i => config.enabled.includes(i.id))

  const checks = enabled.map(item => checkEcosystemItem(item, root, checkers))

  return {
    checks,
    toolchain: [],
    leaderboard: [],
    model: [],
    flavor: detectProjectFlavor(root),
    enabledCount: enabled.length,
    okCount: checks.filter(c => c.status === 'ok').length,
    missingCount: checks.filter(c => c.status === 'missing').length,
    warningCount: checks.filter(c => c.status === 'warning').length,
  }
}

/**
 * Base fields shared by every native toolchain check (mirrors checkEcosystemItem's
 * `base` pattern).
 */
function toolchainBase(id: string, name: string): Pick<DoctorCheckResult, 'id' | 'name' | 'category' | 'flavor'> {
  return { id, name, category: 'toolchain', flavor: 'both' }
}

/**
 * Check the native toolchain a React Native project needs: Node, a JDK,
 * Android SDK + emulator, Xcode + CocoaPods (macOS), and the Metro dev-server
 * port. Each check returns an actionable fix hint on failure.
 *
 * Platform- and project-aware:
 * - Xcode/CocoaPods are only meaningful on darwin.
 * - Android checks degrade to a warning when the project has no android/ dir.
 * - Metro is a warning (not a failure) when nothing is listening — the dev
 *   server is started on demand.
 */
export function checkNativeToolchain(
  root: string,
  checkers: DoctorCheckers,
  options: ToolchainCheckOptions = {}
): DoctorCheckResult[] {
  const minNodeMajor = options.minNodeMajor ?? 18
  const minJavaMajor = options.minJavaMajor ?? 17
  const metroPort = options.metroPort ?? 8081
  const androidPresent = checkers.dirExists(join(root, 'android'))
  const macOnly = checkers.platform === 'darwin'

  const results: DoctorCheckResult[] = []

  // Node.js
  const node = checkers.run('node', ['--version'])
  const nodeMajor = node.success ? parseInt((node.output.match(/v?(\d+)/) || [])[1] || '', 10) : NaN
  if (!node.success || Number.isNaN(nodeMajor)) {
    results.push({
      ...toolchainBase('node', 'Node.js'),
      status: 'missing',
      detail: node.success ? 'could not parse node version' : 'node not found on PATH',
      hint: 'Install Node 20+ via nvm: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash`, then `nvm install 20`',
    })
  } else if (nodeMajor < minNodeMajor) {
    results.push({
      ...toolchainBase('node', 'Node.js'),
      status: 'missing',
      detail: `Node ${nodeMajor} is too old (RN 0.7x requires ${minNodeMajor}+)`,
      hint: 'Upgrade Node: `nvm install 20 && nvm use 20`',
    })
  } else if (nodeMajor < 20) {
    results.push({
      ...toolchainBase('node', 'Node.js'),
      status: 'warning',
      detail: `Node ${nodeMajor} works but 20+ is recommended for RN 0.7x`,
      hint: 'Upgrade Node: `nvm install 20 && nvm use 20`',
    })
  } else {
    results.push({ ...toolchainBase('node', 'Node.js'), status: 'ok', detail: `Node ${nodeMajor}` })
  }

  // JDK
  const java = checkers.run('java', ['-version'])
  const javaMajor = java.success ? parseInt((java.output.match(/(?:version\s+"|openjdk\s+)?(\d+)/) || [])[1] || '', 10) : NaN
  if (!java.success || Number.isNaN(javaMajor)) {
    results.push({
      ...toolchainBase('jdk', 'JDK'),
      status: 'missing',
      detail: java.success ? 'could not parse java version' : 'java not found on PATH',
      hint: 'Install a JDK 17+ (RN Android builds need it): `brew install --cask temurin@17` (macOS) or download from Adoptium',
    })
  } else if (javaMajor < minJavaMajor) {
    results.push({
      ...toolchainBase('jdk', 'JDK'),
      status: 'missing',
      detail: `JDK ${javaMajor} is too old (RN requires ${minJavaMajor}+)`,
      hint: `Upgrade the JDK: install ${minJavaMajor}+ from Adoptium or \`brew install --cask temurin@${minJavaMajor}\``,
    })
  } else {
    results.push({ ...toolchainBase('jdk', 'JDK'), status: 'ok', detail: `JDK ${javaMajor}` })
  }

  // Android SDK
  const androidHome = checkers.env('ANDROID_HOME') || checkers.env('ANDROID_SDK_ROOT')
  const sdkFound = androidHome ? checkers.dirExists(androidHome) : false
  const adbOnPath = checkers.run('adb', ['--version']).success
  if (sdkFound) {
    results.push({ ...toolchainBase('android-sdk', 'Android SDK'), status: 'ok', detail: `Android SDK at ${androidHome}` })
  } else if (adbOnPath) {
    results.push({ ...toolchainBase('android-sdk', 'Android SDK'), status: 'ok', detail: 'Android SDK tools (adb) on PATH' })
  } else if (androidPresent) {
    results.push({
      ...toolchainBase('android-sdk', 'Android SDK'),
      status: 'missing',
      detail: 'ANDROID_HOME unset and adb not on PATH (android/ present)',
      hint: 'Install Android Studio and export ANDROID_HOME (e.g. `export ANDROID_HOME=$HOME/Library/Android/sdk`)',
    })
  } else {
    results.push({
      ...toolchainBase('android-sdk', 'Android SDK'),
      status: 'warning',
      detail: 'ANDROID_HOME unset and adb not on PATH (no android/ dir — Android not built here)',
      hint: 'Install Android Studio and export ANDROID_HOME before building Android',
    })
  }

  // Android emulator
  const emulator = checkers.run('emulator', ['-list-avds'])
  if (emulator.success && emulator.output.trim().length > 0) {
    const avds = emulator.output.trim().split(/\r?\n/).filter(Boolean).join(', ')
    results.push({ ...toolchainBase('android-emulator', 'Android Emulator'), status: 'ok', detail: `AVDs: ${avds}` })
  } else if (androidPresent) {
    results.push({
      ...toolchainBase('android-emulator', 'Android Emulator'),
      status: 'missing',
      detail: emulator.success ? 'emulator found but no AVDs configured' : 'emulator not found on PATH (android/ present)',
      hint: 'Create an AVD in Android Studio (Device Manager) or `avdmanager create avd -n dev -k "system-images;android-35;google_apis;arm64-v8a"`',
    })
  } else {
    results.push({
      ...toolchainBase('android-emulator', 'Android Emulator'),
      status: 'warning',
      detail: 'no emulator on PATH (no android/ dir — not built here)',
      hint: 'Install the emulator + system image via Android Studio SDK Manager',
    })
  }

  // Xcode (macOS only)
  if (!macOnly) {
    results.push({ ...toolchainBase('xcode', 'Xcode'), status: 'warning', detail: 'Xcode is macOS-only — skipped' })
  } else {
    const xcode = checkers.run('xcodebuild', ['-version'])
    if (xcode.success) {
      const version = (xcode.output.match(/Xcode (\S+)/) || [])[1] || xcode.output.trim()
      results.push({ ...toolchainBase('xcode', 'Xcode'), status: 'ok', detail: `Xcode ${version}` })
    } else {
      results.push({
        ...toolchainBase('xcode', 'Xcode'),
        status: 'missing',
        detail: 'xcodebuild not found',
        hint: 'Install Xcode from the App Store, then `xcode-select --switch /Applications/Xcode.app`',
      })
    }
  }

  // CocoaPods (macOS only, iOS builds)
  if (!macOnly) {
    results.push({ ...toolchainBase('cocoapods', 'CocoaPods'), status: 'warning', detail: 'CocoaPods is macOS-only — skipped' })
  } else {
    const pod = checkers.run('pod', ['--version'])
    if (pod.success) {
      results.push({ ...toolchainBase('cocoapods', 'CocoaPods'), status: 'ok', detail: `CocoaPods ${pod.output.trim()}` })
    } else {
      results.push({
        ...toolchainBase('cocoapods', 'CocoaPods'),
        status: 'missing',
        detail: 'pod not found on PATH',
        hint: 'Install CocoaPods: `sudo gem install cocoapods` (or `brew install cocoapods`)',
      })
    }
  }

  // Metro dev server port
  if (checkers.portOpen(metroPort)) {
    results.push({ ...toolchainBase('metro-port', `Metro (port ${metroPort})`), status: 'ok', detail: `Dev server listening on port ${metroPort}` })
  } else {
    results.push({
      ...toolchainBase('metro-port', `Metro (port ${metroPort})`),
      status: 'warning',
      detail: `Nothing listening on port ${metroPort}`,
      hint: 'Start the dev server: `npm start` / `npx react-native start`',
    })
  }

  return results
}

/** Run the full doctor: enabled ecosystem items + native toolchain +
 * nightly-leaderboard readiness + model access + catalog health. */
export function runDoctor(
  root: string,
  checkers: DoctorCheckers,
  options?: ToolchainCheckOptions & LeaderboardCheckOptions & ModelAccessCheckOptions & DoctorCatalogOptions
): DoctorReport {
  const ecosystem = runEcosystemDoctor(root, checkers)
  const catalog = checkEcosystemCatalogHealth(root, checkers, { catalogRegistry: options?.catalogRegistry })
  const toolchain = checkNativeToolchain(root, checkers, options)
  const leaderboard = checkLeaderboardReadiness(root, checkers, options)
  const model = checkModelAccess(root, checkers, options, ecosystem.checks)
  const checks = [...ecosystem.checks, ...catalog]
  const all = [...checks, ...toolchain, ...leaderboard, ...model]
  return {
    ...ecosystem,
    checks,
    toolchain,
    leaderboard,
    model,
    flavor: ecosystem.flavor || detectProjectFlavor(root),
    okCount: all.filter(c => c.status === 'ok').length,
    missingCount: all.filter(c => c.status === 'missing').length,
    warningCount: all.filter(c => c.status === 'warning').length,
  }
}

/**
 * A single auto-fixable repair: the shell command to run and how to display it.
 * `manual` is true for checks that can't be safely auto-installed (GUI tools,
 * system-wide changes) — the CLI prints the hint and asks the user to run it.
 */
export interface DoctorFix {
  id: string
  name: string
  command: string
  args: string[]
  label: string
  manual: boolean
}

/** Outcome of attempting one fix. */
export interface FixAttempt {
  id: string
  name: string
  label: string
  status: 'fixed' | 'failed' | 'skipped-manual' | 'not-needed'
  detail: string
}

/** Injectable fix runner so the fix logic is unit-testable without side effects. */
export interface DoctorFixer {
  run: (command: string, args: string[], cwd?: string) => { success: boolean; output: string }
}

/**
 * Turn a missing check into an auto-installable command.
 *
 * - ecosystem mcp/tool/hook with a packageName → `npm install <pkg>` (MCPs
 *   install with `-D` since they are dev-time servers)
 * - ecosystem skill → the `npx skills add …` install string
 * - global-binary tools (fastlane/maestro/eas-cli) → gem/curl/npm -g
 * - toolchain JDK → `brew install --cask temurin@17` (macOS)
 * - toolchain Xcode/CocoaPods → `xcode-select --install` / `brew install cocoapods`
 * - Node / Android SDK / emulator / Metro → manual (GUI or system-wide change)
 */
export function fixForMissing(check: DoctorCheckResult, _root: string): DoctorFix | null {
  if (check.status !== 'missing') return null

  // ---- native toolchain fixes ----
  if (check.category === 'toolchain') {
    switch (check.id) {
      case 'node':
        return { id: check.id, name: check.name, command: 'nvm', args: ['install', '20'], label: 'nvm install 20 && nvm use 20', manual: true }
      case 'jdk':
        return { id: check.id, name: check.name, command: 'brew', args: ['install', '--cask', 'temurin@17'], label: 'brew install --cask temurin@17', manual: false }
      case 'android-sdk':
        return { id: check.id, name: check.name, command: '', args: [], label: 'Install Android Studio and export ANDROID_HOME', manual: true }
      case 'android-emulator':
        return { id: check.id, name: check.name, command: '', args: [], label: 'Install the emulator via Android Studio SDK Manager', manual: true }
      case 'xcode':
        return { id: check.id, name: check.name, command: 'xcode-select', args: ['--install'], label: 'xcode-select --install', manual: true }
      case 'cocoapods':
        return { id: check.id, name: check.name, command: 'brew', args: ['install', 'cocoapods'], label: 'brew install cocoapods', manual: false }
      default:
        return null
    }
  }

  // ---- nightly leaderboard readiness fixes ----
  if (check.category === 'leaderboard') {
    switch (check.id) {
      case 'lb-results-dir':
        return {
          id: check.id,
          name: check.name,
          command: 'mkdir',
          args: ['-p', 'bench/results'],
          label: 'mkdir -p bench/results',
          manual: false,
        }
      default:
        // API-key secrets and the local model download are environment/user
        // actions — surfaced as hints, not auto-run.
        return null
    }
  }

  const item = getEcosystemItem(check.id)

  // ---- skill: install directory missing → run the skills add command ----
  if (item?.category === 'skill') {
    const [command, ...rawArgs] = item.install.split(/\s+/)
    const args = rawArgs.map(a => a.replace(/^['"]|['"]$/g, ''))
    return { id: check.id, name: check.name, command, args, label: item.install, manual: false }
  }

  // ---- expo-mcp runs through the expo CLI, not a standalone package ----
  if (item?.id === 'expo-mcp') {
    return { id: check.id, name: check.name, command: 'npm', args: ['install', 'expo'], label: 'npm install expo', manual: false }
  }

  // ---- global binaries without an npm package ----
  if (item && !item.packageName && !packageFromInstall(item.install)) {
    const globals: Record<string, { command: string; args: string[]; label: string; manual?: boolean }> = {
      fastlane: { command: 'gem', args: ['install', 'fastlane'], label: 'gem install fastlane' },
      maestro: { command: 'curl', args: [], label: item.install, manual: true },
      'eas-cli': { command: 'npm', args: ['install', '-g', 'eas-cli'], label: 'npm install -g eas-cli' },
    }
    const globalFix = globals[item.id]
    if (globalFix) {
      return { id: check.id, name: check.name, command: globalFix.command, args: globalFix.args, label: globalFix.label, manual: globalFix.manual ?? false }
    }
  }

  // ---- npm package (mcp/tool/hook) ----
  const packageName = item?.packageName || (item ? packageFromInstall(item.install) : null)
  if (packageName) {
    // Dev-time tooling installs with -D (MCPs, husky, lint-staged, detox, …)
    // per the catalog's install string; -g for global CLIs (eas-cli).
    const install = item?.install || ''
    const flags: string[] = []
    if (item?.category === 'mcp' || /npm install -D/.test(install)) flags.push('-D')
    if (/npm install -g/.test(install)) flags.push('-g')
    return {
      id: check.id,
      name: check.name,
      command: 'npm',
      args: ['install', ...flags, packageName],
      label: `npm install ${flags.length > 0 ? flags.join(' ') + ' ' : ''}${packageName}`,
      manual: false,
    }
  }

  return null
}

/**
 * Attempt to fix every missing check. Manual fixes are reported as
 * `skipped-manual`; auto-fixes run through the injectable fixer and are
 * recorded as `fixed` or `failed`. Re-runs the doctor afterwards and returns
 * the before/after counts so the CLI can show what changed.
 */
export function runDoctorFixes(
  root: string,
  report: DoctorReport,
  fixer: DoctorFixer
): { attempts: FixAttempt[]; before: number; after: number } {
  const all = [...report.checks, ...report.toolchain, ...report.leaderboard, ...report.model]
  const attempts: FixAttempt[] = []

  for (const check of all) {
    if (check.status !== 'missing') continue
    const fix = fixForMissing(check, root)
    if (!fix) continue

    if (fix.manual) {
      attempts.push({ id: check.id, name: check.name, label: fix.label, status: 'skipped-manual', detail: 'Manual step — run it yourself' })
      continue
    }

    const result = fixer.run(fix.command, fix.args, root)
    attempts.push({
      id: check.id,
      name: check.name,
      label: fix.label,
      status: result.success ? 'fixed' : 'failed',
      detail: result.success ? 'Installed' : `Failed: ${result.output.trim().split(/\r?\n/)[0].slice(0, 140)}`,
    })
  }

  const before = report.missingCount
  const afterReport = runDoctor(root, fixerCheckersProxy(root, fixer))
  return { attempts, before, after: afterReport.missingCount }
}

/**
 * The fixer doubles as the re-check checker where possible: after installing a
 * package, `packageInstalled` resolves from node_modules at the project root.
 * Binary probes re-run through the fixer's `run`. The CLI passes a richer
 * checker that also knows about env/port; this proxy covers the common case and
 * is used by runDoctorFixes when the CLI supplies only a fixer.
 */
function fixerCheckersProxy(root: string, fixer: DoctorFixer): DoctorCheckers {
  return {
    packageInstalled(packageName: string): boolean {
      try {
        require.resolve(`${packageName}/package.json`, { paths: [root] })
        return true
      } catch (err) {
        reportError(err, `ecosystem: resolving package ${packageName}`)
        return false
      }
    },
    run(command: string, args: string[]): { success: boolean; output: string } {
      return fixer.run(command, args)
    },
    dirExists(dir: string): boolean {
      return existsSync(dir)
    },
    env: () => undefined,
    portOpen: () => false,
    platform: process.platform,
    // The fixer proxy has no model knowledge — report false so the local-model
    // check stays a warning after fixes (the model download is manual anyway).
    hasModel: () => false,
    writable(dir: string): boolean {
      return existsSync(dir)
    },
  }
}
