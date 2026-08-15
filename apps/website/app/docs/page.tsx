import Link from 'next/link'

const FREE: Array<[string, string]> = [
  ['init', 'Scan your project and build the knowledge base'],
  ['serve', 'Run the MCP server — agents connect from your editor'],
  ['feature "…"', 'Generate components, write tests, run workflows'],
  ['doctor', 'Ecosystem + native toolchain + leaderboard readiness, with numbered fix steps'],
  ['refresh', 'Re-fetch web intel + re-seed knowledge from the repo'],
  ['status', 'One read-only health screen — daemon, MCP server, model, license'],
  ['ecosystem', 'Browse the tooling catalog — MCP servers, skills, hooks; grouped, with --info cards'],
  ['selftest', 'Test every harness feature in isolated sandboxes — live pass/fail stream'],
  ['impact', 'Cross-package blast radius — affected screens, navigation stacks, and the Maestro E2E flows that must run (with accessibility variants for covered screens)'],
  ['coverage', 'Per-screen E2E + accessibility gap dashboard with links to the open follow-up tasks'],
  ['perf', 'Static performance scan — render-phase setState, memo-defeating props, heavy startup imports, legacy bridge traffic, with ranked fixes'],
  ['bench / leaderboard', 'Run the RN benchmark suite against any model'],
]

const PRO: Array<[string, string]> = [
  ['upgrade', 'React Native / Expo upgrade copilot — rn-diff-purge diffs, AST impact analysis, codemods'],
  ['ci', 'Self-healing CI generation'],
  ['visual-ci', 'PR-mode visual regression — capture affected screens, diff vs committed baselines, post the report on the PR, exit with a gating code'],
  ['ci-incident', 'Self-healing CI gate — file a triaged incident (severity, cause, rollback suggestion) for a failed CI gate into the team brain'],
  ['visual-baseline', 'Manage the committed visual baselines — list, capture, update, prune, quarantine'],
  ['bundle', 'Bundle budget guardrails in code review'],
  ['profile', 'Hermes runtime analysis — JS-thread blocks, retained objects, leak candidates'],
  ['sandbox', 'Run commands with deny-by-default env, no network, hard time/memory limits'],
  ['render', 'Compile + headless-render generated code before the diff — Metro transform, sandboxed'],
  ['sync', 'Team brain — cross-project knowledge + cloud sync (Team)'],
  ['team-policy', 'Org-wide guardrail policy — publish/pull the team policy + shared bundle budgets through the sync remote (Team)'],
]

const AGENTS: Array<[string, string]> = [
  [
    'phase 8 — review',
    'review · arch · sec · build-fix · test-repair · refactor · deps · a11y · release-ready · bug-fix',
  ],
  [
    'phase 9 — release eng',
    'crash · arch-score · cicd · app-store · soc2 · tokens · team-stats · perms · dashboard',
  ],
  [
    'phase 10 — enterprise',
    'figma · sentry · observability · governance · audit · repos · release-predict · play-store · dataset · lora',
  ],
]

const STEPS = [
  {
    n: '01',
    title: 'Install & init',
    code: 'npx vectalon init',
    body: 'Scans the repo, seeds the knowledge base, and enables the ecosystem items your project needs. No config files to write — Vectalon owns its own knowledge.',
  },
  {
    n: '02',
    title: 'Serve the agent',
    code: 'npx vectalon serve',
    body: 'Boots the MCP server. Your editor or any MCP client connects and gets 58+ project-aware tools — plus 29 deterministic agent commands that need no model at all. Web intel and the knowledge base auto-refresh hourly.',
  },
  {
    n: '03',
    title: 'Use it',
    code: 'npx vectalon feature "login screen with auth API"',
    body: 'PRD → stories → acceptance criteria → implementation → tests → review. Every fix is compile-checked before it lands, and the terminal explains itself — live phase progress, a command feed, and parsed failure cards on failure.',
  },
]

/** A man(1) section heading: NAME, SYNOPSIS, COMMANDS … */
function ManH({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'accent' }) {
  return (
    <h2
      className={`mt-10 flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em] first:mt-0 ${
        tone === 'accent' ? 'text-brand' : 'text-slate-500'
      }`}
    >
      {children}
      <span className="h-px flex-1 bg-ink-700/60" aria-hidden />
    </h2>
  )
}

/** A command entry: bold command name, indented description (hanging indent). */
function ManCmd({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[240px_1fr] sm:gap-6">
      <code className="font-mono text-sm font-semibold text-slate-50">{cmd}</code>
      <p className="text-sm leading-relaxed text-slate-400">{desc}</p>
    </div>
  )
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-slate-50">Documentation</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          From zero to an agent that knows your React Native project. The full command
          reference lives in the repo — this is the fast path.
        </p>
      </div>

      {/* man vectalon — the whole page is one console frame */}
      <div className="console">
        <div className="console-head">
          <span className="flex items-center gap-2">
            <span className="text-brand">$</span>
            man vectalon
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <span className="live-dot" aria-hidden />
            v0.8.0
          </span>
        </div>

        <div className="px-5 py-6 sm:px-8 sm:py-8">
          {/* NAME */}
          <ManH>name</ManH>
          <p className="mt-3 font-mono text-sm text-slate-300">
            <span className="font-bold text-slate-50">vectalon</span> — the AI harness that lives
            in your terminal
          </p>

          {/* SYNOPSIS */}
          <ManH>synopsis</ManH>
          <pre className="mt-3 overflow-x-auto font-mono text-sm leading-relaxed text-slate-300">
            <span className="text-brand">$</span> npx vectalon &lt;command&gt; [options]
            {'\n'}
            <span className="text-slate-600">$</span> npx vectalon feature "login screen with auth API"
          </pre>

          {/* QUICKSTART */}
          <ManH>quickstart</ManH>
          <div className="mt-3 divide-y divide-ink-700/50">
            {STEPS.map(s => (
              <div key={s.n} className="grid gap-2 py-3 sm:grid-cols-[240px_1fr] sm:gap-6">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-slate-600">[{s.n}]</span>
                  <code className="font-mono text-sm font-semibold text-brand">{s.code}</code>
                </div>
                <div>
                  <div className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {s.title}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{s.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* COMMANDS — free */}
          <ManH tone="accent">commands · free — genuinely useful</ManH>
          <div className="mt-3 divide-y divide-ink-700/50 border-t border-ink-700/50">
            {FREE.map(([cmd, desc]) => (
              <ManCmd key={cmd} cmd={cmd} desc={desc} />
            ))}
          </div>

          {/* COMMANDS — pro */}
          <ManH tone="accent">commands · pro — teams & hard problems</ManH>
          <div className="mt-3 divide-y divide-ink-700/50 border-t border-ink-700/50">
            {PRO.map(([cmd, desc]) => (
              <ManCmd key={cmd} cmd={cmd} desc={desc} />
            ))}
          </div>

          {/* AGENTS — free on every tier */}
          <ManH tone="accent">agents — deterministic, free, report-driven</ManH>
          <div className="mt-3 divide-y divide-ink-700/50 border-t border-ink-700/50">
            {AGENTS.map(([phase, cmds]) => (
              <div key={phase} className="grid gap-1 py-2.5 sm:grid-cols-[240px_1fr] sm:gap-6">
                <code className="font-mono text-sm font-semibold text-brand">{phase}</code>
                <p className="font-mono text-[13px] leading-relaxed text-slate-400">{cmds}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 font-mono text-xs text-slate-500">
            One card per agent — verdict, triggers, and the report it produces — on the{' '}
            <Link href="/agents" className="text-brand transition hover:text-brand-strong hover:underline">
              agents catalog →
            </Link>
          </p>

          {/* SEE ALSO */}
          <ManH>see also</ManH>
          <ul className="mt-3 space-y-2 font-mono text-sm">
            <li>
              <span className="text-slate-600">vectalon-cli(1)</span>{' '}
              <Link
                href="https://github.com/Vectalon/Vectalon/blob/main/apps/website/docs/CLI_REFERENCE.md"
                target="_blank"
                className="text-brand transition hover:text-brand-strong hover:underline"
              >
                full CLI reference in the repo →
              </Link>
            </li>
            <li>
              <span className="text-slate-600">vectalon-telemetry(7)</span>{' '}
              <Link
                href="https://github.com/Vectalon/Vectalon/blob/main/apps/website/docs/TELEMETRY.md"
                target="_blank"
                className="text-brand transition hover:text-brand-strong hover:underline"
              >
                telemetry formats →
              </Link>
            </li>
            <li>
              <span className="text-slate-600">vectalon-trial(1)</span>{' '}
              <Link href="/trial" className="text-brand transition hover:text-brand-strong hover:underline">
                start the 14-day Pro trial →
              </Link>
            </li>
            <li>
              <span className="text-slate-600">vectalon-team-policy(7)</span>{' '}
              <Link
                href="https://github.com/Vectalon/Vectalon/blob/main/apps/website/docs/TEAM_POLICY.md"
                target="_blank"
                className="text-brand transition hover:text-brand-strong hover:underline"
              >
                org-wide guardrail policy setup →
              </Link>
            </li>
          </ul>

          {/* TRIAL CTA — the prompt line */}
          <div className="mt-10 rounded-[3px] border border-ink-700 bg-ink-900 px-4 py-3.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm text-slate-300">
              <span className="text-brand">vectalon@main:~$</span> npx vectalon trial --14-days
              <span className="caret" />
            </p>
            <p className="mt-1.5 font-mono text-[11px] text-slate-500">
              14 days, no credit card — one GitHub login. The full upgrade copilot included.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
