import Link from 'next/link'
import { REPORT_SAMPLES, type ReportSample } from '../../lib/reportSamples'
import { ReportWindow } from '../../components/ReportWindow'

export const metadata = {
  title: 'Vectalon — generated documents, real reports',
  description:
    'All 44 real documents vectalon generates — crash intelligence, incident briefs, DX scorecards, sentry triage, release trains, build archives, and every other agent report — shown exactly as written to docs/vectalon/.',
}

const VERDICT_COUNT = REPORT_SAMPLES.reduce<Record<ReportSample['verdict'], number>>(
  (acc, s) => {
    acc[s.verdict] += 1
    return acc
  },
  { approved: 0, 'needs-attention': 0, 'changes-requested': 0 },
)

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="text-center">
        <div className="mx-auto mb-5 flex w-fit items-center gap-2">
          <span className="chip font-mono">
            vectalon<span className="text-brand">/</span>docs
          </span>
          <span className="badge badge-ok">● real output</span>
        </div>
        <h1 className="text-4xl font-bold text-slate-50 sm:text-5xl">
          Generated documents — <span className="text-brand">no filler</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">
          Every agent ends in the same place: a report written to{' '}
          <span className="font-mono text-slate-300">docs/vectalon/</span> in your project. Below
          are <span className="font-mono text-slate-300">all {REPORT_SAMPLES.length} documents</span>{' '}
          — one per agent, all 44 of them — generated against the demo app and rendered{' '}
          <em>exactly as written</em>. Verdicts included, warts included, honest
          “nothing to fix” verdicts included. Regenerate any of them with the command shown.
        </p>
      </div>

      {/* coverage strip — every verdict, every command */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <span className="badge badge-ok">{VERDICT_COUNT.approved} approved</span>
        <span className="badge badge-warn">
          {VERDICT_COUNT['needs-attention']} needs attention
        </span>
        <span className="badge badge-danger">
          {VERDICT_COUNT['changes-requested']} changes requested
        </span>
      </div>

      {/* command index — every agent, at a glance */}
      <div className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-1.5">
        {REPORT_SAMPLES.map(s => (
          <span key={s.cmd} className="font-mono text-[11px] text-slate-500">
            {s.cmd}
          </span>
        ))}
      </div>

      {/* the documents — one carbon window per agent */}
      <div className="relative mt-14 space-y-10">
        {/* carbon dot-grid backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(rgb(var(--slate-700)/0.35)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]"
        />
        {REPORT_SAMPLES.map((s, i) => (
          <ReportWindow key={s.cmd} sample={s} index={i} />
        ))}
      </div>

      <div className="mt-12 flex flex-col items-center gap-3">
        <Link href="/agents" className="text-sm text-brand transition hover:text-brand-strong hover:underline">
          The 48 agents that produce these documents →
        </Link>
        <p className="font-mono text-xs text-slate-500">
          all {REPORT_SAMPLES.length} verified end-to-end — each one writes a report like these to
          docs/vectalon/&lt;cmd&gt;/ · synced from the demo with scripts/sync-reports.mjs
        </p>
      </div>
    </div>
  )
}
