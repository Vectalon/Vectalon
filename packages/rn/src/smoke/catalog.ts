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
    id: 'refactor',
    name: 'Refactor scan (dead code, duplication, modernization, type smells)',
    category: 'analysis',
    args: () => ['refactor', '--json'],
  },
  {
    id: 'deps',
    name: 'Dependency upgrade scan (pairing, duplicates, vulnerabilities)',
    category: 'analysis',
    args: () => ['deps', '--json', '--no-audit'],
  },
  {
    id: 'a11y',
    name: 'Accessibility scan (labels, roles, touch targets)',
    category: 'analysis',
    args: () => ['a11y', '--json'],
  },
  {
    id: 'release-ready',
    name: 'Release readiness checklist',
    category: 'analysis',
    args: () => ['release-ready', '--json'],
  },
  {
    id: 'bug-fix',
    name: 'Autonomous bug-fix scan (propose fixes)',
    category: 'analysis',
    args: () => ['bug-fix', '--json'],
  },
  {
    id: 'crash',
    name: 'Crash log classification',
    category: 'analysis',
    args: () => ['crash', '--json'],
  },
  {
    id: 'arch-score',
    name: 'Architecture scorecard',
    category: 'analysis',
    args: () => ['arch-score', '--json'],
  },
  {
    id: 'cicd',
    name: 'CI/CD workflow scan',
    category: 'analysis',
    args: () => ['cicd', '--json'],
  },
  {
    id: 'app-store',
    name: 'App store readiness',
    category: 'analysis',
    args: () => ['app-store', '--json'],
  },
  {
    id: 'soc2',
    name: 'SOC2 readiness checklist',
    category: 'analysis',
    args: () => ['soc2', '--json'],
  },
  {
    id: 'tokens',
    name: 'Design token sync scan',
    category: 'analysis',
    args: () => ['tokens', '--json'],
  },
  {
    id: 'team-stats',
    name: 'Team productivity analytics',
    category: 'analysis',
    args: () => ['team-stats', '--json'],
  },
  {
    id: 'perms',
    name: 'Agent permissions audit',
    category: 'analysis',
    args: () => ['perms', '--json'],
  },
  {
    id: 'dashboard',
    name: 'Engineering dashboard',
    category: 'analysis',
    args: () => ['dashboard', '--json'],
  },
  {
    id: 'figma',
    name: 'Figma-to-code sync',
    category: 'analysis',
    args: () => ['figma', '--json'],
  },
  {
    id: 'sentry',
    name: 'Sentry intelligence',
    category: 'analysis',
    args: () => ['sentry', '--json'],
  },
  {
    id: 'observability',
    name: 'Observability audit',
    category: 'analysis',
    args: () => ['observability', '--json'],
  },
  {
    id: 'governance',
    name: 'Enterprise governance',
    category: 'analysis',
    args: () => ['governance', '--json'],
  },
  {
    id: 'audit',
    name: 'Org-wide audit trail',
    category: 'analysis',
    args: () => ['audit', '--json'],
  },
  {
    id: 'repos',
    name: 'Multi-repository memory',
    category: 'analysis',
    args: () => ['repos', '--json'],
  },
  {
    id: 'release-predict',
    name: 'Release prediction',
    category: 'analysis',
    args: () => ['release-predict', '--json'],
  },
  {
    id: 'play-store',
    name: 'Deep Play Store readiness',
    category: 'analysis',
    args: () => ['play-store', '--json'],
  },
  {
    id: 'dataset',
    name: 'Fine-tuning dataset',
    category: 'analysis',
    args: () => ['dataset', '--json'],
  },
  {
    id: 'lora',
    name: 'LoRA training readiness',
    category: 'analysis',
    args: () => ['lora', '--json'],
  },
  {
    id: 'gh-pr',
    name: 'GitHub PR triage',
    category: 'analysis',
    args: () => ['gh-pr', '--json'],
  },
  {
    id: 'gh-issue',
    name: 'GitHub issue intelligence',
    category: 'analysis',
    args: () => ['gh-issue', '--json'],
  },
  {
    id: 'gh-ci',
    name: 'GitHub workflow reliability',
    category: 'analysis',
    args: () => ['gh-ci', '--json'],
  },
  {
    id: 'gh-sec',
    name: 'GitHub security posture',
    category: 'analysis',
    args: () => ['gh-sec', '--json'],
  },
  {
    id: 'monitor',
    name: 'Observability dashboard',
    category: 'analysis',
    args: () => ['monitor', '--json'],
  },
  {
    id: 'evals',
    name: 'Model evaluation harness',
    category: 'analysis',
    args: () => ['evals', '--json'],
  },
  {
    id: 'search',
    name: 'Semantic code search',
    category: 'analysis',
    args: () => ['search', '--query', 'vectalon', '--json'],
  },
  {
    id: 'incident',
    name: 'Incident commander brief',
    category: 'analysis',
    args: () => ['incident', '--json'],
  },
  {
    id: 'train',
    name: 'Release train (dry-run)',
    category: 'analysis',
    args: () => ['train', '--json'],
  },
  {
    id: 'cost',
    name: 'Cost governance estimate',
    category: 'analysis',
    args: () => ['cost', '--json'],
  },
  {
    id: 'dx',
    name: 'DX scoring',
    category: 'analysis',
    args: () => ['dx', '--json'],
  },
  {
    id: 'support',
    name: 'Support bundle guide',
    category: 'setup',
    args: () => ['support'],
  },
  // ---- Archive & Share (dry-run by default; deterministic, no side effects) ----
  {
    id: 'archive',
    name: 'Archive build (dry-run plan)',
    category: 'release',
    args: () => ['archive', '--dry-run', '--json'],
  },
  {
    id: 'archive-list',
    name: 'List archived builds',
    category: 'release',
    args: () => ['archive', '--list', '--json'],
  },
  {
    id: 'distribute',
    name: 'Distribution targets + dry-run plan',
    category: 'release',
    args: () => ['distribute', '--list-targets', '--json'],
  },
  {
    id: 'portal',
    name: 'Portal generation (SSG, temp output)',
    category: 'release',
    args: () => ['portal', '--generate', '--out', '.vectalon/smoke-portal', '--json'],
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
