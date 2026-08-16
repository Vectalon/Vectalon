import Link from 'next/link'
import type { CSSProperties } from 'react'
import { FeatureIcon, type FeatureIconName } from '../components/FeatureIcon'
import { DemoPlayer } from '../components/DemoPlayer'
import { TypePrompt, type TypePromptHeadline } from '../components/TypePrompt'
import { FeedAge } from '../components/FeedAge'
import HeroHeadline from '../components/HeroHeadline'
import { fetchIntelFeed, type IntelItem } from '../lib/intel'

const SDK_CHIPS = [
  { slug: 'react-native', name: 'react-native', status: 'live' },
  { slug: 'ios', name: 'ios', status: 'soon' },
  { slug: 'android', name: 'android', status: 'soon' },
  { slug: 'flutter', name: 'flutter', status: 'soon' },
]

const FEATURES: Array<{ title: string; body: string; icon: FeatureIconName }> = [
  {
    title: 'MCP-native agent',
    body: 'A local model runs as an agent over 58 project-aware tools — feature workflows, code review, upgrades, E2E generation, device control — all through the MCP protocol your editor already speaks. On top of the model sits a fleet of 44 deterministic agents (review, security, SOC 2, GitHub PR triage, DX scoring, build archive) that need no model at all.',
    icon: 'robot',
  },
  {
    title: 'Self-maintaining knowledge',
    body: 'Init scans your repo and builds a living knowledge graph; serve re-seeds it hourly. Every run is distilled into L0→L3 project memory — the project teaches the model, and the model never works from a generic guess.',
    icon: 'brain',
  },
  {
    title: 'Always-current model',
    body: 'Web intel pipelines (RN releases, Expo changelog, Hacker News, GitHub trending, Callstack) feed the model’s system prompt, so it knows 0.87-rc before the release notes do.',
    icon: 'broadcast',
  },
  {
    title: 'Upgrade Copilot',
    body: 'rn-diff-purge diffs, AST-grade impact analysis, and codemods — plan and apply React Native upgrades with every native and JS/TS change mapped out.',
    icon: 'wrench',
  },
  {
    title: 'Guardrails on save',
    body: 'Platform best-practices rules (Pressable, no leaked renders, New Architecture hazards) run in your editor and in code review — with hallucination-verified findings.',
    icon: 'shield',
  },
  {
    title: 'Compile-checked healing',
    body: 'Every agent fix is typechecked before it lands. A fix that doesn’t reduce errors is reverted. Generated code renders headlessly in a sandbox before you see it.',
    icon: 'check',
  },
  {
    title: 'Impact regression coverage',
    body: 'Changed files map to affected screens (AST-driven, no model calls), each one gets a Maestro regression flow — with accessibility variants for screens covered by a11y criteria. Screens with no deterministic route are flagged, followed up, and tracked in a coverage dashboard (`vectalon coverage`).',
    icon: 'shield',
  },
]

const MCP_CLIENTS = ['claude code', 'cursor', 'copilot', 'codex', 'gemini', 'zed', 'windsurf', 'opencode']

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What do I need to run Vectalon?',
    a: 'Node.js ≥ 20.12 on macOS or Linux. npx vectalon init scans your repo and builds the knowledge graph; vectalon serve starts the MCP server your agent connects to.',
  },
  {
    q: 'Does it need a model?',
    a: 'The optional model-driven agent does — but the 44 deterministic commands (review, security, SOC 2, GitHub PR triage, incident command, build archive, …) need no model at all. They run offline with a report and a verdict, zero model calls, free on every tier. Deterministic means reproducible, not static: every run re-scans your project’s current state, so the results are as fresh as your last command.',
  },
  {
    q: 'Do the deterministic agents go stale?',
    a: 'No — every run reads the project as it is right now: source files, git history, CI config, and telemetry exports are scanned at run time, and the GitHub family (gh-pr, gh-issue, gh-ci, gh-sec) queries the live gh CLI, so a report always reflects now, not a cached snapshot. The one cyclical input — ecosystem knowledge and web intel — auto-refreshes hourly under vectalon serve, or on demand with vectalon refresh; and when a data source is missing, an agent returns an explicit no-data verdict rather than guessing.',
  },
  {
    q: 'Which platforms are supported?',
    a: 'React Native is live at v0.12.0. iOS, Android, and Flutter harnesses are in development — join the waitlist and we’ll email the moment a beta opens.',
  },
  {
    q: 'How is it different from other AI coding tools?',
    a: 'Deterministic and compile-checked. Agents produce the same result on any machine, every fix is typechecked before it lands and reverted if it doesn’t reduce errors, and the benchmark suite measures 33 scenarios against human references (92% guardrail pass rate).',
  },
  {
    q: 'What does it cost, and what’s the license?',
    a: 'The free tier is genuinely useful — init, serve, feature, doctor, and all 44 agents, no card. Pro $19/mo, All-Access $49/mo, Team $99/seat/mo, each with a 14-day trial. Business Source License 1.1: free for personal, education, and OSS use and teams up to three devs; MIT after four years.',
  },
]

const STATS = [
  { value: '92%', label: 'guardrail pass rate' },
  { value: '13', label: 'benchmark scenarios' },
  { value: '58', label: 'project-aware tools' },
  { value: '13', label: 'workflow phases' },
]

const STEPS = [
  {
    cmd: 'vectalon init',
    title: 'Scan & seed',
    body: 'Point it at your repo. Vectalon scans structure, dependencies, and conventions, then builds the project knowledge graph — L0→L3 memory the model works from.',
  },
  {
    cmd: 'vectalon serve',
    title: 'The agent loop',
    body: 'A local MCP-aware model works your codebase with 58 project-aware tools, re-seeding ecosystem intel every hour so it never works from stale knowledge.',
  },
  {
    cmd: 'vectalon feature "…"',
    title: 'Generate & heal',
    body: 'Describe a task. You get compile-checked code, tests, and a code review — fixes are typechecked and reverted if they don’t reduce errors.',
  },
]

const GUARDRAILS = [
  { name: 'Pressable over TouchableOpacity', state: 'pass' },
  { name: 'no leaked renders', state: 'pass' },
  { name: 'New Architecture hazards', state: 'pass' },
  { name: 'bundle budget deltas', state: 'watch' },
]

const HEALING_LOG = [
  '◆ [5/13] Implementation ▸ yarn test   ✓ (2.1s)',
  '✔ Compile-checked: 0 errors after 2 healing passes',
  '✦ 13/13 phases — index.md · 3 lessons distilled',
  '◆ rn-diff-purge diff fetched: 0.85.3 → 0.86.2',
  '✔ 42 template changes mapped (14 native · 28 JS/TS)',
]

const AGENT_PHASES: Array<{
  phase: string
  title: string
  body: string
  cmds: string[]
}> = [
  {
    phase: 'Phase 8',
    title: 'Autonomous engineering',
    body: 'Review the diff, audit the architecture, scan for secrets, diagnose a broken build or test run, propose safe refactors — and, for provably-safe fixes, apply them.',
    cmds: ['review', 'arch', 'sec', 'build-fix', 'test-repair', 'refactor', 'deps', 'a11y', 'release-ready', 'bug-fix'],
  },
  {
    phase: 'Phase 9',
    title: 'Release engineering',
    body: 'Classify crashes, score the architecture, police CI/CD workflows, check store surfaces, gather SOC 2 evidence, and aggregate everything into one executive dashboard.',
    cmds: ['crash', 'arch-score', 'cicd', 'app-store', 'soc2', 'tokens', 'team-stats', 'perms', 'dashboard'],
  },
  {
    phase: 'Phase 10',
    title: 'Enterprise intelligence',
    body: 'Sync design to code, rank crash classes, audit instrumentation, verify org evidence, predict release risk, and validate training data before you spend GPU time.',
    cmds: ['figma', 'sentry', 'observability', 'governance', 'audit', 'repos', 'release-predict', 'play-store', 'dataset', 'lora'],
  },
]

const TERMINAL_SESSION = `$ npx vectalon init
✔ rn-vectalon initialized — knowledge base seeded (5 artifacts)
ℹ Detected React Native CLI (bare) · 26 ecosystem items enabled

$ npx vectalon feature "login screen with auth API"
◆ [5/13] Implementation ▸ yarn test   ✓ (2.1s)
✔ Compile-checked: 0 errors after 2 healing passes
✦ 13/13 phases — index.md · 3 lessons distilled

$ npx vectalon upgrade --diff
◆ rn-diff-purge diff fetched: 0.85.3 → 0.86.2
✔ 42 template changes mapped (14 native · 28 JS/TS)
$`

function IntelRow({
  item,
  variant,
  ariaHidden,
}: {
  item: IntelItem
  variant: 'compact' | 'large'
  ariaHidden?: boolean
}) {
  const labelCls =
    variant === 'compact'
      ? 'min-w-0 truncate text-slate-300'
      : 'min-w-0 truncate text-slate-200'
  const sourceCls = variant === 'compact' ? 'shrink-0 text-slate-600' : 'shrink-0 text-xs text-slate-500'
  return (
    <li
      aria-hidden={ariaHidden}
      className={
        variant === 'compact'
          ? 'flex items-center justify-between gap-3 px-1 py-[7px] font-mono text-[11px]'
          : 'flex items-center justify-between gap-3 px-5 py-3 font-mono text-[13px]'
      }
    >
      {item.href ? (
        <a
          href={item.href}
          target="_blank"
          rel="noreferrer"
          title={item.label}
          className={`${labelCls} transition hover:text-brand`}
        >
          {item.label}
        </a>
      ) : (
        <span className={labelCls}>{item.label}</span>
      )}
      {item.meta ? (
        <span className={`shrink-0 font-mono text-brand ${variant === 'compact' ? 'text-[11px]' : 'text-xs'}`}>
          ★ {item.meta}
        </span>
      ) : (
        <span className={sourceCls}>{item.source}</span>
      )}
    </li>
  )
}

export default async function Home() {
  const intel = await fetchIntelFeed()
  const intelFetchedAt = Date.now()

  // Real headlines for the hero prompt rotation — Expo changelog and HN
  // titles read like news; release versions and repo names don't.
  const heroHeadlines: TypePromptHeadline[] = intel
    .filter(i => i.source === 'Expo changelog' || i.source === 'Hacker News')
    .map(i => ({ label: i.label, tag: i.source === 'Hacker News' ? 'HN' : 'Expo' }))
    .slice(0, 4)

  return (
    <>
      {/* Hero — the console: statusline, three live panes, one prompt */}
      <section className="relative overflow-hidden">
        <div className="scanlines pointer-events-none absolute inset-0" aria-hidden />
        {/* Phosphor beam — the console's authored focal moment (see globals.css) */}
        <div className="beam js-loop" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:pt-14">
          <div className="console animate-fade-up">
            <div className="flex items-center justify-between border-b border-ink-700/70 bg-ink-900/90 px-3.5 py-2 font-mono text-[11px] text-slate-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="text-brand">▣</span>
                  vectalon main
                </span>
                <span className="hidden sm:inline">bench 90%</span>
                <span className="hidden md:inline">intel 26 live</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="hidden items-center gap-1.5 sm:flex">
                  <span className="live-dot" aria-hidden />
                  guardrails on
                </span>
                <span className="text-slate-600">[ 0.87-rc ]</span>
              </div>
            </div>

            <div className="px-5 py-9 sm:px-9 sm:py-12">
              {/* Hero headline A/B — variant B is the works-offline positioning (see HeroHeadline) */}
              <HeroHeadline />

              <div className="mt-9 grid animate-fade-up gap-3 md:grid-cols-3" style={{ animationDelay: '180ms' }}>
                {/* Pane 1 — intel feed (live) */}
                <div className="card !p-4">
                  <div className="pane-head">
                    <span>intel feed</span>
                    <span className="flex items-center gap-1.5 !normal-case tracking-normal text-slate-500">
                      <span className="live-dot" aria-hidden />
                      live
                      <span className="hidden sm:inline">·</span>
                      <FeedAge fetchedAt={intelFetchedAt} />
                    </span>
                  </div>
                  <div className="ticker mt-3 h-[9.5rem]">
                    <ul className="ticker-inner">
                      {[...intel, ...intel].map((item, i) => (
                        <IntelRow key={i} item={item} variant="compact" ariaHidden={i >= intel.length} />
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Pane 2 — guardrails */}
                <div className="card !p-4">
                  <div className="pane-head">
                    <span>guardrails</span>
                  </div>
                  <ul className="mt-3 space-y-2.5 font-mono text-[12px]">
                    {GUARDRAILS.map(g => (
                      <li key={g.name} className="flex items-center justify-between gap-3">
                        <span className="text-slate-300">{g.name}</span>
                        {g.state === 'pass' ? (
                          <span className="text-emerald-500 dark:text-emerald-400">✓ pass</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">◈ watch</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 border-t border-ink-700/60 pt-2.5 font-mono text-[11px] text-slate-500">
                    hallucination-verified · in editor + review
                  </div>
                </div>

                {/* Pane 3 — healing log */}
                <div className="card !p-4">
                  <div className="pane-head">
                    <span>healing log</span>
                    <span className="!normal-case tracking-normal text-slate-500">vectalon feature</span>
                  </div>
                  <ul className="mt-3 space-y-2.5 font-mono text-[11px] leading-relaxed">
                    {HEALING_LOG.map((l, i) => (
                      <li key={i} className="text-slate-400">
                        {l.startsWith('✔') ? (
                          <span className="text-emerald-500 dark:text-emerald-400">✔</span>
                        ) : l.startsWith('◆') ? (
                          <span className="text-slate-500">◆</span>
                        ) : (
                          <span className="text-slate-500">✦</span>
                        )}
                        <span className="ml-1.5">{l.slice(1)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Prompt — the primary action */}
              <div
                className="mt-9 flex animate-fade-up flex-col gap-4 rounded-[3px] border border-ink-700 bg-ink-900 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                style={{ animationDelay: '240ms' }}
              >
                <p className="font-mono text-sm text-slate-300">
                  <TypePrompt headlines={heroHeadlines} />
                </p>
                <div className="flex flex-wrap gap-3">
                  <a href="#demo" className="btn-primary">
                    See it run
                  </a>
                  <Link href="/pricing" className="btn-ghost">
                    Compare plans
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform statusline strip */}
      <section className="border-t border-ink-700/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 font-mono md:flex-row md:items-center md:justify-between">
          <span className="text-xs text-slate-500">one harness, four platforms</span>
          <div className="flex flex-wrap gap-2">
            {SDK_CHIPS.map(sdk => (
              <Link
                key={sdk.slug}
                href={`/sdk/${sdk.slug}`}
                className="chip transition hover:border-brand/50 hover:text-brand"
              >
                <span
                  className={sdk.status === 'live' ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-600'}
                  aria-hidden
                >
                  {sdk.status === 'live' ? '●' : '○'}
                </span>
                {sdk.name}
                <span className={sdk.status === 'live' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>
                  {sdk.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Works with — one MCP server, every client. The product exposes the
          MCP protocol (vectalon serve), so the compat story is a list of the
          clients that speak it — not a claim about any single integration. */}
      <section className="border-t border-ink-700/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 font-mono md:flex-row md:items-center md:justify-between">
          <span className="micro shrink-0">one mcp server — every client</span>
          <div className="flex flex-wrap justify-center gap-2 md:justify-end">
            {MCP_CLIENTS.map(c => (
              <code key={c} className="chip transition hover:border-brand/50 hover:text-brand">
                {c}
              </code>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — one recorded session */}
      <section className="border-t border-ink-700/70 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-slate-50">One loop, three commands</h2>
            <p className="mt-3 text-slate-400">
              The whole workflow — context, generation, verification — is a CLI loop. No IDE
              plugin, no dashboard, no state to sync.
            </p>
          </div>
          <div className="console mt-12">
            <div className="console-head">
              <span>vectalon — session</span>
              <span className="hidden items-center gap-1.5 sm:flex">
                <span className="live-dot" aria-hidden />
                live
              </span>
            </div>
            <div className="divide-y divide-ink-700/60">
              {STEPS.map((s, i) => (
                <div
                  key={s.title}
                  className="reveal grid gap-3 px-5 py-6 sm:px-7 md:grid-cols-[260px_1fr] md:gap-8"
                  style={{ '--reveal-delay': `${i * 90}ms` } as CSSProperties}
                >
                  <div>
                    <div className="font-mono text-sm text-brand">
                      <span>$</span> {s.cmd}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-600">
                      [ step 0{i + 1} / 03 ]
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-50">{s.title}</h3>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-400">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Video demo — a console session */}
      <section id="demo" className="border-t border-ink-700/70 py-20">
        <div className="mx-auto max-w-4xl px-4">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-slate-50">Watch it run — 85 seconds, no cuts</h2>
            <p className="mt-3 text-sm text-slate-400">
              The real CLI on a real 19-screen Expo app — init, arch, sec, feature, bench.
            </p>
          </div>
          <DemoPlayer />
        </div>
      </section>

      {/* Benchmark statusline */}
      <section className="border-t border-ink-700/70">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="statusline !border-0 !bg-transparent">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className="reveal seg !block !px-6 !py-4 text-center"
                style={{ '--reveal-delay': `${i * 90}ms` } as CSSProperties}
              >
                <div className="font-display text-3xl font-bold text-brand">{s.value}</div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-slate-500">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-7 text-center">
            <Link href="/benchmarks" className="text-sm text-brand transition hover:text-brand-strong hover:underline">
              Full leaderboard — 11 RN scenarios, measured against human references →
            </Link>
          </div>
        </div>
      </section>

      {/* Features — pane grid */}
      <section className="border-t border-ink-700/70 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-slate-50">What it does for you</h2>
            <p className="mt-3 text-slate-400">
              One harness for the whole loop — context, generation, verification, and upgrade —
              with the model and knowledge base maintained by Vectalon, not you.
            </p>
          </div>
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`reveal card flex flex-col transition hover:-translate-y-0.5 hover:border-brand/50 ${
                  i === 0 || i === FEATURES.length - 1 ? 'sm:col-span-2 lg:col-span-2' : ''
                }`}
                style={{ '--reveal-delay': `${(i % 3) * 90}ms` } as CSSProperties}
              >
                <FeatureIcon name={f.icon} />
                <h3 className="mt-4 font-semibold text-slate-50">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
              </div>
            ))}
          </div>
          {/* Roadmap pane — full-width CTA below the grid. Goes to the iOS
              waitlist (the first in-development harness) so the "join the
              waitlist" promise lands on a working form. */}
          <Link
            href="/sdk/ios"
            className="reveal card group mt-3 flex flex-col justify-between transition hover:-translate-y-0.5 hover:border-brand/50 lg:flex-row lg:items-center"
          >
            <div>
              <h3 className="font-semibold text-slate-50">Your platform next</h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
                iOS, Android, and Flutter harnesses are in development. Join the waitlist and
                we’ll email the moment a beta opens.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-brand transition group-hover:gap-2 lg:mt-0 lg:shrink-0">
              Join the waitlist <span aria-hidden>→</span>
            </span>
          </Link>
        </div>
      </section>

      {/* The deterministic agent fleet — no model required */}
      <section className="border-t border-ink-700/70 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-slate-50">
              44 deterministic agents — <span className="text-brand">zero model calls</span>
            </h2>
            <p className="mt-3 text-slate-400">
              Same result every run, on any machine, with a report and a verdict. They run on the
              free tier, offline, and they feed the dashboard — one executive view of the whole
              project.
            </p>
          </div>
          <div className="mt-12 grid gap-3 lg:grid-cols-3">
            {AGENT_PHASES.map((p, i) => (
              <div
                key={p.phase}
                className="reveal card flex flex-col"
                style={{ '--reveal-delay': `${i * 90}ms` } as CSSProperties}
              >
                <div className="flex items-center gap-2">
                  <span className="chip !px-2 !py-0.5 font-mono text-[10px]">{p.phase}</span>
                  <h3 className="font-semibold text-slate-50">{p.title}</h3>
                </div>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{p.body}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.cmds.map(c => (
                    <code key={c} className="rounded-[3px] border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] text-brand">
                      {c}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-7 text-center">
            <Link href="/agents" className="text-sm text-brand transition hover:text-brand-strong hover:underline">
              Full agent catalog — every command, every verdict, every report →
            </Link>
          </div>
        </div>
      </section>

      {/* Currency — the always-current model */}
      <section className="border-t border-ink-700/70 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div className="reveal">
              <h2 className="text-3xl font-bold text-slate-50">The model is never stale</h2>
              <p className="mt-4 leading-relaxed text-slate-400">
                Vectalon refreshes its own web intel — every hour under serve — and inlines the
                headlines into every model system prompt. The same release feed your upgrade steps
                read is the feed the model sees. If the ecosystem ships it, the model knows it.
              </p>
              <Link href="/changelog" className="mt-6 inline-block text-sm text-brand hover:underline">
                See what shipped in v0.12.0 →
              </Link>
            </div>
            <div className="reveal card !p-0" style={{ '--reveal-delay': '120ms' } as CSSProperties}>
              <div className="pane-head !border-0 px-5 py-3">
                <span>live intel sources</span>
                <span className="flex items-center gap-1.5 !normal-case tracking-normal text-slate-500">
                  <span className="live-dot" aria-hidden />
                  26 live
                  <span className="hidden sm:inline">·</span>
                  <FeedAge fetchedAt={intelFetchedAt} />
                </span>
              </div>
              <div className="ticker h-60 border-t border-ink-700/60">
                <ul className="ticker-inner">
                  {[...intel, ...intel].map((item, i) => (
                    <IntelRow key={i} item={item} variant="large" />
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — the questions that decide a download. Zero-JS <details>
          accordions, mirroring the console's no-JS ethos. */}
      <section className="border-t border-ink-700/70 py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-3xl font-bold text-slate-50">Questions, answered</h2>
          <p className="mt-3 text-slate-400">The short version of everything.</p>
          <div className="mt-10 space-y-3">
            {FAQ.map((item, i) => (
              <details
                key={item.q}
                className="reveal card group !p-0"
                style={{ '--reveal-delay': `${i * 60}ms` } as CSSProperties}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-mono text-sm font-semibold text-slate-50 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden className="text-lg text-slate-500 transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="faq-a px-5 pb-5 text-sm leading-relaxed text-slate-400">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — the closing prompt */}
      <section className="border-t border-ink-700/70 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <div className="reveal console">
            <div className="console-head justify-center">
              <span>vectalon — install</span>
            </div>
            <div className="px-6 py-10">
              <h2 className="text-3xl font-bold text-slate-50">Try it. Free, no signup.</h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
                The free tier is genuinely useful — init, serve, feature, doctor. Premium commands
                offer a 14-day trial with one GitHub login. iOS, Android, and Flutter harnesses are in
                development.
              </p>
              <p className="mx-auto mt-7 w-fit rounded-[3px] border border-ink-700 bg-ink-900 px-4 py-3 font-mono text-sm text-slate-300">
                <span className="text-brand">$</span> npx vectalon@latest init
                <span className="caret" />
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <a
                  href="https://github.com/Vectalon/Vectalon"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary"
                >
                  Get Vectalon
                </a>
                <Link href="/pricing" className="btn-ghost">
                  Compare plans
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
