import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CSSProperties } from 'react'
import { WaitlistForm } from '../../components/WaitlistForm'
import {
  AGENT_PHASE_LABELS,
  AGENT_REPOS,
  DEFAULT_REPO,
  VERDICT_BADGE,
  agentRepo,
  isLiveRepo,
  type AgentInfo,
} from '../../lib/agents'

export const metadata = {
  title: 'Vectalon agents — 44 deterministic commands, zero model calls',
  description:
    'Every deterministic Vectalon agent — code review, security, SOC 2, release prediction, Figma sync — with its verdict and the report it produces.',
}

function AgentCard({ agent, index }: { agent: AgentInfo; index: number }) {
  return (
    <div
      className="card reveal flex flex-col !p-4"
      style={{ '--reveal-delay': `${Math.min(index * 45, 630)}ms` } as CSSProperties}
    >
      {/* command + phase */}
      <div className="flex items-center justify-between gap-2">
        <code className="font-mono text-sm font-bold text-brand">
          <span className="text-slate-600">$</span> vectalon {agent.cmd}
        </code>
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
          #{agent.item}
        </span>
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-600">
        {AGENT_PHASE_LABELS[agent.phase]}
      </div>

      {/* name + summary */}
      <h3 className="mt-3 font-semibold text-slate-50">{agent.name}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-400">{agent.summary}</p>

      {/* verdict */}
      <div className="mt-4 flex items-start gap-2 border-t border-ink-700/60 pt-3">
        <span className={`badge shrink-0 ${VERDICT_BADGE[agent.verdict]}`}>{agent.verdict}</span>
        <span className="text-xs leading-relaxed text-slate-500">{agent.verdictFor}</span>
      </div>

      {/* report it produces + deep link to the real document on /reports */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-slate-500">
        <span>
          reports → <span className="text-slate-400">{agent.report ?? `docs/vectalon/${agent.cmd}/`}</span>
        </span>
        <Link
          href={`/reports#report-${agent.cmd}`}
          className="text-brand transition hover:text-brand-strong hover:underline"
        >
          view report →
        </Link>
        {agent.flags && <span className="text-slate-600">{agent.flags}</span>}
      </div>
    </div>
  )
}

export default async function AgentsPage(props: { searchParams: Promise<{ repo?: string }> }) {
  const searchParams = await props.searchParams
  const slug = searchParams.repo ?? DEFAULT_REPO
  const repo = agentRepo(slug)
  if (!repo) notFound()

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="text-center">
        <div className="mx-auto mb-5 flex w-fit items-center gap-2">
          <span className="chip font-mono">
            vectalon<span className="text-brand">/</span>agents
          </span>
          <span className={`badge ${repo.status === 'live' ? 'badge-ok' : 'badge-warn'}`}>
            {repo.status === 'live' ? '● live' : '○ in development'}
          </span>
        </div>
        <h1 className="text-4xl font-bold text-slate-50 sm:text-5xl">
          Deterministic agents — <span className="text-brand">zero model calls</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">
          The deterministic fleet behind the control plane — the review, diagnose, and validate
          muscles that need no model. Same result every run, on any machine: each agent scans, reaches
          a verdict, and writes a report to <span className="font-mono text-slate-300">docs/vectalon/</span>.
          Free on every tier, fully offline.
        </p>
      </div>

      {/* Console frame */}
      <div className="console mt-12">
        <div className="console-head">
          <span className="flex items-center gap-2">
            <span className="text-brand">▣</span>
            <span className="text-slate-300">
              {repo.name} — {isLiveRepo(repo) ? repo.agents.length : 0} agents
            </span>
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <span className="live-dot" aria-hidden />
            deterministic
          </span>
        </div>

        {/* Repo switcher — tmux segments. The dot is the radio state: filled
            brand ● on the selected repo, hollow ○ elsewhere; seg-active paints
            the selected segment so the choice is never ambiguous. */}
        <div role="group" aria-label="Agent repo" className="flex flex-wrap items-center gap-2 border-b border-ink-700/70 px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">repo</span>
          {AGENT_REPOS.map(r => {
            const active = r.slug === slug
            return (
              <Link
                key={r.slug}
                href={`/agents?repo=${r.slug}`}
                aria-current={active ? 'page' : undefined}
                className={`seg !py-1.5 ${active ? 'seg-active' : ''}`}
              >
                <span
                  aria-hidden
                  className={
                    active
                      ? 'text-brand'
                      : r.status === 'live'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-600'
                  }
                >
                  {active ? '●' : '○'}
                </span>
                {r.name}
              </Link>
            )
          })}
        </div>

        {isLiveRepo(repo) ? (
          <div className="p-4 sm:p-6">
            <p className="mb-5 font-mono text-[11px] uppercase tracking-wider text-slate-500">
              {repo.tagline} — every verdict is word-plus-color, never color alone.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {repo.agents.map((a, i) => (
                <AgentCard key={a.cmd} agent={a} index={i} />
              ))}
            </div>
          </div>
        ) : (
          <div className="p-6 sm:p-10">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-2xl font-bold text-slate-50">
                No agents here yet — the {repo.name} harness is in development
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{repo.tagline}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                {repo.planned.map(p => (
                  <code key={p} className="rounded-[3px] border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">
                    {p}
                  </code>
                ))}
              </div>
              <p className="mt-5 font-mono text-xs text-slate-500">
                agents for {repo.package} ship with the harness
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Link href={`/sdk/${repo.slug}`} className="btn-ghost">
                  See the {repo.name} plan
                </Link>
              </div>
              <div className="mt-6 flex justify-center">
                <WaitlistForm product={repo.slug} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom strip */}
      <div className="statusline mt-6 !border-0">
        <div className="seg !block !px-6 !py-4 text-center">
          <div className="font-display text-2xl font-bold text-brand">44</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">agents in the RN harness</div>
        </div>
        <div className="seg !block !px-6 !py-4 text-center">
          <div className="font-display text-2xl font-bold text-brand">5</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">phases</div>
        </div>
        <div className="seg !block !px-6 !py-4 text-center">
          <div className="font-display text-2xl font-bold text-brand">0</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">model calls</div>
        </div>
        <div className="seg !block !px-6 !py-4 text-center">
          <div className="font-display text-2xl font-bold text-brand">$0</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">on the free tier</div>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-2">
        <Link href="/reports" className="text-sm text-brand transition hover:text-brand-strong hover:underline">
          See real generated documents — crash briefs, DX scorecards, release trains →
        </Link>
        <Link href="/docs" className="text-sm text-slate-500 transition hover:text-brand-strong hover:underline">
          Full CLI reference — every command, every flag →
        </Link>
      </div>
    </div>
  )
}
