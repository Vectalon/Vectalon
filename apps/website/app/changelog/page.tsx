import Link from 'next/link'

const RELEASES = [
  {
    version: 'v0.1.30',
    date: '2026-08-11',
    tag: 'latest',
    highlights: [
      'Live model streaming — vectalon bench --model local shows the model generating in real time: a TTY-only token preview (character count + truncated text preview) ticks as each chunk decodes, auto-off for --json/pipes; onTextChunk is plumbed through ModelRequest → LocalProvider → runInference, and MCP/agent paths are unchanged',
      'Incremental benchmark reports — vectalon bench streams each scenario section to stdout the moment it finishes (composite, axes, correctness, relative-to-human) with suite headers switching live, then closes with the Overall block; --json stays pure and --output keeps the full grouped report',
      'llama.cpp noise eliminated — the load: control-looking token spam and the MaxListenersExceededWarning are gone: a shared log filter is plumbed into every node-llama-cpp entry point with a C-level logLevel: warn gate, exit listeners merged into one beforeExit drain, and the process listener cap raised to 64',
    ],
  },
  {
    version: 'v0.1.29',
    date: '2026-08-11',
    highlights: [
      'Bundle size visualizer — vectalon bundle prints ASCII bars for the top packages and --open renders a self-contained HTML dashboard: interactive treemap, per-package drill-down, budget violations, and replacement-suggestion cards (last publish, weekly downloads, GitHub stars)',
      'Actionable improvement suggestions — new vectalon suggestions command: severity-grouped list (title, current → latest), --json for CI, --limit, --apply <ref> (prints the exact npm install and runs it behind a confirmation gate), and --open dashboard; the interactive menu gains a View suggestions (N) entry',
      'MCP catalog health — catalog package names are validated against the npm registry (cache-backed, offline-safe): ecosystem enable fail-fasts with the corrected command, doctor gains a catalog-<id> check per enabled MCP, and sub-MCP failures collapse to one warning line instead of a wall of npm error E404 noise',
      'Staleness-aware refresh — the menu\'s Force refresh knowledge entry now shows how stale the knowledge base is',
      'Fixed: vectalon bench default results directory now resolves to the project cwd instead of the CLI\'s install location',
    ],
  },
  {
    version: 'v0.1.28',
    date: '2026-08-10',
    highlights: [
      'Structured workflow output — the terminal explains itself: [9/13] phase progress, a live command feed with ✓/✖ + exit code + duration, and parsed failure cards that point at the full report, the rotating log, and the resume command',
      'Doctor failure card — missing checks render as a numbered fix list with [auto]/[manual] tags and an auto-fix count (vectalon doctor --fix)',
      'run_agent results render as a structured markdown report with a tool-call table (✅ executed / ⚠️ skipped) and iteration counts',
      'Failed verification checks become project memory — distilled into L0→L3 error facts so future runs know the project\'s recurring failures',
    ],
  },
  {
    version: 'v0.1.27',
    date: '2026-08-10',
    highlights: [
      'L0→L3 agent memory distiller — agent sessions become raw memory, atomic facts, occurrence-weighted scenario lessons, and a stable project persona (stack, conventions, known issues), inlined into every model prompt',
      'Professional ecosystem UX — grouped catalog (MCP servers / Agent skills / Tools / Hooks) with ✓/— status marks, never-truncated IDs, and a single-item --info view',
    ],
  },
  {
    version: 'v0.1.26',
    date: '2026-08-10',
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
