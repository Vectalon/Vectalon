import Link from 'next/link'

const FREE = [
  ['init', 'Scan your project and build the knowledge base'],
  ['serve', 'Run the MCP server — agents connect from your editor'],
  ['feature "…"', 'Generate components, write tests, run workflows'],
  ['doctor', 'Ecosystem + native toolchain + leaderboard readiness, with numbered fix steps'],
  ['refresh', 'Re-fetch web intel + re-seed knowledge from the repo'],
  ['status', 'One read-only health screen — daemon, MCP server, model, license'],
  ['ecosystem', 'Browse the tooling catalog — MCP servers, skills, hooks; grouped, with --info cards'],
  ['selftest', 'Test every harness feature in isolated sandboxes — live pass/fail stream'],
  ['bench / leaderboard', 'Run the RN benchmark suite against any model'],
]

const PRO = [
  ['upgrade', 'React Native / Expo upgrade copilot — rn-diff-purge diffs, AST impact analysis, codemods'],
  ['ci', 'Self-healing CI generation'],
  ['bundle', 'Bundle budget guardrails in code review'],
  ['profile', 'Hermes runtime analysis — JS-thread blocks, retained objects, leak candidates'],
  ['sandbox', 'Run commands with deny-by-default env, no network, hard time/memory limits'],
  ['render', 'Compile + headless-render generated code before the diff — Metro transform, sandboxed'],
  ['sync', 'Team brain — cross-project knowledge + cloud sync (Team)'],
]

const STEPS = [
  {
    n: '01',
    title: 'Install & init',
    code: 'npx vectalon init',
    body: 'Scans the repo, seeds the knowledge base, and enables the ecosystem items your project needs. No config files to write — Vectalon owns its own knowledge.',
  },
  {
    n: '02',
    title: 'Serve the agent',
    code: 'npx vectalon serve',
    body: 'Boots the MCP server. Your editor or any MCP client connects and gets 58+ project-aware tools. Web intel and the knowledge base auto-refresh hourly.',
  },
  {
    n: '03',
    title: 'Use it',
    code: 'npx vectalon feature "login screen with auth API"',
    body: 'PRD → stories → acceptance criteria → implementation → tests → review. Every fix is compile-checked before it lands, and the terminal explains itself — live phase progress, a command feed, and parsed failure cards on failure.',
  },
]

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-slate-50">Documentation</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          From zero to an agent that knows your React Native project. The full command
          reference lives in the repo — this is the fast path.
        </p>
      </div>

      {/* Quickstart */}
      <section className="mb-14">
        <h2 className="mb-6 text-2xl font-bold text-slate-50">Quickstart</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map(s => (
            <div key={s.n} className="card">
              <div className="font-mono text-sm text-brand">{s.n}</div>
              <h3 className="mt-2 font-semibold text-slate-50">{s.title}</h3>
              <code className="mt-3 block rounded-lg bg-ink-900 px-3 py-2 font-mono text-xs text-emerald-700 dark:text-emerald-300">
                {s.code}
              </code>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Command matrix */}
      <section className="mb-14">
        <h2 className="mb-6 text-2xl font-bold text-slate-50">Commands</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card !p-0">
            <div className="border-b border-ink-700 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Free — genuinely useful
            </div>
            <ul className="divide-y divide-ink-700/60">
              {FREE.map(([cmd, desc]) => (
                <li key={cmd} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <code className="font-mono text-sm text-slate-50">{cmd}</code>
                  <span className="text-sm text-slate-400">{desc}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card !p-0">
            <div className="border-b border-ink-700 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-brand">
              Pro — teams & hard problems
            </div>
            <ul className="divide-y divide-ink-700/60">
              {PRO.map(([cmd, desc]) => (
                <li key={cmd} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <code className="font-mono text-sm text-slate-50">{cmd}</code>
                  <span className="text-sm text-slate-400">{desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Trial CTA */}
      <section className="card flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">Try every Pro command free</h3>
          <p className="mt-1 text-sm text-slate-400">
            14 days, no credit card — one GitHub login. The full upgrade copilot included.
          </p>
        </div>
        <Link href="/trial" className="btn-primary shrink-0">
          Start the trial
        </Link>
      </section>

      <div className="mt-12 rounded-xl border border-ink-700 bg-ink-800 p-6 text-sm text-slate-400">
        Looking for the full reference? It lives in the repo and covers every command, the MCP
        tool catalog, the benchmark harness, and the upgrade pipeline.
        <Link
          href="https://github.com/Vectalon/Vectalon/blob/main/apps/website/docs/CLI_REFERENCE.md"
          target="_blank"
          className="ml-2 text-brand hover:underline"
        >
          CLI Reference →
        </Link>
      </div>
    </div>
  )
}
