import Link from 'next/link'

const FEATURES = [
  {
    title: 'MCP-native agent',
    body: 'A local model runs as an agent over 58 project-aware tools — feature workflows, code review, upgrades, E2E generation, device control — all through the MCP protocol your editor already speaks.',
    icon: '⚡',
  },
  {
    title: 'Self-maintaining knowledge',
    body: 'Init scans your repo and builds a living knowledge graph. Serve re-seeds it hourly. The model always works from what your project actually is — never a generic guess.',
    icon: '🧠',
  },
  {
    title: 'Always-current model',
    body: 'Web intel pipelines (RN releases, Expo changelog, Hacker News, GitHub trending, Callstack) feed the model\'s system prompt, so it knows 0.87-rc before the release notes do.',
    icon: '📡',
  },
  {
    title: 'Upgrade Copilot',
    body: 'rn-diff-purge diffs, AST-grade impact analysis, and codemods — plan and apply React Native upgrades with every native and JS/TS change mapped out.',
    icon: '🛠',
  },
  {
    title: 'Compile-checked healing',
    body: 'Every agent fix is typechecked before it lands. A fix that doesn\'t reduce errors is reverted. Generated code renders headlessly in a sandbox before you see it.',
    icon: '🩺',
  },
  {
    title: 'Guardrails on save',
    body: 'RN best-practices rules (Pressable, no leaked renders, New Architecture hazards) run in your editor and in code review — with hallucination-verified findings.',
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
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(600px 300px at 20% 0%, rgba(110,231,183,0.12), transparent), radial-gradient(500px 260px at 80% 10%, rgba(52,211,153,0.08), transparent)',
          }}
        />
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 text-center sm:pt-28">
          <div className="mx-auto mb-6 w-fit">
            <span className="chip">npx vectalon init → a brain for your RN app</span>
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-6xl">
            The adaptive AI harness for{' '}
            <span className="bg-gradient-to-r from-brand to-emerald-300 bg-clip-text text-transparent">
              React Native
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
            Vectalon scans your project, builds a living knowledge base, and runs a local
            MCP-aware agent that generates, reviews, upgrades, and heals your code — while
            keeping itself current with the ecosystem, automatically.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a href="#terminal" className="btn-primary">
              See it run
            </a>
            <Link href="/pricing" className="btn-ghost">
              Pricing — free tier included
            </Link>
          </div>
          <div className="mx-auto mt-6 max-w-xl text-xs text-slate-500">
            Free: init · serve · feature · doctor. Pro: upgrade copilot, self-healing CI,
            bundle budgets. No credit card for the 14-day trial.
          </div>
        </div>
      </section>

      {/* Terminal demo */}
      <section id="terminal" className="mx-auto max-w-4xl px-4 pb-20">
        <div className="card !p-0 overflow-hidden font-mono text-sm">
          <div className="flex items-center justify-between border-b border-ink-700 bg-ink-900 px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-red-400/70" />
              <span className="h-3 w-3 rounded-full bg-yellow-400/70" />
              <span className="h-3 w-3 rounded-full bg-green-400/70" />
            </div>
            <span className="text-xs text-slate-500">vectalon — feature</span>
          </div>
          <pre className="overflow-x-auto p-5 text-[13px] leading-relaxed text-slate-300">
            {`$ npx vectalon init
✔ rn-vectalon initialized — knowledge base seeded (5 artifacts)
ℹ Detected React Native CLI (bare) · 26 ecosystem items enabled

$ npx vectalon feature "login screen with auth API"
◆ PRD → stories → acceptance criteria → implementation → tests → review
✔ src/components/CreateLoginScreenEmailPassword.tsx  (composite 92%)
✔ Compile-checked: 0 errors after 2 healing passes
✔ Rendered headlessly in sandbox — tree OK

$ npx vectalon upgrade --diff
◆ rn-diff-purge diff fetched: 0.85.3 → 0.86.2
✔ 42 template changes mapped (14 native · 28 JS/TS)
ℹ Web intel: 102 headlines cached — model prompt is current (0h ago)`}
          </pre>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-ink-700/60 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold text-white">What it does for you</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
            One harness for the whole loop — context, generation, verification, and upgrade —
            with the model and knowledge base maintained by Vectalon, not you.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(f => (
              <div key={f.title} className="card transition hover:border-brand/50 hover:bg-ink-800/80">
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
                headlines into every model system prompt. The same release feed your upgrade
                steps read is the feed the model sees. If the ecosystem ships it, the model
                knows it.
              </p>
              <Link href="/changelog" className="mt-6 inline-block text-sm text-brand hover:underline">
                See what shipped in v0.1.26 →
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
            The free tier is genuinely useful — init, serve, feature, doctor. Premium
            commands offer a 14-day trial with one GitHub login.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a href="https://github.com/Vectalon/Vectalon" target="_blank" rel="noreferrer" className="btn-primary">
              Get Vectalon
            </a>
            <Link href="/pricing" className="btn-ghost">
              Compare plans
            </Link>
          </div>
          <div className="mt-6 font-mono text-xs text-slate-600">npx vectalon@latest init</div>
        </div>
      </section>
    </>
  )
}
