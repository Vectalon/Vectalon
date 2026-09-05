import Link from 'next/link'
import type { CSSProperties } from 'react'
import { PUBLIC_INSTALL_COMMAND } from '../lib/install-command'
import { FeatureIcon, type FeatureIconName } from '../components/FeatureIcon'
import { DemoPlayer } from '../components/DemoPlayer'
import { TypePrompt, type TypePromptHeadline } from '../components/TypePrompt'
import { FeedAge } from '../components/FeedAge'
import HeroHeadline from '../components/HeroHeadline'
import { AgentOrb } from '../components/AgentOrb'
import { HeroParticles, HeroAurora } from '../components/HeroMotion'
import { fetchIntelFeed, type IntelItem } from '../lib/intel'
import { PRODUCT_MANIFEST } from '../lib/product-manifest'

const SDK_CHIPS = [
  { slug: 'react-native', name: 'react-native', status: 'live' },
  { slug: 'ios', name: 'ios', status: 'soon' },
  { slug: 'android', name: 'android', status: 'soon' },
  { slug: 'flutter', name: 'flutter', status: 'soon' },
]

const FEATURES: Array<{ title: string; body: string; icon: FeatureIconName }> = [
  {
    title: 'MCP-native agent',
    body: `An experimental, opt-in local-model agent can use ${PRODUCT_MANIFEST.capabilities.mcpTools} registered project-aware tools. The catalog also tracks ${PRODUCT_MANIFEST.capabilities.deterministicCommands} deterministic commands; lifecycle, evidence, and availability vary by command.`,
    icon: 'robot',
  },
  {
    title: 'Self-maintaining knowledge',
    body: 'Beta onboarding can inspect local project context. Self-maintaining knowledge and hourly refresh workflows remain experimental and require explicit opt-in.',
    icon: 'brain',
  },
  {
    title: 'Always-current model',
    body: 'Experimental web-intel inputs can augment a configured model. They depend on network sources and are not evidence of future-release knowledge.',
    icon: 'broadcast',
  },
  {
    title: 'Upgrade Copilot',
    body: 'Experimental upgrade tools can inspect diffs and propose bounded changes. Verification must be reviewed in the target project.',
    icon: 'wrench',
  },
  {
    title: 'Guardrails on save',
    body: 'Platform best-practices rules (Pressable, no leaked renders, New Architecture hazards) run in your editor and in code review. Hallucination-verified findings.',
    icon: 'shield',
  },
  {
    title: 'Compile-checked healing',
    body: 'Experimental repair workflows can run configured type checks and bounded retries. Results still require review; this is not a guarantee that every generated fix compiles.',
    icon: 'check',
  },
  {
    title: 'Impact regression coverage',
    body: 'Experimental analysis can map changed files to affected screens and propose regression coverage. Availability and evidence come from the released catalog.',
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
    a: 'Model-driven workflows require a configured provider. The catalog tracks 44 deterministic command registrations, but broad analysis and report commands are experimental. Some commands make zero model calls; network and credential requirements depend on the command and configuration.',
  },
  {
    q: 'Do the deterministic agents go stale?',
    a: 'No. Every run reads the project as it is right now. Source files, git history, CI config, and telemetry exports are scanned at run time. The ecosystem knowledge auto-refreshes hourly under vectalon serve.',
  },
  {
    q: 'Which platforms are supported?',
    a: `React Native is live at v${PRODUCT_MANIFEST.packages.reactNative.version}. iOS, Android, and Python harnesses are in development. Join the waitlist and we'll email the moment a beta opens.`,
  },
  {
    q: 'How is it different from other AI coding tools?',
    a: `It isn't an AI coding assistant. It is an engineering control plane. Give Vectalon a React Native repository and it continuously understands, reviews, diagnoses, upgrades, and validates it. Deterministic and compile-checked.`,
  },
  {
    q: 'What does it cost?',
    a: 'Free includes qualified capabilities listed by the released catalog, with no card. Experimental commands require opt-in and are not a purchased promise. Individual is $19/dev/mo and Team is $49/dev/mo.',
  },
]

const STATS = [
  { value: '94%', label: 'guardrail pass rate' },
  { value: '44', label: 'registered deterministic commands' },
  { value: '64', label: 'project-aware tools' },
  { value: '43', label: 'benchmark scenarios' },
]

const STEPS = [
  {
    cmd: 'vectalon init',
    title: 'Scan & seed',
    body: 'Point it at your repo. Vectalon scans structure, dependencies, and conventions, then builds the project knowledge graph.',
  },
  {
    cmd: 'vectalon serve',
    title: 'The agent loop',
    body: `A local MCP-aware model works your codebase with ${PRODUCT_MANIFEST.capabilities.mcpTools} project-aware tools, re-seeding ecosystem intel every hour.`,
  },
  {
    cmd: 'vectalon feature "…"',
    title: 'Generate & heal',
    body: 'Describe a task. You get compile-checked code, tests, and a code review. Fixes are typechecked and reverted if they don\'t reduce errors.',
  },
]

const GUARDRAILS = [
  { name: 'Pressable over TouchableOpacity', state: 'pass' },
  { name: 'no leaked renders', state: 'pass' },
  { name: 'New Architecture hazards', state: 'pass' },
  { name: 'bundle budget deltas', state: 'watch' },
]

const HEALING_LOG = [
  '◆ [8/14] Implementation ▸ yarn test   ✓ (1.8s)',
  '✔ Compile-checked: 0 errors after 3 healing passes',
  '✦ 14/14 phases. index.md: 5 lessons distilled',
  '◆ product-manifest.json: contract v1.0.0 pinned',
  '✔ 44 agents · 64 tools · 43 scenarios verified',
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
    body: 'Review the diff, audit the architecture, scan for secrets, diagnose a broken build or test run, propose safe refactors. For provably-safe fixes, apply them.',
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

  const heroHeadlines: TypePromptHeadline[] = intel
    .filter(i => i.source === 'Expo changelog' || i.source === 'Hacker News')
    .map(i => ({ label: i.label, tag: i.source === 'Hacker News' ? 'HN' : 'Expo' }))
    .slice(0, 4)

  return (
    <>
      {/* Hero */}
      <section className="hero-bg relative overflow-hidden">
        {/* Motion layers */}
        <HeroAurora />
        <HeroParticles />
        <div className="scanlines pointer-events-none absolute inset-0" aria-hidden />
        <div className="beam js-loop" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-12 sm:pt-16">
          {/* Brand hero — staggered entrance */}
          <div className="hero-stagger text-center">
            {/* Logo mark — drops in with rotation + glow ring */}
            <div className="mx-auto mb-6 flex justify-center">
              <div className="hero-logo-enter relative">
                <div className="hero-glow-ring" />
                <svg width="80" height="88" viewBox="0 0 220 240" fill="none" className="relative drop-shadow-[0_0_40px_rgba(0,230,195,0.3)]">
                  <path d="M25 48L70 70L110 195" stroke="url(#hero-lg-teal)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M195 48L150 70L110 195" stroke="url(#hero-lg-violet)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M55 112L110 195L165 112" stroke="#4DAEFF" strokeOpacity="0.9" strokeWidth="4" strokeLinecap="round"/>
                  <path d="M110 84V195" stroke="#39BFFF" strokeWidth="4" strokeLinecap="round"/>
                  {/* Breathing nodes */}
                  <circle cx="55" cy="112" r="9" fill="#00E6C3" className="hero-logo-node hero-logo-node--teal"/>
                  <circle cx="165" cy="112" r="9" fill="#8B5CF6" className="hero-logo-node hero-logo-node--violet"/>
                  <circle cx="110" cy="84" r="8" fill="#37B6FF" className="hero-logo-node hero-logo-node--cyan"/>
                  <circle cx="110" cy="195" r="11" fill="#37B6FF" stroke="#B8E8FF" strokeWidth="3" className="hero-logo-node hero-logo-node--base"/>
                  <path d="M110 28L122 52H98L110 28Z" fill="#66E8FF"/>
                  <defs>
                    <linearGradient id="hero-lg-teal" x1="20" y1="50" x2="110" y2="205" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#00E6C3"/><stop offset="1" stopColor="#37B6FF"/>
                    </linearGradient>
                    <linearGradient id="hero-lg-violet" x1="200" y1="50" x2="110" y2="205" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#8B5CF6"/><stop offset="1" stopColor="#37B6FF"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            {/* Wordmark — arrives from below with blur-to-sharp */}
            <h1 className="hero-gradient-text font-display text-5xl font-bold tracking-tight text-slate-50 sm:text-6xl lg:text-7xl">
              Vectalon
            </h1>

            {/* Tagline — lighter, arrives after wordmark */}
            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400 sm:text-xl">
              Adaptive AI harness for developers
            </p>

            {/* Value props — staggered within the stagger */}
            <div className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-3">
              {[
                { icon: '◈', label: 'Local-first', color: 'text-teal-300' },
                { icon: '◎', label: 'Project-aware', color: 'text-cyan-300' },
                { icon: '◆', label: 'Deterministic', color: 'text-teal-400' },
                { icon: '▣', label: 'Control plane', color: 'text-violet-400' },
              ].map(v => (
                <span key={v.label} className="hero-pill flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm text-slate-300">
                  <span className="text-brand">{v.icon}</span>
                  {v.label}
                </span>
              ))}
            </div>

            {/* CTA — arrives last */}
            <div className="mt-10 flex justify-center gap-4">
              <a href="#demo" className="btn-primary">
                See it run
              </a>
              <Link href="/pricing" className="btn-ghost">
                Compare plans
              </Link>
            </div>
          </div>

          {/* Terminal console */}
          <div className="console hero-console mt-14 animate-fade-up" style={{ animationDelay: '360ms' }}>
            <div className="flex items-center justify-between border-b border-ink-700/70 code-bg/90 px-4 py-2.5 font-mono text-[11px] text-slate-500">
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
                <span className="text-slate-600">[ v0.15.0 ]</span>
              </div>
            </div>

            <div className="px-6 py-10 sm:px-10 sm:py-14">
              <HeroHeadline />

              <div className="mt-10 grid animate-fade-up gap-4 md:grid-cols-3" style={{ animationDelay: '420ms' }}>
                {/* Intel feed */}
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

                {/* Guardrails */}
                <div className="card !p-4">
                  <div className="pane-head">
                    <span className="flex items-center gap-2">
                      <AgentOrb state="solving" size={20} label="Guardrails checking" />
                      guardrails
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2.5 font-mono text-[12px]">
                    {GUARDRAILS.map(g => (
                      <li key={g.name} className="flex items-center justify-between gap-3">
                        <span className="text-slate-300">{g.name}</span>
                        {g.state === 'pass' ? (
                          <span className="text-emerald-400">✓ pass</span>
                        ) : (
                          <span className="text-amber-400">◈ watch</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 border-t border-ink-700/60 pt-2.5 font-mono text-[11px] text-slate-500">
                    hallucination-verified · in editor + review
                  </div>
                </div>

                {/* Healing log */}
                <div className="card !p-4">
                  <div className="pane-head">
                    <span className="flex items-center gap-2">
                      <AgentOrb state="working" size={20} label="Healing in progress" />
                      healing log
                    </span>
                    <span className="!normal-case tracking-normal text-slate-500">vectalon feature</span>
                  </div>
                  <ul className="mt-3 space-y-2.5 font-mono text-[11px] leading-relaxed">
                    {HEALING_LOG.map((l, i) => (
                      <li key={i} className="text-slate-400">
                        {l.startsWith('✔') ? (
                          <span className="text-emerald-400">✔</span>
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

              {/* Prompt */}
              <div
                className="mt-10 flex animate-fade-up flex-col gap-4 rounded-xl border border-ink-700 code-bg px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                style={{ animationDelay: '240ms' }}
              >
                <p className="font-mono text-sm text-slate-300">
                  <TypePrompt headlines={heroHeadlines} />
                </p>
                <div className="flex flex-wrap gap-3">
                  <a href="#demo" className="btn-primary">
                    See it run
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform strip */}
      <section className="border-t border-ink-700/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-5 font-sans md:flex-row md:items-center md:justify-between">
          <span className="text-xs text-slate-500">one harness, four platforms</span>
          <div className="flex flex-wrap gap-2">
            {SDK_CHIPS.map(sdk => (
              <Link
                key={sdk.slug}
                href={`/sdk/${sdk.slug}`}
                className="chip transition hover:border-brand/50 hover:text-brand"
              >
                <span
                  className={sdk.status === 'live' ? 'text-brand' : 'text-slate-600'}
                  aria-hidden
                >
                  {sdk.status === 'live' ? '●' : '○'}
                </span>
                {sdk.name}
                <span className={sdk.status === 'live' ? 'text-brand' : 'text-slate-500'}>
                  {sdk.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* MCP clients */}
      <section className="border-t border-ink-700/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6 font-sans md:flex-row md:items-center md:justify-between">
          <span className="micro shrink-0">one mcp server, every client</span>
          <div className="flex flex-wrap justify-center gap-2 md:justify-end">
            {MCP_CLIENTS.map(c => (
              <code key={c} className="chip transition hover:border-brand/50 hover:text-brand">
                {c}
              </code>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-ink-700/70 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-slate-50 sm:text-4xl">One loop, three commands</h2>
            <p className="mt-4 text-lg text-slate-400">
              The whole workflow (context, generation, verification) is a CLI loop. No IDE
              plugin, no dashboard, no state to sync.
            </p>
          </div>
          <div className="console mt-14">
            <div className="console-head">
              <span>vectalon - session</span>
              <span className="hidden items-center gap-1.5 sm:flex">
                <span className="live-dot" aria-hidden />
                live
              </span>
            </div>
            <div className="divide-y divide-ink-700/60">
              {STEPS.map((s, i) => (
                <div
                  key={s.title}
                  className="reveal grid gap-4 px-6 py-7 sm:px-8 md:grid-cols-[280px_1fr] md:gap-10"
                  style={{ '--reveal-delay': `${i * 90}ms` } as CSSProperties}
                >
                  <div>
                    <div className="flex items-center gap-2 font-mono text-sm text-brand">
                      <AgentOrb state={i === 0 ? 'searching' : i === 1 ? 'connecting' : 'solving'} size={20} label={s.title} />
                      <span>$</span> {s.cmd}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-600">
                      [ step 0{i + 1} / 03 ]
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-50">{s.title}</h3>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Video demo */}
      <section id="demo" className="border-t border-ink-700/70 py-24">
        <div className="mx-auto max-w-4xl px-5">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-slate-50 sm:text-4xl">Watch it run: 85 seconds, no cuts</h2>
            <p className="mt-4 text-slate-400">
              The real CLI on a real 19-screen Expo app: init, arch, sec, feature, bench.
            </p>
          </div>
          <DemoPlayer />
        </div>
      </section>

      {/* Stats */}
      <section className="border-t border-ink-700/70 bg-gradient-to-b from-transparent via-brand/[0.02] to-transparent">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="statusline !border-0 !bg-transparent">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className="reveal seg !block !px-6 !py-5 text-center"
                style={{ '--reveal-delay': `${i * 90}ms` } as CSSProperties}
              >
                <div className="font-display text-3xl font-bold text-brand">{s.value}</div>
                <div className="mt-1.5 font-sans text-[11px] uppercase tracking-wider text-slate-500">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/benchmarks" className="text-sm text-brand transition hover:text-brand-strong hover:underline">
              Full leaderboard: benchmark scenarios, measured against human references →
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-ink-700/70 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-slate-50 sm:text-4xl">What it does for you</h2>
            <p className="mt-4 text-lg text-slate-400">
              One harness for the whole loop (context, generation, verification, upgrade)
              with the model and knowledge base maintained by Vectalon, not you.
            </p>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <Link
            href="/sdk/ios"
            className="reveal card group mt-4 flex flex-col justify-between transition hover:-translate-y-0.5 hover:border-brand/50 lg:flex-row lg:items-center"
          >
            <div>
              <h3 className="font-semibold text-slate-50">Your platform next</h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
                iOS, Android, and Flutter harnesses are in development. Join the waitlist and
                we'll email the moment a beta opens.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-brand transition group-hover:gap-2 lg:mt-0 lg:shrink-0">
              Join the waitlist <span aria-hidden>→</span>
            </span>
          </Link>
        </div>
      </section>

      {/* Agent fleet */}
      <section className="border-t border-ink-700/70 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-slate-50 sm:text-4xl">
              44 registered deterministic commands. <span className="text-brand">Experimental preview</span>
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              The broad analysis fleet is experimental today: opt-in is required, results need
              review, and offline or network behavior depends on the command and configuration.
            </p>
          </div>
          <div className="mt-14 grid gap-4 lg:grid-cols-[1.5fr_1fr_1fr]">
            {AGENT_PHASES.map((p, i) => (
              <div
                key={p.phase}
                className={`reveal card flex flex-col ${i === 0 ? 'lg:row-span-2' : ''}`}
                style={{ '--reveal-delay': `${i * 90}ms` } as CSSProperties}
              >
                <div className="flex items-center gap-2">
                  <span className="chip !px-2 !py-0.5 font-mono text-[10px]">{p.phase}</span>
                  <h3 className="font-semibold text-slate-50">{p.title}</h3>
                </div>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{p.body}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.cmds.map(c => (
                    <code key={c} className="rounded-lg border border-ink-700 code-bg px-2 py-0.5 font-mono text-[11px] text-brand">
                      {c}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/agents" className="text-sm text-brand transition hover:text-brand-strong hover:underline">
              Full agent catalog: every command, every verdict, every report →
            </Link>
          </div>
        </div>
      </section>

      {/* Currency */}
      <section className="border-t border-ink-700/70 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid items-start gap-12 lg:grid-cols-2">
            <div className="reveal">
              <h2 className="text-3xl font-bold text-slate-50 sm:text-4xl">The model is never stale</h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-400">
                Vectalon refreshes its own web intel every hour under serve and inlines the
                headlines into every model system prompt. If the ecosystem ships it, the model knows it.
              </p>
              <Link href="/changelog" className="mt-7 inline-block text-sm text-brand hover:underline">
                See what shipped in v{PRODUCT_MANIFEST.packages.reactNative.version} →
              </Link>
            </div>
            <div className="reveal card !p-0" style={{ '--reveal-delay': '120ms' } as CSSProperties}>
              <div className="pane-head !border-0 px-6 py-3">
                <span>live intel sources</span>
                <span className="flex items-center gap-1.5 !normal-case tracking-normal text-slate-500">
                  <span className="live-dot" aria-hidden />
                  26 live
                  <span className="hidden sm:inline">·</span>
                  <FeedAge fetchedAt={intelFetchedAt} />
                </span>
              </div>
              <div className="ticker h-64 border-t border-ink-700/60">
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

      {/* FAQ */}
      <section className="border-t border-ink-700/70 py-24">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl font-bold text-slate-50 sm:text-4xl">Questions, answered</h2>
          <p className="mt-4 text-lg text-slate-400">The short version of everything.</p>
          <div className="mt-12 space-y-3">
            {FAQ.map((item, i) => (
              <details
                key={item.q}
                className="reveal card group !p-0"
                style={{ '--reveal-delay': `${i * 60}ms` } as CSSProperties}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-5 font-sans text-sm font-semibold text-slate-50 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden className="text-lg text-slate-500 transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="faq-a px-6 pb-5 text-sm leading-relaxed text-slate-400">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ink-700/70 py-24 bg-gradient-to-b from-transparent via-accent/[0.02] to-transparent">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <div className="reveal console">
            <div className="console-head justify-center">
              <span>vectalon - install</span>
            </div>
            <div className="px-8 py-12">
              <h2 className="text-3xl font-bold text-slate-50 sm:text-4xl">Try it. Free, no signup.</h2>
              <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-slate-400">
                The free tier is genuinely useful: init, serve, feature, doctor. Premium commands
                offer a 14-day trial with one GitHub login.
              </p>
              <p className="mx-auto mt-8 w-fit rounded-xl border border-ink-700 code-bg px-5 py-3.5 font-mono text-sm text-slate-300">
                <span className="text-brand">$</span> {PUBLIC_INSTALL_COMMAND}
                <span className="caret" />
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
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
