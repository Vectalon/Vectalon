import Link from 'next/link'

const SDK_CHIPS = [
  { slug: 'react-native', name: 'React Native', status: 'live' },
  { slug: 'ios', name: 'iOS', status: 'soon' },
  { slug: 'android', name: 'Android', status: 'soon' },
  { slug: 'flutter', name: 'Flutter', status: 'soon' },
]

const FEATURES = [
  {
    title: 'MCP-native agent',
    body: 'A local model runs as an agent over 58 project-aware tools — feature workflows, code review, upgrades, E2E generation, device control — all through the MCP protocol your editor already speaks.',
    icon: '⚡',
  },
  {
    title: 'Self-maintaining knowledge',
    body: 'Init scans your repo and builds a living knowledge graph; serve re-seeds it hourly. Every run is distilled into L0→L3 project memory — the project teaches the model, and the model never works from a generic guess.',
    icon: '🧠',
  },
  {
    title: 'Always-current model',
    body: 'Web intel pipelines (RN releases, Expo changelog, Hacker News, GitHub trending, Callstack) feed the model’s system prompt, so it knows 0.87-rc before the release notes do.',
    icon: '📡',
  },
  {
    title: 'Upgrade Copilot',
    body: 'rn-diff-purge diffs, AST-grade impact analysis, and codemods — plan and apply React Native upgrades with every native and JS/TS change mapped out.',
    icon: '🛠',
  },
  {
    title: 'Compile-checked healing',
    body: 'Every agent fix is typechecked before it lands. A fix that doesn’t reduce errors is reverted. Generated code renders headlessly in a sandbox before you see it.',
    icon: '🩺',
  },
  {
    title: 'Guardrails on save',
    body: 'Platform best-practices rules (Pressable, no leaked renders, New Architecture hazards) run in your editor and in code review — with hallucination-verified findings.',
    icon: '🛡',
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

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="hairline-grid relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-20 text-center sm:pt-28">
          <div className="mx-auto mb-6 w-fit animate-fade-up">
            <span className="chip font-mono">
              <span className="mr-1.5 text-accent">$</span>
              npx vectalon init → a brain for your app
            </span>
          </div>
          <h1 className="mx-auto max-w-4xl animate-fade-up text-4xl font-bold leading-[1.05] text-white sm:text-6xl md:text-7xl">
            The AI harness that
            <br />
            <span className="text-brand">lives in your terminal</span>
            <span className="caret ml-2" />
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-lg text-slate-300" style={{ animationDelay: '80ms' }}>
            Vectalon scans your React Native, iOS, Android, and Flutter projects, builds a living
            knowledge base, and runs a local MCP-aware agent that generates, reviews, upgrades, and
            heals your code — while keeping itself current with the ecosystem, automatically.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4" style={{ animationDelay: '140ms' }}>
            <a href="#terminal" className="btn-primary animate-fade-up">
              See it run
            </a>
            <Link href="/pricing" className="btn-ghost animate-fade-up">
              Pricing — free tier included
            </Link>
          </div>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-2">
            <span className="micro mr-1">platforms</span>
            {SDK_CHIPS.map(sdk => (
              <Link
                key={sdk.slug}
                href={`/sdk/${sdk.slug}`}
                className="chip transition hover:border-brand/50 hover:text-brand"
              >
                {sdk.name}
                <span className={`ml-2 ${sdk.status === 'live' ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {sdk.status === 'live' ? 'live' : 'soon'}
                </span>
              </Link>
            ))}
          </div>
          <div className="mx-auto mt-6 max-w-xl text-xs text-slate-500">
            Free: init · serve · feature · doctor. Pro: upgrade copilot, self-healing CI, bundle
            budgets. No credit card for the 14-day trial.
          </div>
        </div>
      </section>

      {/* Terminal demo */}
      <section id="terminal" className="mx-auto max-w-4xl px-4 pb-20">
        <div className="mb-3 text-center">
          <h2 className="text-2xl font-bold text-white">Watch it run — 90 seconds, no cuts</h2>
          <p className="mt-2 text-sm text-slate-400">
            The real CLI, recorded live on a fresh project. Every command below, played back.
          </p>
        </div>
        <div className="card terminal-glow !p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-700 bg-ink-900 px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-red-400/70" />
              <span className="h-3 w-3 rounded-full bg-yellow-400/70" />
              <span className="h-3 w-3 rounded-full bg-green-400/70" />
            </div>
            <span className="font-mono text-xs text-slate-500">demo/full-demo.mp4 — v0.1.30</span>
          </div>
          <video
            className="aspect-[8/5] w-full bg-ink-900 object-contain"
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
        <div className="card terminal-glow !p-0 mt-6 overflow-hidden font-mono text-sm">
          <div className="flex items-center justify-between border-b border-ink-700 bg-ink-900 px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-red-400/70" />
              <span className="h-3 w-3 rounded-full bg-yellow-400/70" />
              <span className="h-3 w-3 rounded-full bg-green-400/70" />
            </div>
            <span className="font-mono text-xs text-slate-500">vectalon — feature</span>
          </div>
          <pre className="overflow-x-auto p-5 text-[13px] leading-relaxed text-slate-300">
            {`$ npx vectalon init
✔ rn-vectalon initialized — knowledge base seeded (5 artifacts)
ℹ Detected React Native CLI (bare) · 26 ecosystem items enabled

$ npx vectalon feature "login screen with auth API"
◆ [5/13] Implementation ▸ yarn test     ✓ (2.1s)
◆ [9/13] Verification ▸ yarn test       ✓ (1.8s)
✔ Compile-checked: 0 errors after 2 healing passes
✦ 13/13 phases completed — index.md · 3 lessons distilled to project memory

$ npx vectalon upgrade --diff
◆ rn-diff-purge diff fetched: 0.85.3 → 0.86.2
✔ 42 template changes mapped (14 native · 28 JS/TS)
ℹ Web intel: 102 headlines cached — model prompt is current (0h ago)

$ `}
            <span className="caret" />
          </pre>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-ink-700/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold text-white">What it does for you</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
            One harness for the whole loop — context, generation, verification, and upgrade — with
            the model and knowledge base maintained by Vectalon, not you.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="card transition hover:-translate-y-0.5 hover:border-brand/50 hover:bg-ink-800/80"
              >
                <div className="mb-3 text-2xl">{f.icon}</div>
                <h3 className="font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Currency */}
      <section className="border-t border-ink-700/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold text-white">The model is never stale</h2>
              <p className="mt-4 leading-relaxed text-slate-400">
                Vectalon refreshes its own web intel — every hour under serve — and inlines the
                headlines into every model system prompt. The same release feed your upgrade steps
                read is the feed the model sees. If the ecosystem ships it, the model knows it.
              </p>
              <Link href="/changelog" className="mt-6 inline-block text-sm text-brand hover:underline">
                See what shipped in v0.1.30 →
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
          <h2 className="text-3xl font-bold text-white">Try it. Free, no signup.</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            The free tier is genuinely useful — init, serve, feature, doctor. Premium commands offer
            a 14-day trial with one GitHub login. iOS, Android, and Flutter harnesses are in
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
          <div className="mt-6 font-mono text-xs text-slate-600">
            <span className="text-accent">$</span> npx vectalon@latest init
          </div>
        </div>
      </section>
    </>
  )
}
