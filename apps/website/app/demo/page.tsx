import Link from 'next/link'

/**
 * The flagship demonstration — the feature workflow, live.
 *
 * The most impressive thing in the repo, as a hero surface. One command,
 * "vectalon feature 'Build a Login feature.'", produces Requirement →
 * Architecture decision → Affected files → Implementation plan → Code →
 * Tests → Review → Build verification → PR — and when a gate fails, the
 * self-healing loop (build failed → diagnose → modify → rebuild → verify)
 * runs it back through implementation until it passes.
 */

const PIPELINE = [
  { n: '1', label: 'Requirement', mark: '✓', product: 'PRD — what we build and why' },
  { n: '2', label: 'Scope', mark: '✓', product: 'In/out-of-scope + impact' },
  { n: '3', label: 'Affected files', mark: '·', product: 'Blast radius across screens, navigation, tests' },
  { n: '4', label: 'Design', mark: '✓', product: 'UX spec, states, a11y' },
  { n: '5', label: 'Architecture decision', mark: '✓', product: 'ADR — modules, API, state, native' },
  { n: '6', label: 'Implementation plan', mark: '✓', product: 'Task breakdown with dependencies' },
  { n: '7', label: 'Tests', mark: '✓', product: 'TDD tests written first' },
  { n: '8', label: 'Code', mark: '✓', product: 'The feature, compile-gated' },
  { n: '9', label: 'Review', mark: '✓', product: 'Self-review against standards' },
  { n: '10', label: 'Build verification', mark: '✓', product: 'tsc + jest + lint, real checks' },
  { n: '11', label: 'Readiness', mark: '✓', product: 'Release-ready gate' },
  { n: '12', label: 'PR', mark: '✓', product: 'Branch + pull request' },
  { n: '13', label: 'Documentation', mark: '✓', product: 'Docs updated' },
  { n: '14', label: 'Close', mark: '✓', product: 'Board closed, follow-ups filed' },
]

const HEAL_LOOP = ['Build failed', 'diagnose', 'modify', 'rebuild', 'verify']

const HEAL_STEPS = [
  { label: 'Build failed', detail: 'verification or readiness fails' },
  { label: 'diagnose', detail: 'failure facts extracted from the report — which check, what exit code, the first error line' },
  { label: 'modify', detail: 'implementation regenerates with the failure context injected' },
  { label: 'rebuild', detail: 'the failing stage is retried against the new code' },
  { label: 'verify', detail: 'the loop repeats until the gate passes or attempts run out' },
]

const REAL_RUN_FILES = [
  'src/screens/CreateLoginScreenEmailPasswordScreen.tsx',
  'src/hooks/useCreateLoginScreenEmailPassword.ts',
  'src/services/CreateLoginScreenEmailPasswordApi.ts',
  'src/__tests__/CreateLoginScreenEmailPassword.tsx',
  '.maestro/CreateLoginScreenEmailPassword.yaml',
]

export const metadata = {
  title: 'Vectalon — the feature workflow, live',
  description:
    'One command. "vectalon feature \'Build a Login feature.\'" produces Requirement → Architecture decision → Affected files → Implementation plan → Code → Tests → Review → Build verification → PR — and self-heals when a gate fails.',
}

function TerminalLine({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[12.5px] leading-6 text-term-ink/90">{children}</div>
}

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="text-center">
        <div className="mx-auto mb-5 flex w-fit items-center gap-2">
          <span className="chip font-mono">
            vectalon<span className="text-brand">/</span>demo
          </span>
          <span className="badge badge-ok">● zero model calls</span>
        </div>
        <h1 className="text-4xl font-bold text-slate-50 sm:text-5xl">
          The feature workflow, <span className="text-brand">live</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">
          Type one sentence. Vectalon runs the whole loop — requirement,
          architecture decision, affected files, implementation plan, code,
          tests, review, build verification, pull request — and when a gate
          fails, it <em className="text-slate-300">diagnoses, modifies, rebuilds, and
          re-verifies</em> until the build passes. This is the demo, not a
          promise: it is a real workflow run against the demo app.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <span className="font-mono text-sm text-slate-300">
            <span className="text-brand">$</span> vectalon feature &quot;Build a Login
            feature.&quot;
          </span>
        </div>
      </div>

      {/* The pipeline — the hero block */}
      <div className="mt-12 overflow-hidden rounded-lg border border-ink-700/60 bg-ink-900/80 shadow-2xl">
        <div className="term-head">
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="term-dot bg-[#ff5f56]" />
            <span className="term-dot bg-[#ffbd2e]" />
            <span className="term-dot bg-[#27c93f]" />
          </div>
          <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-term-ink/70">
            <span className="truncate">
              <span className="text-term-ink">vectalon</span>{' '}
              <span className="text-[rgb(var(--brand))]">feature &quot;Build a Login feature.&quot;</span>
            </span>
          </div>
          <span className="badge shrink-0 badge-ok">approved</span>
        </div>
        <div className="border-t border-term-frame/60 px-5 py-5">
          <TerminalLine>
            <span className="text-term-ink/50">$</span>{' '}
            <span className="text-term-ink">vectalon feature</span>{' '}
            <span className="text-[rgb(var(--brand))]">&quot;Build a Login feature.&quot;</span>
          </TerminalLine>
          <div className="mt-3 space-y-0.5">
            {PIPELINE.map(stage => (
              <TerminalLine key={stage.n}>
                <span className={stage.mark === '✓' ? 'text-emerald-400' : 'text-term-ink/40'}>
                  {stage.mark}
                </span>{' '}
                <span className="text-term-ink/45">{String(stage.n).padStart(2)}</span>{' '}
                <span className="inline-block w-[170px] text-term-ink">
                  {stage.label}
                </span>
                <span className="text-term-ink/40">{stage.product}</span>
              </TerminalLine>
            ))}
          </div>
          <div className="mt-4 border-t border-term-frame/40 pt-3">
            <TerminalLine>
              <span className="text-slate-500">
                From a real run: &quot;create a login screen with email password&quot; —{' '}
                <span className="text-emerald-400">13/13 stages completed</span> ·{' '}
                <span className="text-term-ink/80">7 files written</span>
              </span>
            </TerminalLine>
            {REAL_RUN_FILES.map(f => (
              <TerminalLine key={f}>
                <span className="text-emerald-400">✔</span>{' '}
                <span className="text-term-ink/80">{f}</span>
              </TerminalLine>
            ))}
            <TerminalLine>
              <span className="text-term-ink/45">… +2 more</span>
            </TerminalLine>
          </div>
        </div>
      </div>

      {/* The self-healing loop */}
      <div className="mt-14">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-50">The self-healing loop</h2>
          <span className="badge badge-warn">when a gate fails</span>
        </div>
        <p className="mt-2 max-w-2xl text-slate-400">
          Verification and readiness are real gates — <span className="font-mono text-slate-300">tsc</span>,{' '}
          <span className="font-mono text-slate-300">jest</span>,{' '}
          <span className="font-mono text-slate-300">lint</span> run against the generated code. When a
          check fails, the workflow doesn&apos;t stop and hand you an error: it extracts the failing
          facts, sends them back to implementation, regenerates, and retries the gate.
        </p>
        <div className="mt-5 overflow-hidden rounded-lg border border-ink-700/60 bg-ink-900/80">
          <div className="border-t border-term-frame/60 px-5 py-5">
            <TerminalLine>
              <span className="text-slate-300">
                {HEAL_LOOP.map((h, i) => (
                  <span key={h}>
                    {i > 0 && <span className="text-term-ink/40"> → </span>}
                    <span className={i === 0 ? 'text-red-400' : 'text-amber-300'}>{h}</span>
                  </span>
                ))}
              </span>
            </TerminalLine>
            <div className="mt-4 space-y-2">
              {HEAL_STEPS.map(step => (
                <TerminalLine key={step.label}>
                  <span className="text-term-ink/40">·</span>{' '}
                  <span className={step.label === 'Build failed' ? 'text-red-300' : 'text-amber-200'}>
                    {step.label}
                  </span>{' '}
                  <span className="text-term-ink/50">— {step.detail}</span>
                </TerminalLine>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* The three-way story */}
      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: 'The workflow',
            body: 'Fourteen phases from PRD to close — every artifact written to docs/vectalon/ in your repo, visible in version control.',
          },
          {
            title: 'The self-healing loop',
            body: 'A failing gate feeds its own failure facts back into implementation. The workflow fixes itself, bounded, until it passes.',
          },
          {
            title: 'The control plane',
            body: 'Intel first, score to measure, fix to repair, mode to control where it runs — this workflow is the whole system in motion.',
          },
        ].map(card => (
          <div key={card.title} className="rounded-lg border border-ink-700/60 bg-ink-900/50 p-5">
            <div className="font-mono text-sm font-semibold text-brand">{card.title}</div>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{card.body}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-14 text-center">
        <div className="mx-auto max-w-xl rounded-lg border border-ink-700/60 bg-ink-900/50 p-6">
          <p className="font-mono text-sm text-slate-300">
            Run it on your own repo — the workflow, the docs, and the healing loop are yours:
          </p>
          <div className="mt-3 font-mono text-sm text-slate-400">
            <span className="text-brand">$</span> npx vectalon feature &quot;Build a Login
            feature.&quot;
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/docs"
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Read the docs
            </Link>
            <Link
              href="/agents"
              className="rounded-md border border-ink-600 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-brand hover:text-brand"
            >
              See the 44 agents
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
