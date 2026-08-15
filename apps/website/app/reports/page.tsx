import Link from 'next/link'
import { REPORT_SAMPLES, type ReportSample } from '../../lib/reportSamples'

export const metadata = {
  title: 'Vectalon — generated documents, real reports',
  description:
    'All 40 real documents vectalon generates — crash intelligence, incident briefs, DX scorecards, sentry triage, release trains, and every other agent report — shown exactly as written to docs/vectalon/.',
}

const VERDICT_CHIP: Record<ReportSample['verdict'], string> = {
  approved: 'badge-ok',
  'needs-attention': 'badge-warn',
  'changes-requested': 'badge-danger',
}

function ReportFrame({ sample, index }: { sample: ReportSample; index: number }) {
  return (
    <div
      id={`report-${sample.cmd}`}
      className="console animate-fade-up scroll-mt-24"
      style={{ animationDelay: `${Math.min(index * 60, 480)}ms` }}
    >
      {/* console head — the command that produced this document */}
      <div className="console-head">
        <span className="flex items-center gap-2">
          <span className="text-brand">$</span>
          <span className="font-mono text-slate-300">vectalon {sample.cmd}</span>
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <span className={`badge shrink-0 ${VERDICT_CHIP[sample.verdict]}`}>{sample.verdict}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{sample.name}</span>
        </span>
      </div>

      {/* meta strip — where it lives + how to regenerate it */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-ink-700/70 px-4 py-2 font-mono text-[11px] text-slate-500">
        <span>
          project <span className="text-slate-400">{sample.project}</span>
        </span>
        <span>
          report <span className="text-slate-400">{sample.reportPath}</span>
        </span>
        <span className="ml-auto">
          regenerate <span className="text-brand">$ {sample.regenerate}</span>
        </span>
      </div>

      {/* the document itself — exactly as vectalon wrote it */}
      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-4 py-4 font-mono text-[12.5px] leading-relaxed text-slate-300 sm:px-6 sm:py-5">
        {sample.doc}
      </pre>
    </div>
  )
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
          — one per agent, all 40 of them — generated against the demo app and rendered{' '}
          <em>exactly as written</em>. Verdicts included, warts included, honest
          “nothing to fix” verdicts included. Regenerate any of them with the command shown.
        </p>
      </div>

      {/* coverage strip — every verdict, every command */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <span className="badge badge-ok">
          {VERDICT_COUNT.approved} approved
        </span>
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

      <div className="mt-12 space-y-8">
        {REPORT_SAMPLES.map((s, i) => (
          <ReportFrame key={s.cmd} sample={s} index={i} />
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Link href="/agents" className="text-sm text-brand transition hover:text-brand-strong hover:underline">
          The 40 agents that produce these documents →
        </Link>
        <p className="font-mono text-xs text-slate-500">
          all {REPORT_SAMPLES.length} verified end-to-end — each one writes a report like these to
          docs/vectalon/&lt;cmd&gt;/ · synced from the demo with scripts/sync-reports.mjs
        </p>
      </div>
    </div>
  )
}
