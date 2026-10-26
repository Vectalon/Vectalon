import Link from 'next/link'

const SIGNALS = [
  { source: 'build-fix', result: 'Build-log findings', limit: 'A diagnosis and fix plan do not prove the build recovered.' },
  { source: 'fix', result: 'Real-tree fixes with passing available checks', limit: 'Sandbox previews and reports with only skipped checks do not count; a native rebuild may still be needed.' },
  { source: 'review / sec / arch / a11y', result: 'Review and scan findings', limit: 'Findings require developer review; a clean scan is not a prevented regression.' },
  { source: '.vectalon/upgrades/', result: 'Upgrade provenance records', limit: 'A recorded run is not proof of a successful native build or release.' },
  { source: 'feature-development', result: 'Generated test files', limit: 'Files are counted, not assumed to pass or to cover the feature.' },
]

export const metadata = {
  title: 'Vectalon engineering outcomes — evidence and limits',
  description: 'See what Vectalon can count from your local engineering reports, and what remains unverified.',
}

export default function OutcomesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <header>
        <span className="chip font-mono">vectalon/outcomes · source preview</span>
        <h1 className="mt-5 text-4xl font-bold text-fg sm:text-5xl">What the outcome ledger can count</h1>
        <p className="mt-4 max-w-3xl text-fg-muted">
          Vectalon reads local agent reports to count findings, applied fixes and recorded work.
          The next package release will stop inferring prevented regressions or a recovered build from a plan or a clean scan.
        </p>
      </header>

      <section aria-labelledby="run-ledger" className="card mt-10">
        <h2 id="run-ledger" className="text-xl font-semibold text-fg">Release status</h2>
        <p className="mt-2 text-sm text-fg-muted">
          The published 0.22.5 package still uses older outcome labels and counters. The corrected behavior below
          is in repository source, not yet in the npm package. Do not treat the published savings figure as customer evidence.
        </p>
        <p className="mt-3 text-sm text-fg-muted">
          The optional dollar figure is an assumed effort-equivalent: counted items × fixed hour weights × your selected
          hourly rate. It is not tracked developer time or measured savings.
        </p>
      </section>

      <section aria-labelledby="report-signals" className="mt-14">
        <h2 id="report-signals" className="text-2xl font-semibold text-fg">What the ledger can count</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {SIGNALS.map(signal => (
            <div key={signal.source} className="card">
              <p className="font-mono text-xs text-brand">{signal.source}</p>
              <h3 className="mt-2 font-semibold text-fg">{signal.result}</h3>
              <p className="mt-2 text-sm text-fg-muted">{signal.limit}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-12 text-sm text-fg-muted">
        For verified task outcomes with and without Vectalon, see the{' '}
        <Link href="/benchmarks" className="text-brand hover:underline">React Native evidence</Link>.
      </p>
    </div>
  )
}
