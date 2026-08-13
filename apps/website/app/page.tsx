import Link from 'next/link'
import { FeatureIcon, type FeatureIconName } from '../components/FeatureIcon'

const SDK_CHIPS = [
  { slug: 'react-native', name: 'React Native', status: 'live' },
  { slug: 'ios', name: 'iOS', status: 'soon' },
  { slug: 'android', name: 'Android', status: 'soon' },
  { slug: 'flutter', name: 'Flutter', status: 'soon' },
]

const FEATURES: Array<{ title: string; body: string; icon: FeatureIconName }> = [
  {
    title: 'MCP-native agent',
    body: 'A local model runs as an agent over 58 project-aware tools — feature workflows, code review, upgrades, E2E generation, device control — all through the MCP protocol your editor already speaks.',
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

const STATS = [
  { value: '90%', label: 'Guardrail pass rate' },
  { value: '11', label: 'Benchmark scenarios' },
  { value: '58', label: 'Project-aware tools' },
  { value: '13', label: 'Workflow phases' },
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

const CURRENCY = [
  { label: 'RN releases', source: 'GitHub Atom' },
  { label: 'Expo changelog', source: 'GitHub + blog RSS' },
  { label: 'React Native Weekly', source: 'Newsletter RSS' },
  { label: 'Hacker News "React Native"', source: 'Algolia API' },
  { label: 'GitHub trending RN repos', source: 'Search API' },
  { label: 'Callstack Open Source Report', source: 'Blog RSS' },
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
$ `

export default function Home() {
  return (
    <>
      {/* Hero — split: copy left, live terminal right */}
      <section className="hairline-grid relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:pt-24">
          <div>
            <div className="mb-6 w-fit animate-fade-up">
              <span className="chip font-mono">
                <span className="mr-1.5 text-brand">$</span>
                npx vectalon init → a brain for your app
              </span>
            </div>
            <h1 className="animate-fade-up text-4xl font-bold leading-[1.08] text-slate-50 sm:text-5xl lg:text-6xl">
              The AI harness that lives in your terminal
              <span className="caret ml-2" />
            </h1>
            <p className="mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-slate-400" style={{ animationDelay: '80ms' }}>
              Vectalon scans your project, builds a living knowledge base, and runs an MCP agent
              that writes, reviews, and heals your code.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4" style={{ animationDelay: '140ms' }}>
              <a href="#demo" className="btn-primary animate-fade-up">
                See it run
              </a>
              <Link href="/pricing" className="btn-ghost animate-fade-up">
                Compare plans
              </Link>
            </div>
          </div>

          {/* Terminal — fixed dark livery in both modes */}
          <div className="term animate-fade-up" style={{ animationDelay: '120ms' }}>
            <div className="term-head">
              <div className="flex gap-1.5">
                <span className="term-dot bg-red-400/70" />
                <span className="term-dot bg-yellow-400/70" />
                <span className="term-dot bg-green-400/70" />
              </div>
              <span className="text-xs text-[#9c8f74]">vectalon — feature</span>
            </div>
            <pre className="term-body">
              {TERMINAL_SESSION}
              <span className="caret" />
            </pre>
          </div>
        </div>
      </section>

      {/* Platform strip */}
      <section className="border-t border-ink-700/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6">
          <span className="text-sm text-slate-500">One harness, four platforms</span>
          <div className="flex flex-wrap gap-2">
            {SDK_CHIPS.map(sdk => (
              <Link
                key={sdk.slug}
                href={`/sdk/${sdk.slug}`}
                className="chip transition hover:border-brand/50 hover:text-brand"
              >
                {sdk.name}
                <span className={`ml-2 ${sdk.status === 'live' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>
                  {sdk.status === 'live' ? 'live' : 'soon'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — timeline, not cards */}
      <section className="border-t border-ink-700/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-slate-50">One loop, three commands</h2>
            <p className="mt-3 text-slate-400">
              The whole workflow — context, generation, verification — is a CLI loop. No IDE
              plugin, no dashboard, no state to sync.
            </p>
          </div>
          <ol className="mt-14">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative border-l border-ink-700 pb-12 pl-8 last:pb-0">
                <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand" />
                <div className="grid gap-3 md:grid-cols-[250px_1fr] md:gap-8">
                  <div>
                    <div className="font-mono text-sm text-brand">
                      <span className="text-brand">$</span> {s.cmd}
                    </div>
                    <div className="mt-1 font-mono text-xs text-slate-500">step 0{i + 1}</div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-50">{s.title}</h3>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-400">{s.body}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Video demo */}
      <section id="demo" className="border-t border-ink-700/60 py-20">
        <div className="mx-auto max-w-4xl px-4">
          <div className="mb-3 text-center">
            <h2 className="text-3xl font-bold text-slate-50">Watch it run — 90 seconds, no cuts</h2>
            <p className="mt-3 text-sm text-slate-400">
              The real CLI, recorded live on a fresh project.
            </p>
          </div>
          <div className="term">
            <div className="term-head">
              <div className="flex gap-1.5">
                <span className="term-dot bg-red-400/70" />
                <span className="term-dot bg-yellow-400/70" />
                <span className="term-dot bg-green-400/70" />
              </div>
              <span className="text-xs text-[#9c8f74]">demo/full-demo.mp4 — v0.1.30</span>
            </div>
            <video
              className="aspect-[8/5] w-full bg-black/30 object-contain"
              controls
              muted
              playsInline
              autoPlay
              loop
              poster="/demo/full-demo-poster.jpg"
            >
              <source src="/demo/full-demo.mp4" type="video/mp4" />
              Your browser doesn't support the video tag — watch the walkthrough on{' '}
              <a
                href="https://github.com/Vectalon/Vectalon/blob/main/apps/website/demo/recording/README.md"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              .
            </video>
          </div>
        </div>
      </section>

      {/* Benchmark strip */}
      <section className="border-t border-ink-700/60 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-8 sm:grid-cols-4">
            {STATS.map(s => (
              <div key={s.label} className="text-center">
                <div className="font-display text-4xl font-bold text-brand">{s.value}</div>
                <div className="mt-1.5 text-xs uppercase tracking-wider text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-9 text-center">
            <Link href="/benchmarks" className="text-sm text-brand transition hover:text-brand-strong hover:underline">
              Full leaderboard — 11 RN scenarios, measured against human references →
            </Link>
          </div>
        </div>
      </section>

      {/* Features — asymmetric bento */}
      <section className="border-t border-ink-700/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-slate-50">What it does for you</h2>
            <p className="mt-3 text-slate-400">
              One harness for the whole loop — context, generation, verification, and upgrade —
              with the model and knowledge base maintained by Vectalon, not you.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`card transition hover:-translate-y-0.5 hover:border-brand/50 ${
                  i === 0 || i === FEATURES.length - 1
                    ? 'sm:col-span-2 lg:col-span-2'
                    : ''
                }`}
              >
                <FeatureIcon name={f.icon} />
                <h3 className="mt-4 font-semibold text-slate-50">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
              </div>
            ))}
          </div>
          {/* Roadmap strip — full-width CTA below the bento */}
          <Link
            href="/sdk/react-native"
            className="card group mt-5 flex flex-col justify-between transition hover:-translate-y-0.5 hover:border-brand/50 lg:flex-row lg:items-center"
          >
            <div>
              <h3 className="font-semibold text-slate-50">Your platform next</h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
                iOS, Android, and Flutter harnesses are in development. Join the waitlist and
                we’ll email the moment a beta opens.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-brand transition group-hover:gap-2 lg:mt-0 lg:shrink-0">
              See the platforms <span aria-hidden>→</span>
            </span>
          </Link>
        </div>
      </section>

      {/* Currency */}
      <section className="border-t border-ink-700/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold text-slate-50">The model is never stale</h2>
              <p className="mt-4 leading-relaxed text-slate-400">
                Vectalon refreshes its own web intel — every hour under serve — and inlines the
                headlines into every model system prompt. The same release feed your upgrade steps
                read is the feed the model sees. If the ecosystem ships it, the model knows it.
              </p>
              <Link href="/changelog" className="mt-6 inline-block text-sm text-brand hover:underline">
                See what shipped in v0.4.0 →
              </Link>
            </div>
            <div className="card !p-0">
              <div className="border-b border-ink-700 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                live intel sources
              </div>
              <ul className="divide-y divide-ink-700/60">
                {CURRENCY.map(c => (
                  <li key={c.label} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="text-slate-200">{c.label}</span>
                    <span className="font-mono text-xs text-slate-500">{c.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ink-700/60 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-slate-50">Try it. Free, no signup.</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            The free tier is genuinely useful — init, serve, feature, doctor. Premium commands
            offer a 14-day trial with one GitHub login. iOS, Android, and Flutter harnesses are in
            development.
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
          <div className="mt-6 font-mono text-xs text-slate-500">
            <span className="text-brand">$</span> npx vectalon@latest init
          </div>
        </div>
      </section>
    </>
  )
}
