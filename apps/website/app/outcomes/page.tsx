import Link from 'next/link'

/**
 * The outcomes page — sales material, not feature counts.
 *
 * Directive #10: stop measuring features; measure outcomes. The hero is the
 * Acme Corp ledger exactly as the roadmap draws it; below it, how `vc
 * outcomes` derives the same ledger from your repo's committed reports.
 */

const ACME = [
  { n: 127, label: 'issues detected' },
  { n: 91, label: 'automatically fixed' },
  { n: 23, label: 'PRs reviewed' },
  { n: 14, label: 'build failures resolved' },
  { n: 8, label: 'hours saved on RN upgrade' },
  { n: 31, label: 'regressions prevented' },
]

const SIGNALS = [
  {
    agent: 'build-fix',
    outcome: 'build failures diagnosed + resolved',
    detail: 'every metro/gradle/xcode log you hand it → root cause + fix plan, counted per report',
  },
  {
    agent: 'fix / bug-fix',
    outcome: 'build failures fixed',
    detail: 'reports with applied:true mean the fix actually touched the tree',
  },
  {
    agent: 'review',
    outcome: 'PR issues caught',
    detail: 'every error/warning finding in a review report, before the PR merges',
  },
  {
    agent: 'score',
    outcome: 'perf regressions + issues prevented',
    detail: 'the performance dimension findings, and new problems caught on the latest run',
  },
  {
    agent: 'sec / arch / a11y / soc2',
    outcome: 'issues detected',
    detail: 'error+warning findings from every committed scan — and approved scans count as prevented',
  },
  {
    agent: '.vectalon/upgrades/',
    outcome: 'RN upgrades completed',
    detail: 'one provenance dir (with UPGRADE.md) per completed upgrade run',
  },
  {
    agent: 'feature-development',
    outcome: 'tests generated',
    detail: 'test files written by every workflow run, counted recursively',
  },
]

const RATE = 75 // blended rate ($/hr) — matches vc outcomes default

export const metadata = {
  title: 'Vectalon — engineering outcomes, not feature counts',
  description:
    '127 issues detected · 91 automatically fixed · 23 PRs reviewed · 14 build failures resolved · 8 hours saved on RN upgrade · 31 regressions prevented. The sales material is outcomes, not agent counts.',
}

function TermLine({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[12.5px] leading-6 text-term-ink/90">{children}</div>
}

export default function SavingsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="text-center">
        <div className="mx-auto mb-5 flex w-fit items-center gap-2">
          <span className="chip font-mono">
            vectalon<span className="text-brand">/</span>outcomes
          </span>
          <span className="badge badge-ok">● zero model calls</span>
        </div>
        <h1 className="text-4xl font-bold text-slate-50 sm:text-5xl">
          Engineering <span className="text-brand">outcomes</span>, not feature counts
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">
          Anyone can count agents. The ledger an engineering manager actually reads is outcomes —
          issues detected and fixed, PR issues caught, build failures resolved, hours saved. Every
          number below comes from the <span className="font-mono text-slate-300">report.json</span>{' '}
          files Vectalon already writes to your repo, on every run, deterministically.
        </p>
      </div>

      {/* The Acme Corp ledger — the hero block */}
      <div className="mt-12 overflow-hidden rounded-lg border border-ink-700/60 code-bg/80 shadow-2xl">
        <div className="term-head">
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="term-dot bg-[#ff5f56]" />
            <span className="term-dot bg-[#ffbd2e]" />
            <span className="term-dot bg-[#27c93f]" />
          </div>
          <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-term-ink/70">
            <span className="truncate">
              <span className="text-term-ink">vectalon</span>{' '}
              <span className="text-[rgb(var(--brand))]">outcomes</span>
            </span>
          </div>
          <span className="badge shrink-0 badge-ok">approved</span>
        </div>
        <div className="border-t border-term-frame/60 px-5 py-5">
          <TermLine>
            <span className="text-term-ink/50">$</span>{' '}
            <span className="text-term-ink">vectalon outcomes</span>
          </TermLine>
          <TermLine>
            <span className="text-term-meta">Acme Corp — July</span>
          </TermLine>
          <div className="mt-3 space-y-0.5">
            {ACME.map(item => (
              <TermLine key={item.label}>
                <span className="inline-block w-[150px] text-right text-emerald-400">
                  {item.n.toLocaleString()}
                </span>{' '}
                <span className="text-term-ink">{item.label}</span>
              </TermLine>
            ))}
          </div>
          <div className="mt-4 border-t border-term-frame/40 pt-3">
            <TermLine>
              <span className="text-term-ink/60">Estimated engineering savings:</span>{' '}
              <span className="text-emerald-400">$7,400</span>
            </TermLine>
            <TermLine>
              <span className="text-term-ink/40">~98 developer-hours at ${RATE}/hr blended rate</span>
            </TermLine>
          </div>
        </div>
      </div>

      {/* How it's derived */}
      <div className="mt-14">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-50">Your ledger, from your repo</h2>
          <span className="badge badge-warn">real reports, not estimates</span>
        </div>
        <p className="mt-2 max-w-2xl text-slate-400">
          <span className="font-mono text-slate-300">vc outcomes</span> reads the committed reports
          under <span className="font-mono text-slate-300">docs/vectalon/</span> and{' '}
          <span className="font-mono text-slate-300">.vectalon/upgrades/</span> and counts each
          outcome from real artifacts — then multiplies the hours by a blended rate ($75/hr by
          default, override with <span className="font-mono text-slate-300">--rate</span>). Nothing
          is estimated from thin air; if no reports exist yet, the ledger says so.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {SIGNALS.map(s => (
            <div key={s.agent} className="rounded-lg border border-ink-700/60 code-bg/50 p-5">
              <div className="font-mono text-sm font-semibold text-brand">{s.agent}</div>
              <div className="mt-1 font-mono text-[12px] text-slate-300">→ {s.outcome}</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-14 text-center">
        <div className="mx-auto max-w-xl rounded-lg border border-ink-700/60 code-bg/50 p-6">
          <p className="font-mono text-sm text-slate-300">
            See your own ledger — it takes as long as the agents you&apos;ve already run:
          </p>
          <div className="mt-3 font-mono text-sm text-slate-400">
            <span className="text-brand">$</span> npx vectalon outcomes --rate 75
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/demo"
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition hover:opacity-90"
            >
              See the flagship demo
            </Link>
            <Link
              href="/agents"
              className="rounded-md border border-ink-600 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-brand hover:text-brand"
            >
              Browse the 48 agents
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
