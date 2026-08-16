import Link from 'next/link'

const FREE: Array<[string, string]> = [
  ['fix "issue"', 'THE workflow — tell it what\'s broken (or pass --log) and get root cause → evidence → impact → recommended fix → applied → verification → confidence in one structured verdict, applied in a sandbox by default'],
  ['score', 'The Vectalon Engineering Health Score — one 0-100 number from eight dimensions, the delta vs your last run, and P0/P1/P2 actions'],
  ['init', 'The 15-minute proof of value — scan the project, build the knowledge base, and end with the scan summary + Health Score + Top 5 problems. No LLM config asked'],
  ['mode', 'Where your source runs — Cloud (hosted models) / Private (company LLM) / Air-gapped (local model, nothing leaves the machine); enforced, not labeled'],
  ['demo', 'The flagship demonstration — the feature workflow, live: Requirement → … → PR + the self-healing loop, from a real prior run when present, zero model calls'],
  ['brain', 'The productized Team Brain — ask "Why Zustand?" and get the decision card (ADR, reason, approver, related, reviewed); ask "Who owns auth?" and get the expertise tree (owner, experts, ADRs, services, changes)'],
  ['serve', 'Run the MCP server — agents connect from your editor'],
  ['feature "…"', 'Generate components, write tests, run workflows'],
  ['doctor', 'Ecosystem + native toolchain + leaderboard readiness, with numbered fix steps'],
  ['refresh', 'Re-fetch web intel + re-seed knowledge from the repo'],
  ['status', 'One read-only health screen — daemon, MCP server, model, license'],
  ['ecosystem', 'Browse the tooling catalog — MCP servers, skills, hooks; grouped, with --info cards'],
  ['models', 'List the local model tiers — fast (1.5B) / balanced (3B) / quality (7B) — with the one auto-selected for your RAM; init picks it for you'],
  ['pull [tier]', 'Download the local GGUF model — a usage tier (fast|balanced|quality) or a model id; defaults to your machine’s auto-selected tier'],
  ['selftest', 'Test every harness feature in isolated sandboxes — live pass/fail stream'],
  ['impact', 'Cross-package blast radius — affected screens, navigation stacks, and the Maestro E2E flows that must run (with accessibility variants for covered screens)'],
  ['coverage', 'Per-screen E2E + accessibility gap dashboard with links to the open follow-up tasks'],
  ['perf', 'Static performance scan — render-phase setState, memo-defeating props, heavy startup imports, legacy bridge traffic, with ranked fixes'],
  ['bench / leaderboard', 'Run the RN benchmark suite against any model — --preset fast|balanced|quality runs the local tiers'],
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
    'review · arch · sec · build-fix · test-repair · refactor · deps · a11y · release-ready · bug-fix · score',
  ],
  [
    'phase 9 — release eng',
    'crash · arch-score · cicd · app-store · soc2 · tokens · team-stats · perms · dashboard',
  ],
  [
    'phase 10 — enterprise',
    'figma · sentry · observability · governance · audit · repos · release-predict · play-store · dataset · lora',
  ],
  [
    'phase 11 — platform & github',
    'gh-pr · gh-issue · gh-ci · gh-sec · monitor · evals · search · incident · train · cost · dx',
  ],
]

const REPORTS: Array<{ n: string; code: string; title: string; body: string }> = [
  {
    n: '01',
    code: 'vectalon <agent>',
    title: 'In the terminal',
    body: 'Every run prints the verdict, severity-ranked findings, and the fix plan to stdout — `vectalon dashboard` prints the aggregate across every agent.',
  },
  {
    n: '02',
    code: 'docs/vectalon/<cmd>/report.md',
    title: 'In your repo',
    body: 'Each agent writes report.md + report.json into your project — plain markdown/JSON that renders on GitHub/GitLab and in editors, and is machine-readable for your own dashboards or CI gates. Gitignored by default: reports stay local unless you commit or share them.',
  },
  {
    n: '03',
    code: 'vectalon dashboard',
    title: 'One HTML file, in a browser',
    body: 'Aggregates every agent report into docs/vectalon/dashboard/report.html — a self-contained page with per-agent drill-down, search, and severity filters. No server, works offline, portable: attach it to a PR or host it anywhere.',
  },
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
    body: 'Boots the MCP server. Your editor or any MCP client connects and gets 58+ project-aware tools — plus 44 deterministic agent commands that need no model at all. The VS Code extension (vectalon-dev, free) connects here: one-click workflows, inline guardrail status, and the team knowledge base. Web intel and the knowledge base auto-refresh hourly.',
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

      {/* man vectalon — one carbon window, like the report documents */}
      <div className="term report-window man-term">
        <div className="term-head">
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="term-dot bg-[#ff5f56]" />
            <span className="term-dot bg-[#ffbd2e]" />
            <span className="term-dot bg-[#27c93f]" />
          </div>
          <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-term-ink/70">
            <span className="truncate">
              <span className="text-term-ink">$</span>{' '}
              <span className="text-[rgb(var(--brand))]">man vectalon</span>
            </span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-term-ink/45">
            <span className="live-dot" aria-hidden />
            v0.12.0
          </span>
        </div>

        <div className="man-body px-5 py-6 sm:px-8 sm:py-8">
          {/* NAME */}
          <ManH>name</ManH>
          <p className="mt-3 font-mono text-sm text-slate-300">
            <span className="font-bold text-slate-50">vectalon</span> — the AI engineering control
            plane for React Native teams: give it a repository and it continuously understands,
            reviews, diagnoses, upgrades, and validates the application
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

          {/* REPORTS — the three local paths for reading your own reports */}
          <ManH tone="accent">reports — see your own</ManH>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Reports never leave your project unless you share them. Three ways to read them:
          </p>
          <div className="mt-3 divide-y divide-ink-700/50 border-t border-ink-700/50">
            {REPORTS.map(r => (
              <div key={r.n} className="grid gap-2 py-3 sm:grid-cols-[240px_1fr] sm:gap-6">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-slate-600">[{r.n}]</span>
                  <code className="font-mono text-sm font-semibold text-brand">{r.code}</code>
                </div>
                <div>
                  <div className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {r.title}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{r.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 font-mono text-xs text-slate-500">
            The documents on this site are generated from a demo project —{' '}
            <Link href="/reports" className="text-brand transition hover:text-brand-strong hover:underline">
              see the real output →
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
              <span className="text-slate-600">vectalon-vscode(7)</span>{' '}
              <Link
                href="https://marketplace.visualstudio.com/items?itemName=vectalon-dev.vectalon"
                target="_blank"
                className="text-brand transition hover:text-brand-strong hover:underline"
              >
                VS Code extension — workflow commands, guardrail status, knowledge base →
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
