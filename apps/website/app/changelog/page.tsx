import Link from 'next/link'

const RELEASES = [
  {
    version: 'v0.1.26',
    date: '2026-08-10',
    tag: 'latest',
    highlights: [
      'run_agent loop hardened for small local models — forced final answer, per-run tool cap, read-only tool dedupe',
      'Fine-tune dataset feature removed — model/knowledge quality is Vectalon\'s job, not the customer\'s',
    ],
  },
  {
    version: 'v0.1.25',
    date: '2026-08-10',
    highlights: [
      'Doctor future vision — flavor detection, recommended-but-not-enabled section, numbered fix steps, --enable/--disable toggles',
      'Web intel pipeline — 8 sources incl. Hacker News, GitHub trending, Callstack; inlined into every model system prompt',
      'serve auto-refreshes intel + knowledge hourly; WASM provider gets intel enrichment too',
      'ANSI-aware word-wrapping table renderer (no more truncated hints)',
      'Benchmark UX — live per-scenario progress, shared inference engine, stderr noise filter',
    ],
  },
  {
    version: 'v0.1.24',
    date: '2026-08-10',
    highlights: [
      'rn-diff-purge upgrade diffs — native + JS/TS template changes, live and always current',
      'Current catalog — RN 0.82–0.86, Expo SDK 55–57; --to latest can never go stale',
      'Self-maintaining knowledge base — init seeds from repo scan, serve re-seeds hourly',
    ],
  },
  {
    version: 'v0.1.23',
    date: '2026-08-10',
    highlights: ['Scripted terminal demo recording (8 VHS tapes)', 'render --file comma-list fix'],
  },
  {
    version: 'v0.1.22',
    date: '2026-08-09',
    highlights: [
      'Compile-checked self-healing — every agent fix is typechecked before it lands',
      'Golden test harness + non-Expo CLI demo',
      'RN best-practices in generated code — Pressable, no leaked renders, borderCurve',
    ],
  },
]

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-white">Changelog</h1>
        <p className="mt-3 text-slate-400">
          Every release of <span className="font-mono text-brand">@vectalon-dev/rn</span>.
          The model stays current with the ecosystem; these notes keep you current with the model.
        </p>
      </div>

      <div className="space-y-8">
        {RELEASES.map(r => (
          <div key={r.version} className="card">
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-lg font-bold text-white">{r.version}</h2>
              {r.tag && (
                <span className="rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-semibold text-brand">
                  {r.tag}
                </span>
              )}
              <span className="ml-auto text-sm text-slate-500">{r.date}</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
              {r.highlights.map(h => (
                <li key={h} className="flex gap-2">
                  <span className="text-brand">▸</span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-ink-700 bg-ink-800 p-6 text-sm text-slate-400">
        The full changelog — including the pre-0.1.22 history — lives in the repository.
        <Link href="https://github.com/Vectalon/Vectalon/blob/main/packages/rn/CHANGELOG.md" target="_blank" className="ml-2 text-brand hover:underline">
          View on GitHub →
        </Link>
      </div>
    </div>
  )
}
