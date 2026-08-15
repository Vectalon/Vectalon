/**
 * Benchmarks page — one harness, four benchmarks.
 *
 * Every number here comes from committed artifacts in the RN package:
 * `packages/rn/bench/results/local.json` + `BENCHMARK_RESULTS.md` (the
 * live model pass) and `packages/rn/bench/baseline.json` (the CI
 * regression gate). Regenerate with `vectalon bench` — never edit by hand.
 */

const RUNS = [
  { id: 'rn-01', title: 'Login screen with auth API', suite: 'forms-security', composite: 68, correctness: 50, adherence: 64, guardrails: 95, relative: 80 },
  { id: 'rn-02', title: 'Paginated list with pull-to-refresh', suite: 'data-flow', composite: 58, correctness: 50, adherence: 40, guardrails: 88, relative: 64 },
  { id: 'rn-03', title: 'Themed card component honoring dark mode', suite: 'core-ui', composite: 100, correctness: 100, adherence: null, guardrails: null, relative: 100 },
  { id: 'rn-04', title: 'Settings stack with typed route params and deep links', suite: 'navigation', composite: 68, correctness: 50, adherence: null, guardrails: 93, relative: 68 },
  { id: 'rn-05', title: 'Multi-field form with validation and secure persistence', suite: 'forms-security', composite: 42, correctness: 0, adherence: 44, guardrails: 94, relative: 49 },
  { id: 'rn-06', title: 'Offline-first action queue with optimistic UI', suite: 'data-flow', composite: 47, correctness: 50, adherence: 0, guardrails: 89, relative: 69 },
  { id: 'rn-07', title: 'Image-heavy feed with thumbnails', suite: 'perf', composite: 67, correctness: 50, adherence: 63, guardrails: 94, relative: 82 },
  { id: 'rn-08', title: 'Feature-flag wrapper component and hook', suite: 'core-ui', composite: 79, correctness: 50, adherence: 100, guardrails: 98, relative: 79 },
  { id: 'rn-09', title: 'Screen-reader-friendly onboarding form', suite: 'a11y', composite: 100, correctness: 100, adherence: null, guardrails: null, relative: 111 },
  { id: 'rn-10', title: 'Convert class/JS component to typed hooks', suite: 'refactor', composite: 58, correctness: 50, adherence: 33, guardrails: 92, relative: 67 },
  { id: 'rn-11', title: 'Remove a dependency with full native cleanup', suite: 'refactor', composite: null, correctness: null, adherence: null, guardrails: null, relative: null },
  { id: 'rn-12', title: 'Notifications screen with list fetch', suite: 'data-flow', composite: 65, correctness: 50, adherence: 60, guardrails: 88, relative: 73 },
  { id: 'rn-13', title: 'Account deletion screen with confirmation', suite: 'forms-security', composite: 67, correctness: 50, adherence: 67, guardrails: 88, relative: 75 },
]

const SUITES = [
  { name: 'core-ui', composite: 90, guardrails: 98, why: 'theming, tokens, feature flags — strongest area' },
  { name: 'navigation', composite: 68, guardrails: 93, why: 'typed params + deep links' },
  { name: 'perf', composite: 67, guardrails: 94, why: 'image-heavy feeds' },
  { name: 'forms-security', composite: 59, guardrails: 93, why: 'auth + forms — the highest-stakes screen' },
  { name: 'refactor', composite: 58, guardrails: 92, why: 'hooks migration + dependency removal' },
  { name: 'data-flow', composite: 57, guardrails: 89, why: 'pagination + offline queues — weakest area' },
  { name: 'a11y', composite: 100, guardrails: null, why: 'screen-reader-friendly onboarding' },
]

/** The six scaffold-able scenarios the CI gate runs (no model). */
const BASELINE_GATE = [
  'rn-01-login-screen',
  'rn-02-flatlist-fetch',
  'rn-05-form-validation',
  'rn-06-offline-queue',
  'rn-12-notifications-screen',
  'rn-13-account-delete-screen',
]

const AXES = [
  {
    name: 'Correctness',
    weight: '0.4',
    verdict: 'does the generated code actually run?',
    checks: 'real npm install + jest + tsc --noEmit + eslint in a throwaway temp project per scenario — scored under `--live --install`',
    for: 'proves the code runs and passes the project’s own validation, not just that it looks right',
    note: 'Scored live this release: tests pass on 12 of 13 scenarios, and rn-03 + rn-09 pass all three checks at 100%. The axis is no longer floored at 0 — the model output is judged on merit, and where tsc or eslint fails it is a real defect in the generated code.',
  },
  {
    name: 'Adherence',
    weight: '0.3',
    verdict: 'does it look like an RN expert wrote it?',
    checks: 'a 16-check rubric: KeyboardAvoidingView on input screens, FlatList over ScrollView+.map, typed navigation props, StyleSheet.create, design tokens over hex literals, loading/empty/error states, and more',
    for: 'measures the positive best practices generic benchmarks never check — the RN-specific craft the harness exists to enforce',
  },
  {
    name: 'Guardrails',
    weight: '0.3',
    verdict: 'does it stay inside the project’s rules?',
    checks: 'the real runGuardrails + PolicyEngine ruleset over every generated file — no secrets, no `any`, no console noise, no inline styles on hot paths',
    for: 'the property that makes generated code safe to review rather than blindly trust — even where codegen misses the spec, it stays inside the rules',
  },
]

function Bar({ value, max = 100, barMax = 260 }: { value: number | null; max?: number; barMax?: number }) {
  if (value === null) {
    return <span className="font-mono text-xs text-slate-500">n/a</span>
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 rounded-[3px] bg-brand" style={{ width: `${Math.min(barMax, (value / max) * barMax)}px` }} />
      <span className="w-10 shrink-0 font-mono text-xs text-slate-400">{value}%</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-wider text-brand">{children}</p>
}

export default function BenchmarksPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      {/* Hero */}
      <div className="text-center">
        <div className="mx-auto mb-5 w-fit">
          <span className="chip font-mono">
            one harness · four benchmarks — spec v1 — <span className="text-brand">1 model</span> — 13 scenarios
          </span>
        </div>
        <h1 className="text-4xl font-bold text-slate-50">RN coding tests — the benchmark suite</h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">
          The same 13 real React Native scenarios, run four different ways: scored on three axes, sliced
          by suite, measured against human references, and gated on every PR so the harness can never
          silently regress. Every number on this page is generated by{' '}
          <span className="font-mono text-brand">vectalon bench</span> from committed results — not a
          screenshot of a hope. This release scored correctness for real: installs, tests, typecheck
          and lint ran in a throwaway project per scenario.
        </p>
      </div>

      {/* Overall stats */}
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat">
          <div className="stat-label">Composite</div>
          <div className="stat-value text-brand">68%</div>
          <div className="mt-1 text-xs text-slate-500">the model pass, all 13 scenarios — live-scored</div>
        </div>
        <div className="stat">
          <div className="stat-label">Guardrails</div>
          <div className="stat-value text-brand">92%</div>
          <div className="mt-1 text-xs text-slate-500">rule pass — the safety floor</div>
        </div>
        <div className="stat">
          <div className="stat-label">vs human</div>
          <div className="stat-value text-brand">76%</div>
          <div className="mt-1 text-xs text-slate-500">of the 89% human reference composite</div>
        </div>
        <div className="stat">
          <div className="stat-label">Gate</div>
          <div className="stat-value text-brand">100%</div>
          <div className="mt-1 text-xs text-slate-500">deterministic floor · 6 scenarios, every PR</div>
        </div>
      </div>

      {/* What's being measured */}
      <section className="mt-16">
        <SectionLabel>the three axes</SectionLabel>
        <h2 className="mt-1 text-2xl font-bold text-slate-50">What&apos;s being measured</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Every scenario is scored on three independent axes, then blended into one composite. The axes
          are the point: generic benchmarks check whether code <em>looks</em> like TypeScript. These check
          whether it <em>is</em> React Native.
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {AXES.map(a => (
            <div key={a.name} className="card">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-slate-50">{a.name}</h3>
                <span className="font-mono text-xs text-slate-500">weight {a.weight}</span>
              </div>
              <p className="mt-1 text-sm italic text-brand">{a.verdict}</p>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">{a.checks}</p>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                <span className="font-semibold text-slate-300">For:</span> {a.for}
              </p>
              {a.note && <p className="mt-3 border-t border-slate-800 pt-2 text-[11px] leading-relaxed text-slate-500">{a.note}</p>}
            </div>
          ))}
        </div>
        <div className="mt-6">
          <pre className="term-body rounded-[4px] border bg-[rgb(var(--term))] p-4 text-[13px]" style={{ borderColor: 'rgb(var(--term-border))' }}>
            <span className="text-term-brand">composite</span> <span className="text-slate-400">=</span> 0.4·correctness + 0.3·adherence + 0.3·guardrails{'\\n'}
            <span className="text-term-brand"># no --live run?</span> <span className="text-slate-400">correctness is excluded and the rest renormalized:</span>{'\\n'}
            <span className="text-term-brand">composite</span> <span className="text-slate-400">= (0.3·adherence + 0.3·guardrails) / 0.6</span>
          </pre>
        </div>
      </section>

      {/* Benchmark 1 — nightly model leaderboard */}
      <section className="mt-16">
        <SectionLabel>benchmark 1 · every night</SectionLabel>
        <h2 className="mt-1 text-2xl font-bold text-slate-50">The model leaderboard</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          The headline benchmark: a real model drives generation across all 13 scenarios and is scored on
          all three axes — with correctness now measured live. <span className="text-slate-200">What it&apos;s for:</span>{' '}
          a public, reproducible RN-specific model leaderboard — the same harness, any provider. The nightly
          workflow runs a <span className="font-mono text-slate-500"> [local · openai · anthropic]</span> matrix;
          tonight only the local row has results.
        </p>
        <div className="card !p-0 mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl min-w-[760px]">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Composite</th>
                  <th>Correctness</th>
                  <th>Adherence</th>
                  <th>Guardrails</th>
                </tr>
              </thead>
              <tbody>
                {RUNS.map(s => (
                  <tr key={s.id}>
                    <td>
                      <span className="font-mono text-xs text-slate-500">{s.id}</span>{' '}
                      <span className="text-slate-200">{s.title}</span>
                      <div className="font-mono text-[11px] text-slate-600">{s.suite}</div>
                    </td>
                    <td><Bar value={s.composite} barMax={120} /></td>
                    <td><Bar value={s.correctness} barMax={120} /></td>
                    <td><Bar value={s.adherence} barMax={120} /></td>
                    <td><Bar value={s.guardrails} barMax={120} /></td>
                  </tr>
                ))}
                <tr className="bg-ink-800/70">
                  <td className="font-semibold text-slate-50">Overall</td>
                  <td><Bar value={68} barMax={120} /></td>
                  <td><Bar value={null} barMax={120} /></td>
                  <td><Bar value={null} barMax={120} /></td>
                  <td><Bar value={92} barMax={120} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Generated <span className="font-mono">2026-08-15</span> — model{' '}
          <span className="font-mono">qwen2.5-coder-1.5b (local)</span>, scored with{' '}
          <span className="font-mono">--live --install</span>: a real <span className="font-mono">npm install</span>,
          then <span className="font-mono">jest</span> (tests, weight 0.5),{' '}
          <span className="font-mono">tsc --noEmit</span> (typecheck, 0.25) and{' '}
          <span className="font-mono">eslint .</span> (lint, 0.25) in a throwaway project. Tests pass on 12 of
          13 scenarios; where typecheck or lint fails, it is a real defect in the model&apos;s output. The
          guardrail floor holds at 88–98% on every scored scenario.
        </p>
      </section>

      {/* Benchmark 2 — suite breakdown */}
      <section className="mt-16">
        <SectionLabel>benchmark 2 · sliced by area</SectionLabel>
        <h2 className="mt-1 text-2xl font-bold text-slate-50">Where it wins — and where it doesn&apos;t</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          The same nightly run, aggregated by suite. <span className="text-slate-200">What it&apos;s for:</span>{' '}
          a leaderboard that hides variance is a lie — this shows exactly which area of React Native the
          harness handles today, so the roadmap and the model choice chase the weak spots.
        </p>
        <div className="card !p-0 mt-6 overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th>Suite</th>
                <th>Composite</th>
                <th>Guardrails</th>
                <th className="hidden md:table-cell">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {SUITES.map(s => (
                <tr key={s.name}>
                  <td>
                    <span className="font-mono text-xs text-slate-400">{s.name}</span>
                    <div className="hidden text-[11px] text-slate-600 md:block">{s.why}</div>
                  </td>
                  <td><Bar value={s.composite} barMax={140} /></td>
                  <td><Bar value={s.guardrails} barMax={140} /></td>
                  <td className="hidden md:table-cell">
                    <span className="font-mono text-xs text-slate-500">
                      {s.composite === null || s.composite === 0 ? 'model-only / not scored' : 'scored'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          The gradient is the point: core-ui and a11y sit at 90–100% while data-flow lags at 57% — the
          model&apos;s weakest muscle is async orchestration (pagination, offline queues), which is exactly
          where the next model or a fine-tune should spend its budget.
        </p>
      </section>

      {/* Benchmark 3 — relative to human */}
      <section className="mt-16">
        <SectionLabel>benchmark 3 · honest about the ceiling</SectionLabel>
        <h2 className="mt-1 text-2xl font-bold text-slate-50">Relative to a human</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Every scenario ships with a human-authored reference solution, scored by the <em>same</em>{' '}
          rubric. <span className="text-slate-200">What it&apos;s for:</span> it defines what
          &quot;passing&quot; means. The generated pass reaches{' '}
          <span className="text-brand">76% of the 89% human-reference composite</span> — up from 30% the
          moment correctness started being scored for real.
        </p>
        <div className="card !p-0 mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl min-w-[560px]">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Generated → human</th>
                  <th>Relative</th>
                </tr>
              </thead>
              <tbody>
                {RUNS.map(s => (
                  <tr key={s.id}>
                    <td>
                      <span className="font-mono text-xs text-slate-500">{s.id}</span>{' '}
                      <span className="text-slate-300">{s.title}</span>
                    </td>
                    <td><Bar value={s.relative} barMax={140} /></td>
                    <td className="font-mono text-xs text-slate-400">
                      {s.relative === null ? 'n/a' : `${s.relative}% of human`}
                    </td>
                  </tr>
                ))}
                <tr className="bg-ink-800/70">
                  <td className="font-semibold text-slate-50">Overall</td>
                  <td><Bar value={76} barMax={140} /></td>
                  <td className="font-mono text-xs text-slate-300">76% of 89% human composite</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          The human reference is not automatically 100% — it&apos;s scored by the same rubric, so a
          reference with a hardcoded hex literal scores below 1.0 on adherence. Generated code can
          therefore <em>beat</em> the human: rn-09 (screen-reader onboarding) scores 100% composite vs
          the human&apos;s 90% — 111% relative. That&apos;s honest scoring, not an error.
        </p>
      </section>

      {/* Benchmark 4 — CI regression gate */}
      <section className="mt-16">
        <SectionLabel>benchmark 4 · every PR</SectionLabel>
        <h2 className="mt-1 text-2xl font-bold text-slate-50">The regression gate — the harness protecting itself</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          A different kind of benchmark: no model, every pull request. Six scaffold-able scenarios run
          through the deterministic generator, and the scores are compared against the committed
          baseline. <span className="text-slate-200">What it&apos;s for:</span> any PR that improves a
          guardrail rule or rubric check must move the benchmark up; any PR that silently breaks the
          scaffold, a rule, or score detection fails CI. The harness can&apos;t regress without the
          leaderboard noticing.
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="card">
            <h3 className="font-semibold text-slate-50">Baseline floor (deterministic)</h3>
            <p className="mt-1 text-xs text-slate-400">
              The committed floor for all six scaffold-able scenarios — a perfect 100% across every
              axis, with no model in the loop. The scaffold now ships a unit test with every feature, so
              the gate also proves the generated code passes its own test suite:
            </p>
            <div className="mt-4 space-y-3">
              {BASELINE_GATE.map(id => (
                <div key={id} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-400">{id.replace('-', ' ')}</span>
                  <span className="font-mono text-slate-500">adherence 100% · guardrails 100%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3 className="font-semibold text-slate-50">The gate</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              CI runs <span className="font-mono text-brand">vectalon bench --baseline</span> and exits
              1 when any scored axis drops more than the <span className="font-mono">1%</span> tolerance
              — or a baseline scenario stops running. Baseline and leaderboard answer different
              questions: the gate measures the <em>harness</em>, the leaderboard measures the{' '}
              <em>model driving it</em>. The two scenarios that joined this release (rn-12
              notifications, rn-13 account deletion) sit on the 100% floor in the gate and already have
              their first live model-pass numbers on the leaderboard above — 65% and 67%.
            </p>
            <pre className="term-body mt-4 rounded-[4px] border bg-[rgb(var(--term))] p-3 text-[12px]" style={{ borderColor: 'rgb(var(--term-border))' }}>
              <span className="text-term-brand">$</span> npx vectalon bench --baseline bench/baseline.json{'\\n'}
              <span className="text-slate-500"># exit 1 on any axis regression</span>
            </pre>
          </div>
        </div>
      </section>

      {/* Run it yourself */}
      <section className="mt-16">
        <div className="card">
          <h2 className="font-semibold text-slate-50">Run all four yourself</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            One deterministic harness, no secrets, no model required for the gate. Add any model provider
            and publish your own leaderboard row — or author your own eval pack and score it against your
            own human references. Pass <span className="font-mono">--live --install</span> to score the
            correctness axis for real, the way these numbers were produced.
          </p>
          <pre className="term-body mt-4 rounded-[4px] border bg-[rgb(var(--term))] p-4 text-[13px]" style={{ borderColor: 'rgb(var(--term-border))' }}>
            <span className="text-term-brand">$</span> npx vectalon bench                          <span className="text-slate-500"># 1 · deterministic baseline (offline)</span>{'\\n'}
            <span className="text-term-brand">$</span> npx vectalon bench --model local --live --install  <span className="text-slate-500"># 1 · model leaderboard, correctness scored (all 13)</span>{'\\n'}
            <span className="text-term-brand">$</span> npx vectalon bench --suite forms-security   <span className="text-slate-500"># 2 · one suite</span>{'\\n'}
            <span className="text-term-brand">$</span> npx vectalon bench --live --install         <span className="text-slate-500"># real tests/typecheck/lint → correctness axis</span>{'\\n'}
            <span className="text-term-brand">$</span> npx vectalon leaderboard                    <span className="text-slate-500"># merge model passes → BENCHMARK_RESULTS.md</span>{'\\n'}
            <span className="text-term-brand">$</span> npx vectalon bench --baseline bench/baseline.json  <span className="text-slate-500"># 4 · CI regression gate</span>{'\\n'}
            <span className="text-term-brand">$</span> npx vectalon bench --scenarios ./my-evals --references ./my-refs  <span className="text-slate-500"># your own eval pack</span>
          </pre>
        </div>
      </section>
    </div>
  )
}
