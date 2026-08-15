'use client'

import { useState } from 'react'
import { renderMarkdown } from '../lib/renderMarkdown'
import type { ReportSample } from '../lib/reportSamples'

const VERDICT_CHIP: Record<ReportSample['verdict'], string> = {
  approved: 'badge-ok',
  'needs-attention': 'badge-warn',
  'changes-requested': 'badge-danger',
}

/**
 * Carbon.now.sh-style window: traffic-light chrome, dark terminal surface
 * (stays dark in both themes — a terminal inside a terminal), the command in
 * the title bar, and the report rendered as styled markdown with token
 * colors. The copy button copies the raw document.
 */
export function ReportWindow({ sample, index }: { sample: ReportSample; index: number }) {
  const [copied, setCopied] = useState(false)

  async function copyDoc() {
    try {
      await navigator.clipboard.writeText(sample.doc)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard unavailable — the regenerate command still shows the path */
    }
  }

  return (
    <div
      id={`report-${sample.cmd}`}
      className="report-window term scroll-mt-24 animate-fade-up"
      style={{ animationDelay: `${Math.min(index * 45, 540)}ms` }}
    >
      {/* window chrome — traffic lights + command in the title bar */}
      <div className="term-head">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="term-dot bg-[#ff5f56]" />
          <span className="term-dot bg-[#ffbd2e]" />
          <span className="term-dot bg-[#27c93f]" />
        </div>
        <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-[#E8E0C8]/70">
          <span className="truncate">
            <span className="text-[#E8E0C8]">vectalon</span>{' '}
            <span className="text-[rgb(var(--brand))]">{sample.cmd}</span>
          </span>
          <span className="hidden truncate text-[#E8E0C8]/45 sm:inline">— {sample.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`badge shrink-0 ${VERDICT_CHIP[sample.verdict]}`}>{sample.verdict}</span>
          <button
            type="button"
            onClick={copyDoc}
            aria-label={copied ? 'Copied' : `Copy the ${sample.cmd} report`}
            className="grid h-6 w-6 place-items-center rounded-[3px] border border-[rgb(var(--term-border))] text-[11px] text-[#E8E0C8]/60 transition hover:border-[#E8E0C8]/30 hover:text-[#E8E0C8]"
          >
            {copied ? '✓' : '⧉'}
          </button>
        </div>
      </div>

      {/* meta strip — where it lives + how to regenerate it */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[rgb(var(--term-border)/0.55)] px-4 py-2 font-mono text-[11px] text-[#E8E0C8]/45 sm:px-5">
        <span className="truncate">
          project <span className="text-[#E8E0C8]/70">{sample.project}</span>
        </span>
        <span className="hidden truncate md:inline">
          report <span className="text-[#E8E0C8]/70">{sample.reportPath}</span>
        </span>
        <span className="ml-auto shrink-0">
          <span className="text-[#E8E0C8]/35">$ </span>
          <span className="text-[#E8E0C8]/70">{sample.regenerate}</span>
        </span>
      </div>

      {/* the document — rendered, warts included */}
      <div className="report-body overflow-x-auto px-4 py-5 sm:px-6 sm:py-6">
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(sample.doc) }} />
      </div>
    </div>
  )
}
