/**
 * Deterministic agent catalog — one entry per repo so each platform's
 * harness can ship its own agent set. The page is data-driven: adding a
 * repo's agents is a data-only change here, no page edits.
 */

/** The three verdicts a deterministic agent can return — word plus color, never color alone. */
export const AGENT_VERDICTS = ['approved', 'needs-attention', 'changes-requested'] as const
export type AgentVerdict = (typeof AGENT_VERDICTS)[number]

/** Badge class per verdict — single source for the chip on the agents page and the report windows. */
export const VERDICT_BADGE: Record<AgentVerdict, string> = {
  approved: 'badge-ok',
  'needs-attention': 'badge-warn',
  'changes-requested': 'badge-danger',
}

/** Roadmap phases shipping deterministic agents (8-11) plus Archive & Share (12). */
export const AGENT_PHASES = [8, 9, 10, 11, 12] as const
export type AgentPhase = (typeof AGENT_PHASES)[number]

/** Report landing path inside the project — a directory (`docs/vectalon/<cmd>/`) or a specific file (dashboard). */
export type AgentReportPath = `docs/vectalon/${string}/` | `docs/vectalon/${string}.${string}`

export interface AgentInfo {
  /** CLI command, e.g. `review` — run as `vectalon <cmd>`. */
  cmd: string
  /** Full agent name. */
  name: string
  /** Roadmap item id (061-104). */
  item: string
  /** Roadmap phase this agent belongs to. */
  phase: AgentPhase
  /** One-to-two-sentence description of what the agent does. */
  summary: string
  /** Sample verdict — what a typical run returns. */
  verdict: AgentVerdict
  /** The condition that produces the sample verdict. */
  verdictFor: string
  /** Notable CLI flags beyond the universal `--json`. */
  flags?: string
  /** Where the report lands inside the project (gitignored). */
  report?: AgentReportPath
}

export type AgentRepo =
  | {
      slug: string
      name: string
      package: string
      status: 'live'
      tagline: string
      /** Live agents for this repo. */
      agents: AgentInfo[]
    }
  | {
      slug: string
      name: string
      package: string
      status: 'soon'
      tagline: string
      /** Planned surface, shown on the page until the harness ships. */
      planned: string[]
    }

const RN_AGENTS: AgentInfo[] = [
  // ── Phase 8 — Autonomous Engineering (061-070) ──────────────────────────
  {
    cmd: 'review',
    name: 'PR Review Agent',
    item: '061',
    phase: 8,
    summary:
      'Reviews the git diff against the project’s own derived coding standards — every added line probed line-level, with an optional LLM pass that degrades to the deterministic review when no model is configured.',
    verdict: 'needs-attention',
    verdictFor: 'any finding on the diff, or the LLM pass requests changes',
    flags: '--base <ref>',
  },
  {
    cmd: 'arch',
    name: 'Architecture Review Agent',
    item: '062',
    phase: 8,
    summary:
      'One pass over the module graph — circular dependencies, layering violations, god modules, over-coupling, wide fan-in, orphans, and over-deep nesting — with per-module coupling metrics.',
    verdict: 'needs-attention',
    verdictFor: 'a layering violation or god module is present',
    flags: '--src <dir> · --max-fanout · --max-depth',
  },
  {
    cmd: 'sec',
    name: 'Security Review Agent',
    item: '063',
    phase: 8,
    summary:
      'Scans for hardcoded secrets (every captured value redacted in reports), unsafe code patterns, and best-effort dependency advisories via npm audit.',
    verdict: 'changes-requested',
    verdictFor: 'a secret, critical advisory, or unsafe sink is found',
    flags: '--no-audit',
  },
  {
    cmd: 'build-fix',
    name: 'Build Fix Agent',
    item: '064',
    phase: 8,
    summary:
      'Diagnoses a failing Metro, Gradle, or Xcode build from its log — kind auto-detected, a pattern classifier returns the root cause, the standard fix, and corroborating symptoms as a fix plan.',
    verdict: 'changes-requested',
    verdictFor: 'a failing build is given (that is the point)',
    flags: '--log <path> · --metro | --gradle | --xcode',
  },
  {
    cmd: 'test-repair',
    name: 'Test Repair Agent',
    item: '065',
    phase: 8,
    summary:
      'Diagnoses a failing Jest, Detox, or Maestro run from its output — pattern databases per runner return the root cause with the standard fix and corroborating symptoms.',
    verdict: 'changes-requested',
    verdictFor: 'a failing test run is given (that is the point)',
    flags: '--log <path> · --jest | --detox | --maestro',
  },
  {
    cmd: 'refactor',
    name: 'Refactoring Agent',
    item: '066',
    phase: 8,
    summary:
      'Scans source for dead code (AST-backed), duplication, modernization opportunities, type smells, inline-style debt, console noise, and complexity — every finding line-pinned with a specific suggestion.',
    verdict: 'needs-attention',
    verdictFor: 'any dead code, duplication, or complexity finding',
  },
  {
    cmd: 'deps',
    name: 'Dependency Upgrade Agent',
    item: '067',
    phase: 8,
    summary:
      'Finds what to upgrade and the safe path — RN ecosystem pairing violations, duplicate versions across workspace members, and vulnerable dependencies via best-effort npm audit.',
    verdict: 'needs-attention',
    verdictFor: 'a pairing violation or duplicate version is found',
    flags: '--no-audit',
  },
  {
    cmd: 'a11y',
    name: 'Accessibility Agent',
    item: '068',
    phase: 8,
    summary:
      'One deterministic pass over component files — unlabeled images, touchables without roles, unlabeled inputs, and undersized touch targets below the 44×44pt guideline.',
    verdict: 'needs-attention',
    verdictFor: 'an unlabeled image or undersized target is found',
  },
  {
    cmd: 'release-ready',
    name: 'Release Readiness Agent',
    item: '069',
    phase: 8,
    summary:
      'Answers “can we ship?” — version past the last tag, CHANGELOG section, clean tree, CI present, lockfile, tests configured, secrets hygiene, TODO/FIXME triage — read-only git.',
    verdict: 'changes-requested',
    verdictFor: 'any error-severity check (missing CHANGELOG, dirty tree, …)',
  },
  {
    cmd: 'bug-fix',
    name: 'Autonomous Bug Fix Agent',
    item: '070',
    phase: 8,
    summary:
      'Proposes fixes for deterministic defects and executes the provably-safe ones — whole-line unused-import removal and var→const — with `--apply` refusing a dirty tree unless forced.',
    verdict: 'needs-attention',
    verdictFor: 'a fixable defect is detected (dry-run by default)',
    flags: '--apply · --force',
  },

  // ── Phase 9 — Release Engineering (071-079) ─────────────────────────────
  {
    cmd: 'crash',
    name: 'Crash Intelligence Agent',
    item: '071',
    phase: 9,
    summary:
      'Classifies an iOS, Android, or JavaScript crash log into a root-cause bucket (null-reference, module-resolution, resource, network, state-mutation, concurrency) with the standard fix and investigation steps.',
    verdict: 'changes-requested',
    verdictFor: 'a crash log is analyzed (error-severity root cause)',
    flags: '--log <path> · --platform <ios|android|js>',
  },
  {
    cmd: 'arch-score',
    name: 'Mobile Architecture Scorecard',
    item: '072',
    phase: 9,
    summary:
      'Scores the module graph 0–100 across circular dependencies, layer boundaries, coupling, module cohesion, testability, and nesting depth — with a letter grade and top improvements.',
    verdict: 'needs-attention',
    verdictFor: 'score 40–69 (grade C) — typical for a growing codebase',
    flags: '--src <dir>',
  },
  {
    cmd: 'cicd',
    name: 'CI/CD Intelligence Agent',
    item: '073',
    phase: 9,
    summary:
      'Scans CI workflow files for anti-patterns — actions pinned to tags instead of SHAs, missing concurrency and timeouts, inline secrets, deploys without a test gate, missing triggers — with other CI systems detected and named.',
    verdict: 'needs-attention',
    verdictFor: 'an unpinned action or missing concurrency group',
  },
  {
    cmd: 'app-store',
    name: 'App Store Readiness Agent',
    item: '074',
    phase: 9,
    summary:
      'Store-submission checks — version/version-code consistency across Info.plist, build.gradle, and package.json, app icons, the iOS privacy manifest, launch screen, ATS/cleartext posture, and permissions.',
    verdict: 'needs-attention',
    verdictFor: 'a version mismatch or missing privacy manifest',
  },
  {
    cmd: 'soc2',
    name: 'SOC2 Readiness Agent',
    item: '075',
    phase: 9,
    summary:
      'A repository-evidence checklist mapped to the five trust-service criteria plus operational hygiene — auth, secrets, lockfiles, CI, coverage, TLS, privacy policy, audit logs, backups, incident response — with a score.',
    verdict: 'needs-attention',
    verdictFor: 'any partial control (self-assessment, not an audit)',
  },
  {
    cmd: 'tokens',
    name: 'Design Token Sync Agent',
    item: '076',
    phase: 9,
    summary:
      'Flattens a style-dictionary-style token JSON and checks source for drift — tokens never referenced, hardcoded colors that should be tokens, and token pairs with identical values.',
    verdict: 'needs-attention',
    verdictFor: 'an orphaned token or hardcoded color is found',
  },
  {
    cmd: 'team-stats',
    name: 'Team Productivity Analytics',
    item: '077',
    phase: 9,
    summary:
      'One read-only git log derives commit cadence, author distribution, bus factor, category mix, and change velocity — warning on single-owner risk and low cadence.',
    verdict: 'approved',
    verdictFor: 'a healthy cadence with no single-owner risk',
  },
  {
    cmd: 'perms',
    name: 'Agent Permissions Audit',
    item: '078',
    phase: 9,
    summary:
      'Scans agent/MCP configuration for auto-approved shell and file-mutation tool grants, local-exec MCP servers, and credential-shaped values in config — errors redacted.',
    verdict: 'needs-attention',
    verdictFor: 'an auto-approved grant or credential-shaped value',
  },
  {
    cmd: 'dashboard',
    name: 'Engineering Dashboard',
    item: '079',
    phase: 9,
    summary:
      'Aggregates every agent report under docs/vectalon/* into one executive view — per-agent health cards, an overall verdict, and a self-contained HTML dashboard with drill-down, filtering, and search.',
    verdict: 'changes-requested',
    verdictFor: 'any agent report carries an error finding',
    flags: '--run · --cron · --open · --interval <sec>',
    report: 'docs/vectalon/dashboard/report.{md,json,html}',
  },

  // ── Phase 10 — Enterprise Intelligence (080-089) ────────────────────────
  {
    cmd: 'figma',
    name: 'Figma-to-code Sync Agent',
    item: '080',
    phase: 10,
    summary:
      'Parses a Figma design export and checks design↔code drift — design colors with no matching token or hardcoded value, component names with no source component, text styles with no font usage.',
    verdict: 'needs-attention',
    verdictFor: 'a design color with no source match',
  },
  {
    cmd: 'sentry',
    name: 'Sentry Intelligence Agent',
    item: '081',
    phase: 10,
    summary:
      'Ingests Sentry/Crashlytics telemetry exports, groups crashes into classes by exception type, ranks them by volume and distinct-user impact, and flags release regressions.',
    verdict: 'changes-requested',
    verdictFor: 'a crash class is critical or a release regression appears',
  },
  {
    cmd: 'observability',
    name: 'Mobile Observability Agent',
    item: '082',
    phase: 10,
    summary:
      'Audits instrumentation coverage in source — Sentry init, crash handlers, analytics SDK, network breadcrumbs, performance tracing — and flags slow traces and spans from telemetry.',
    verdict: 'needs-attention',
    verdictFor: 'missing instrumentation or a slow trace',
  },
  {
    cmd: 'governance',
    name: 'Enterprise Governance Agent',
    item: '083',
    phase: 10,
    summary:
      'A repository-evidence checklist — license, security policy, contributing guide, CODEOWNERS, PR template, lockfile/SBOM, Dependabot, CI — with pass/warn/fail statuses.',
    verdict: 'needs-attention',
    verdictFor: 'any missing governance artifact',
  },
  {
    cmd: 'audit',
    name: 'Org-wide Audit Trail Agent',
    item: '084',
    phase: 10,
    summary:
      'Validates the .vectalon/audit/*.jsonl trail — required fields, sequence continuity, malformed lines, secret-shaped values — and summarizes activity by actor and action.',
    verdict: 'approved',
    verdictFor: 'a clean, continuous trail with no secrets',
  },
  {
    cmd: 'repos',
    name: 'Multi-repository Memory Agent',
    item: '085',
    phase: 10,
    summary:
      'Verifies the .vectalon/repos.json workspace manifest — each sibling repo reachable, a git checkout, with a memory store — and flags missing or non-git entries.',
    verdict: 'needs-attention',
    verdictFor: 'a manifest entry is unreachable or memory-less',
  },
  {
    cmd: 'release-predict',
    name: 'Release Prediction Agent',
    item: '086',
    phase: 10,
    summary:
      'A deterministic 0–100 release-risk score from read-only git history — fix density, refactor density, staleness, breaking changes, author breadth in the release window — with a per-factor breakdown.',
    verdict: 'changes-requested',
    verdictFor: 'a fix-dense, stale, or breaking window (score ≥ 60)',
    flags: '--window <days>',
  },
  {
    cmd: 'play-store',
    name: 'Deep Play Store Readiness Agent',
    item: '087',
    phase: 10,
    summary:
      'Play-specific checks beyond the shared store surface — manifest permissions and the data-safety form they imply, exported components, backup rules, SDK levels, signing, and measured listing assets.',
    verdict: 'needs-attention',
    verdictFor: 'a permission not reflected in data-safety or a missing asset',
  },
  {
    cmd: 'dataset',
    name: 'Fine-tuning Dataset Agent',
    item: '088',
    phase: 10,
    summary:
      'Validates .vectalon/dataset/*.jsonl training data — schema consistency, duplicates, label balance, length outliers, and PII leakage (emails, phones, keys, SSNs).',
    verdict: 'needs-attention',
    verdictFor: 'a duplicate, imbalance, or PII leak is found',
  },
  {
    cmd: 'lora',
    name: 'LoRA Training Readiness Agent',
    item: '089',
    phase: 10,
    summary:
      'Checks the .vectalon/lora config — dataset path, base model with a VRAM estimate, r/alpha hyperparams, quantization, output dir, wandb — and flags what’s missing before training starts.',
    verdict: 'changes-requested',
    verdictFor: 'the config is missing or incomplete (that is the point)',
    flags: '--config <path>',
  },

  // ── Phase 11 — Platform & GitHub Intelligence (090-100) ────────────────
  {
    cmd: 'gh-pr',
    name: 'GitHub PR Triage Agent',
    item: '090',
    phase: 11,
    summary:
      'Scores every open PR for merge-readiness in one deterministic pass — age, draft state, size, review decision, CI check rollup, and mergeability — from the gh CLI or an export; degrades to an explicit no-data verdict when neither exists.',
    verdict: 'changes-requested',
    verdictFor: 'a stale, huge, or CI-failing PR is blocking merge',
    flags: '--file <path> · --max-prs <n>',
  },
  {
    cmd: 'gh-issue',
    name: 'GitHub Issue Intelligence Agent',
    item: '091',
    phase: 11,
    summary:
      'Turns the open-issue backlog into a triage queue — staleness ranking, unassigned gaps nobody owns, and label hygiene — so old issues stop being a background tax on every dev.',
    verdict: 'needs-attention',
    verdictFor: 'a stale or unassigned issue is in the backlog',
    flags: '--file <path> · --max <n>',
  },
  {
    cmd: 'gh-ci',
    name: 'GitHub Workflow Reliability Agent',
    item: '092',
    phase: 11,
    summary:
      'Detects flaky and slow CI before it costs a release — per-workflow failure rates, workflows that both pass and fail across their runs, and 30-minute-plus duration outliers.',
    verdict: 'needs-attention',
    verdictFor: 'a workflow fails more than 15% of runs or flips outcomes',
    flags: '--file <path> · --limit <n>',
  },
  {
    cmd: 'gh-sec',
    name: 'GitHub Security Posture Agent',
    item: '093',
    phase: 11,
    summary:
      'One security snapshot of the GitHub surface — open dependabot alerts, secret-scanning findings, and branch protection with review enforcement — plus remediation steps for every finding.',
    verdict: 'changes-requested',
    verdictFor: 'a critical dependabot alert or exposed secret is open',
    flags: '--file <path>',
  },
  {
    cmd: 'monitor',
    name: 'Observability Dashboard Agent',
    item: '094',
    phase: 11,
    summary:
      'Folds telemetry into one executive view — crash classes ranked by the Sentry agent, observability instrumentation findings, crash intelligence, the engineering-dashboard verdict, and raw telemetry event counts.',
    verdict: 'needs-attention',
    verdictFor: 'a telemetry surface carries a warning verdict',
  },
  {
    cmd: 'evals',
    name: 'Model Evaluation Harness',
    item: '095',
    phase: 11,
    summary:
      'Scores golden eval cases deterministically — exact, includes, or regex matching — and compares the pass rate against the previous run, flagging any regression bigger than five points.',
    verdict: 'needs-attention',
    verdictFor: 'a golden case fails or the pass rate regresses',
    flags: '--cases <path>',
  },
  {
    cmd: 'search',
    name: 'Semantic Code Search Agent',
    item: '096',
    phase: 11,
    summary:
      'Sub-second, line-pinned search across the source tree — term matches ranked by density so files that are mostly about the topic surface first, with a no-results verdict that tells you to broaden the query.',
    verdict: 'approved',
    verdictFor: 'any match is found (no-results otherwise)',
    flags: '--query <terms> · --limit <n>',
  },
  {
    cmd: 'incident',
    name: 'Incident Commander Agent',
    item: '097',
    phase: 11,
    summary:
      'From a crash log — or the latest crash report — to an incident brief: root-cause bucket via the shared analyzer, hot files with their recent commits, release risk from the prediction agent, and next steps.',
    verdict: 'changes-requested',
    verdictFor: 'an error-severity crash is analyzed',
    flags: '--log <path>',
  },
  {
    cmd: 'train',
    name: 'Release Train Automation',
    item: '098',
    phase: 11,
    summary:
      'Dry-run release planning across every workspace repo — version versus the last tag, changelog section present, clean tree, and a suggested semver bump from recent commit types. Read-only: the plan is the deliverable.',
    verdict: 'changes-requested',
    verdictFor: 'a repo is missing a version or changelog section, or is dirty',
  },
  {
    cmd: 'cost',
    name: 'Cost Governance Agent',
    item: '099',
    phase: 11,
    summary:
      'Estimates cloud + model spend from project config — LoRA GPU-hours at the VRAM class, eval inference tokens, dataset bytes — with the rate assumptions printed so the estimate is auditable.',
    verdict: 'approved',
    verdictFor: 'no warning-level spend finding (estimates are labeled estimates)',
  },
  {
    cmd: 'dx',
    name: 'DX Scoring Agent',
    item: '100',
    phase: 11,
    summary:
      'One 0–100 developer-experience score from local evidence — README, contributing guide, docs, CI, tests, lint, strict types, changelog, onboarding — across twelve weighted axes with the top gains ranked.',
    verdict: 'needs-attention',
    verdictFor: 'score between 50 and 69 (grade C)',
  },
  // ── Phase 12 — Archive & Share (101-104) ─────────────────────────────────
  {
    cmd: 'archive',
    name: 'Build Archive Agent',
    item: '101',
    phase: 12,
    summary:
      'Builds (or ingests a pre-built) IPA/APK/AAB, computes its SHA-256, and writes a typed BuildManifest with full provenance — git commit, flavor, environment, build number, platform — stored under .vectalon/builds/. Zero-config flavor detection from Gradle productFlavors, Xcode schemes, and eas.json profiles.',
    verdict: 'approved',
    verdictFor: 'a build is archived with a checksum and a manifest',
    flags: '--flavor · --platform · --no-build --artifact <path> · --list · --init · --dry-run',
    report: 'docs/vectalon/archive/',
  },
  {
    cmd: 'distribute',
    name: 'Distribution Agent',
    item: '102',
    phase: 12,
    summary:
      'Deploys an archived build to TestFlight, the Google Play Store, the SaaS portal, or a generated white-label portal. Credentials are never stored — Fastlane/EAS/Expo or direct API env vars are detected and delegated, or actionable instructions are printed. --dry-run plans without side effects.',
    verdict: 'approved',
    verdictFor: 'a dry-run plan resolves a build and target (real uploads need credentials)',
    flags: '--target <testflight|play-store|saas|portal> · --track · --latest · --dry-run',
    report: 'docs/vectalon/distribute/',
  },
  {
    cmd: 'share',
    name: 'Local Share Agent',
    item: '103',
    phase: 12,
    summary:
      'Serves an archived build on an ephemeral static install page — download link, optional tunnel (ngrok/localtunnel), optional QR code, and auto-shutdown after --expires. Free tier; nothing leaves your machine unless the tunnel is enabled.',
    verdict: 'approved',
    verdictFor: 'an archived build is served with a URL (no build → explicit no-data verdict)',
    flags: '--build <id> · --tunnel · --qr · --expires <30m|2h>',
    report: 'docs/vectalon/share/',
  },
  {
    cmd: 'portal',
    name: 'White-label Portal Agent',
    item: '104',
    phase: 12,
    summary:
      'Generates a self-contained static build portal (SSG) from the archive store — a listing page plus per-build detail pages with install instructions and an embedded builds.json. --deploy prints the vercel/netlify command; --deploy static exports the site for any host.',
    verdict: 'approved',
    verdictFor: 'the portal is generated from the archive store',
    flags: '--generate · --out <dir> · --domain · --branding · --deploy <static|vercel|netlify>',
    report: 'docs/vectalon/portal/',
  },
]

const SOON_REPOS: AgentRepo[] = [
  {
    slug: 'ios',
    name: 'iOS',
    package: '@vectalon-dev/ios',
    status: 'soon',
    tagline: 'Swift + SwiftUI harness — Figma-accurate codegen, safe-area linting, Xcode healing.',
    planned: ['swift codegen from Figma', 'auto-layout & safe-area lint', 'xcode build healing', 'dependency health'],
  },
  {
    slug: 'android',
    name: 'Android',
    package: '@vectalon-dev/android',
    status: 'soon',
    tagline: 'Kotlin + Compose harness — Gradle health, manifest linting, emulator control.',
    planned: ['manifest & permission lint', 'gradle/AGP health', 'compose codegen', 'emulator control'],
  },
  {
    slug: 'flutter',
    name: 'Flutter',
    package: '@vectalon-dev/flutter',
    status: 'soon',
    tagline: 'Dart + Widget harness — pub.dev health, widget-test generation, golden checks.',
    planned: ['pub.dev dependency health', 'widget-test generation', 'golden visual checks', 'accessibility checks'],
  },
]

export const AGENT_REPOS: AgentRepo[] = [
  {
    slug: 'react-native',
    name: 'React Native',
    package: '@vectalon-dev/rn',
    status: 'live',
    tagline: 'The full harness — 44 deterministic agents across five phases.',
    agents: RN_AGENTS,
  },
  ...SOON_REPOS,
]

export const AGENT_PHASE_LABELS = {
  8: 'phase 8 · autonomous engineering',
  9: 'phase 9 · release engineering',
  10: 'phase 10 · enterprise intelligence',
  11: 'phase 11 · platform & github intelligence',
  12: 'phase 12 · archive & share',
} satisfies Record<AgentPhase, string>

export function agentRepo(slug: string): AgentRepo | undefined {
  return AGENT_REPOS.find(r => r.slug === slug)
}

export function isLiveRepo(repo: AgentRepo): repo is Extract<AgentRepo, { status: 'live' }> {
  return repo.status === 'live'
}

export const DEFAULT_REPO = 'react-native'
