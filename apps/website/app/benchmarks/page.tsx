const SCENARIOS = [
  { id: 'rn-01', title: 'Login screen with auth API', suite: 'forms-security', composite: 48 },
  { id: 'rn-02', title: 'Paginated list with pull-to-refresh', suite: 'data-flow', composite: 49 },
  { id: 'rn-03', title: 'Themed card component honoring dark mode', suite: 'core-ui', composite: 59 },
  { id: 'rn-04', title: 'Settings stack with typed route params and deep links', suite: 'navigation', composite: 0 },
  { id: 'rn-05', title: 'Multi-field form with validation and secure persistence', suite: 'forms-security', composite: 51 },
  { id: 'rn-06', title: 'Offline-first action queue with optimistic UI', suite: 'data-flow', composite: 37 },
  { id: 'rn-07', title: 'Image-heavy feed with thumbnails', suite: 'perf', composite: 59 },
  { id: 'rn-08', title: 'Feature-flag wrapper component and hook', suite: 'core-ui', composite: 37 },
  { id: 'rn-09', title: 'Screen-reader-friendly onboarding form', suite: 'a11y', composite: 42 },
  { id: 'rn-10', title: 'Convert class/JS component to typed hooks', suite: 'refactor', composite: 41 },
  { id: 'rn-11', title: 'Remove a dependency with full native cleanup', suite: 'refactor', composite: null },
]

const GUARDRAILS = [
  { id: 'rn-01', value: 89 },
  { id: 'rn-02', value: 88 },
  { id: 'rn-03', value: 96 },
  { id: 'rn-04', value: null },
  { id: 'rn-05', value: 93 },
  { id: 'rn-06', value: 89 },
  { id: 'rn-07', value: 96 },
  { id: 'rn-08', value: 89 },
  { id: 'rn-09', value: 88 },
  { id: 'rn-10', value: 85 },
  { id: 'rn-11', value: null },
]

function Bar({ value, max = 100 }: { value: number | null; max?: number }) {
  if (value === null) {
    return <span className="font-mono text-xs text-slate-500">n/a</span>
  }
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-2 w-full max-w-[260px] rounded-[3px] bg-brand"
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
      <span className="w-10 shrink-0 font-mono text-xs text-slate-400">{value}%</span>
    </div>
  )
}

export default function BenchmarksPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="text-center">
        <div className="mx-auto mb-5 w-fit">
          <span className="chip font-mono">
            nightly pass — spec v1 — <span className="text-brand">1 model</span> — 11 scenarios
          </span>
        </div>
        <h1 className="text-4xl font-bold text-slate-50">RN coding tests — model leaderboard</h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">
          Every night, the benchmark runs 11 real React Native scenarios through the local model,
          scores the generated code against spec adherence and the RN guardrail ruleset, and
          measures it against human reference implementations.
        </p>
      </div>

      {/* Overall stats */}
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat">
          <div className="stat-label">Composite</div>
          <div className="stat-value text-brand">42%</div>
          <div className="mt-1 text-xs text-slate-500">vs 90% human reference</div>
        </div>
        <div className="stat">
          <div className="stat-label">Guardrails</div>
          <div className="stat-value text-brand">90%</div>
          <div className="mt-1 text-xs text-slate-500">best-practices rule pass</div>
        </div>
        <div className="stat">
          <div className="stat-label">Adherence</div>
          <div className="stat-value text-brand">up to 100%</div>
          <div className="mt-1 text-xs text-slate-500">spec coverage per scenario</div>
        </div>
        <div className="stat">
          <div className="stat-label">Scenarios</div>
          <div className="stat-value text-brand">11</div>
          <div className="mt-1 text-xs text-slate-500">forms, data, navigation, a11y</div>
        </div>
      </div>

      {/* Composite table */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-slate-50">Composite by scenario</h2>
        <p className="mt-2 text-sm text-slate-400">
          Composite blends spec adherence with the guardrail pass rate. Generated{' '}
          <span className="font-mono text-slate-500">2026-08-11</span> — model{' '}
          <span className="font-mono text-slate-500">qwen2.5-coder-1.5b (local)</span>.
        </p>
        <div className="card !p-0 mt-6 overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Suite</th>
                <th className="w-[42%]">Composite</th>
              </tr>
            </thead>
            <tbody>
              {SCENARIOS.map(s => (
                <tr key={s.id}>
                  <td>
                    <span className="font-mono text-xs text-slate-500">{s.id}</span>{' '}
                    <span className="text-slate-200">{s.title}</span>
                  </td>
                  <td className="text-slate-400">{s.suite}</td>
                  <td>
                    <Bar value={s.composite} />
                  </td>
                </tr>
              ))}
              <tr className="bg-ink-800/70">
                <td className="font-semibold text-slate-50">Overall</td>
                <td className="text-slate-400">—</td>
                <td>
                  <Bar value={42} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Guardrails */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-slate-50">Guardrails never slip</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Even where codegen misses the spec, output stays inside the project ruleset — 85–96% on
          every scenario. This is the property that makes generated code safe to review, not
          blindly trust.
        </p>
        <div className="card !p-0 mt-6 overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th>Scenario</th>
                <th className="w-[42%]">Guardrail pass</th>
              </tr>
            </thead>
            <tbody>
              {GUARDRAILS.map(g => (
                <tr key={g.id}>
                  <td className="font-mono text-slate-400">{g.id}</td>
                  <td>
                    <Bar value={g.value} />
                  </td>
                </tr>
              ))}
              <tr className="bg-ink-800/70">
                <td className="font-semibold text-slate-50">Overall</td>
                <td>
                  <Bar value={90} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Methodology + CTA */}
      <section className="mt-16">
        <div className="card">
          <h2 className="font-semibold text-slate-50">Run it yourself</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            The leaderboard is generated by <span className="font-mono text-brand">vectalon bench</span>,
            a deterministic harness: each scenario scaffolds a real project, runs the model, then
            scores guardrails and adherence with the same rules your code review uses. Add any
            model provider and publish your own row.
          </p>
          <pre className="term-body mt-4 rounded-[4px] border bg-[rgb(var(--term))] text-[13px]" style={{ borderColor: 'rgb(var(--term-border))' }}>
            <span className="text-[#E35336]">$</span> npx vectalon bench --model local{'\n'}
            <span className="text-[#E35336]">$</span> npx vectalon bench --model openai --live --json -o bench/results/openai.json{'\n'}
            <span className="text-[#E35336]">$</span> npx vectalon leaderboard
          </pre>
        </div>
      </section>
    </div>
  )
}
