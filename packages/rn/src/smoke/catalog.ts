/**
 * Smoke check catalog — one check per CLI command, mirroring `vectalon --help`.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Each check runs the REAL command against the current project and captures
 * its full output. Checks that cannot run in a given project (missing source
 * files, no sync remote) return a skip reason; tier-gated commands are
 * classified as skip at runtime when the output announces a license gate.
 */
import { existsSync } from 'fs'
import { join } from 'path'
import type { SmokeCheck, SmokeContext } from './types'

/** First renderable source file (App entry or any src file) for impact/render. */
function firstSource(ctx: SmokeContext): string | null {
  return ctx.srcFiles[0] || null
}

export const SMOKE_CHECKS: SmokeCheck[] = [
  {
    id: 'version',
    name: 'CLI version',
    category: 'cli',
    args: () => ['--version'],
  },
  {
    id: 'help',
    name: 'CLI help / command surface',
    category: 'cli',
    args: () => ['--help'],
  },
  {
    id: 'init',
    name: 'Init (idempotent on initialized projects)',
    category: 'setup',
    args: () => ['init'],
    okExits: [0],
  },
  {
    id: 'status',
    name: 'Status screen',
    category: 'cli',
    args: () => ['status'],
  },
  {
    id: 'models',
    name: 'Model list',
    category: 'cli',
    args: () => ['models'],
  },
  {
    id: 'auth',
    name: 'Auth status',
    category: 'cli',
    args: () => ['auth', '--status'],
  },
  {
    id: 'policy',
    name: 'Guardrail policy',
    category: 'setup',
    args: () => ['policy'],
  },
  {
    id: 'refresh',
    name: 'Knowledge refresh (web intel)',
    category: 'setup',
    args: () => ['refresh'],
  },
  {
    id: 'suggestions',
    name: 'Improvement suggestions',
    category: 'setup',
    args: () => ['suggestions'],
  },
  {
    id: 'ecosystem',
    name: 'Ecosystem catalog',
    category: 'setup',
    args: () => ['ecosystem', '--category', 'mcp'],
  },
  {
    id: 'doctor',
    name: 'Doctor (diagnostics)',
    category: 'setup',
    args: () => ['doctor'],
    // Exit 1 is normal on a healthy-but-incomplete project (missing optional
    // toolchain items); a crash would still surface as non-0 with no report.
    okExits: [0, 1],
  },
  {
    id: 'impact',
    name: 'Impact analysis (blast radius)',
    category: 'analysis',
    args: ctx => ['impact', '--changed', firstSource(ctx) ?? 'src'],
    skipWhen: ctx => (firstSource(ctx) ? null : 'no source files to analyze'),
  },
  {
    id: 'coverage',
    name: 'Coverage dashboard',
    category: 'analysis',
    args: () => ['coverage'],
  },
  {
    id: 'intel',
    name: 'Project intelligence (manifest, deps, graphs, retrieval)',
    category: 'analysis',
    args: () => ['intel'],
  },
  {
    id: 'diagnostics',
    name: 'Project diagnostics (Metro, Hermes, Android/iOS builds, deps)',
    category: 'analysis',
    args: () => ['diagnostics'],
  },
  {
    id: 'generate',
    name: 'Code generation (component, dry-run)',
    category: 'analysis',
    args: () => ['generate', 'component', 'SmokeProbe', '--dry-run'],
  },
  {
    id: 'perf',
    name: 'Static performance scan (re-render, startup, bridge)',
    category: 'analysis',
    args: () => ['perf', '--json'],
  },
  {
    id: 'telemetry',
    name: 'Telemetry formats guide',
    category: 'analysis',
    args: () => ['telemetry', '--formats'],
  },
  {
    id: 'bundle',
    name: 'Bundle budget analysis (static)',
    category: 'analysis',
    args: () => ['bundle', '--static'],
  },
  {
    id: 'profile',
    name: 'Hermes profile analysis',
    category: 'analysis',
    args: () => ['profile'],
    // Needs a real .cpuprofile/.heapsnapshot input — cannot synthesize one.
    skipWhen: () => 'requires a Hermes .cpuprofile/.heapsnapshot input file',
  },
  {
    id: 'sandbox',
    name: 'Sandboxed execution',
    category: 'sandbox',
    args: () => ['sandbox', '--', 'node', '-e', 'console.log("ok")'],
  },
  {
    id: 'render',
    name: 'Headless render (Metro compile)',
    category: 'sandbox',
    args: ctx => ['render', '--entry', firstSource(ctx) ?? 'App.tsx'],
    skipWhen: ctx => (firstSource(ctx) ? null : 'no source file to render'),
  },
  {
    id: 'ci',
    name: 'CI workflow generation (dry-run)',
    category: 'release',
    args: () => ['ci', '--dry-run'],
  },
  {
    id: 'release',
    name: 'Release plan',
    category: 'release',
    args: () => ['release'],
  },
  {
    id: 'leaderboard',
    name: 'Leaderboard merge',
    category: 'release',
    args: () => ['leaderboard'],
    warnOnExits: [1],
  },
  {
    id: 'visual-ci',
    name: 'Visual CI (dry-run)',
    category: 'release',
    args: () => ['visual-ci', '--dry-run'],
  },
  {
    id: 'visual-baseline',
    name: 'Visual baselines (list)',
    category: 'release',
    args: () => ['visual-baseline', '--list'],
  },
  {
    id: 'ci-incident',
    name: 'CI incident triage (dry-run)',
    category: 'release',
    args: () => ['ci-incident', '--gate', 'quality', '--dry-run'],
  },
  {
    id: 'serve',
    name: 'MCP server boot',
    category: 'e2e',
    args: () => ['serve', '--protocol', 'http', '--port', '0', '--safe-mode'],
    probe: { ready: /serving via HTTP/i, timeoutMs: 45000 },
  },
  {
    id: 'daemon',
    name: 'Metro daemon (single probe pass)',
    category: 'e2e',
    args: () => ['daemon', '--once'],
    okExits: [0],
  },
  {
    id: 'sync',
    name: 'Team brain sync',
    category: 'team',
    args: () => ['sync'],
    skipWhen: ctx => (existsSync(join(ctx.root, '.vectalon', 'sync.json')) ? null : 'no sync remote configured (.vectalon/sync.json)'),
  },
  {
    id: 'team-policy',
    name: 'Team policy (effective)',
    category: 'team',
    args: () => ['team-policy', '--show'],
  },
  {
    id: 'team',
    name: 'Team brain (glossary, standards, expertise, decisions, onboarding)',
    category: 'team',
    args: () => ['team', '--json'],
  },
  {
    id: 'review',
    name: 'PR review (diff vs working tree, deterministic rules + team-brain standards)',
    category: 'analysis',
    args: () => ['review', '--json'],
  },
  {
    id: 'arch',
    name: 'Architecture review (cycles, layering, coupling, god modules, orphans)',
    category: 'analysis',
    args: () => ['arch', '--json'],
  },
  {
    id: 'sec',
    name: 'Security review (secrets, unsafe patterns, dependency advisories)',
    category: 'analysis',
    args: () => ['sec', '--json', '--no-audit'],
  },
  {
    id: 'build-fix',
    name: 'Build fix diagnosis (Metro/Gradle/Xcode log classification)',
    category: 'analysis',
    args: () => ['build-fix', '--json'],
  },
  {
    id: 'test-repair',
    name: 'Test repair diagnosis (Jest/Detox/Maestro log classification)',
    category: 'analysis',
    args: () => ['test-repair', '--json'],
  },
  {
    id: 'support',
    name: 'Support bundle guide',
    category: 'setup',
    args: () => ['support'],
  },
  // ---- Slow / model-heavy (only with --full) ----
  {
    id: 'feature',
    name: 'Feature workflow (full SDLC, dry-run adapters)',
    category: 'e2e',
    slow: true,
    args: () => ['feature', 'smoke verification', '--dry-run'],
  },
  {
    id: 'bench',
    name: 'Benchmark (deterministic)',
    category: 'e2e',
    slow: true,
    args: () => ['bench'],
  },
  {
    id: 'selftest',
    name: 'Full self-test',
    category: 'e2e',
    slow: true,
    args: () => ['selftest', '--no-open'],
  },
  {
    id: 'pull',
    name: 'Model download (already-downloaded fast path)',
    category: 'cli',
    slow: true,
    args: () => ['pull'],
  },
]

export function listSmokeChecks(): SmokeCheck[] {
  return SMOKE_CHECKS
}

export function getSmokeCheck(id: string): SmokeCheck | undefined {
  return SMOKE_CHECKS.find(c => c.id === id)
}
