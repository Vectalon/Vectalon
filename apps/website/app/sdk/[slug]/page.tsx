import Link from 'next/link'
import { notFound } from 'next/navigation'
import { WaitlistForm } from '../../../components/WaitlistForm'
import { checkoutUrlFor, type ProductId } from '../../../lib/lemon-squeezy'

interface SdkData {
  name: string
  status: 'live' | 'soon'
  statusLabel: string
  tagline: string
  description: string
  features: Array<{ title: string; body: string }>
  install: string
  note: string
}

const SDK_DATA: Record<string, SdkData> = {
  'react-native': {
    name: 'React Native',
    status: 'live',
    statusLabel: 'Live — v0.12.0',
    tagline: 'The full harness — context, codegen, upgrade copilot, device control, regression coverage, and 44 deterministic agents.',
    description:
      'The original Vectalon harness. Scans your RN project, builds a living knowledge graph, runs a local MCP-aware agent over 58 project-aware tools, keeps the model current with ecosystem releases — every hour — and ships 44 deterministic agent commands (review, security, SOC 2, GitHub PR triage, incident command, archive, share, …) that need no model at all.',
    features: [
      { title: 'MCP-native agent', body: 'Feature workflows, code review, E2E generation, and device control over the MCP protocol your editor already speaks.' },
      { title: 'Impact regression coverage', body: 'Changed files map to affected screens, each gets a Maestro regression flow with an accessibility variant for covered screens — screens without a deterministic route are flagged, followed up, and tracked in the coverage dashboard.' },
      { title: 'Upgrade Copilot', body: 'rn-diff-purge diffs, AST-grade impact analysis, and codemods mapped across every native and JS/TS change.' },
      { title: 'Guardrails on save', body: 'Pressable, no leaked renders, New Architecture hazards — hallucination-verified findings in editor and review.' },
      { title: 'Bundle budget guardrails', body: 'Metro bundle deltas tracked per package with swap candidates and replacement suggestions.' },
      { title: 'Device control', body: 'Simulators, taps, swipes, deep links, VoiceOver/TalkBack trees, and visual regression checks from the CLI.' },
      { title: 'Compile-checked healing', body: 'Every fix is typechecked before it lands; fixes that don’t reduce errors are reverted.' },
      { title: 'Deterministic agent fleet', body: '44 agent commands across five phases — code review, security, build/test repair, SOC 2, CI/CD, store readiness, team analytics, enterprise intelligence (sentry, observability, governance, audit, release prediction, dataset, LoRA), platform intelligence (PR triage, workflow reliability, incident command, release train, cost governance, DX scoring), and archive & share (build archive, TestFlight/Play/SaaS distribution, local sharing, white-label portals). Deterministic, no model required, each with a report and a verdict.' },
      { title: 'Executive dashboard', body: 'vectalon dashboard aggregates every agent report into one executive view — per-agent health cards, an overall verdict, and a self-contained HTML dashboard with click-through drill-down, severity filters, and full-text search.' },
    ],
    install: 'npx vectalon init',
    note: 'Free tier: init, serve, feature, doctor, plus all 44 deterministic agent commands. Pro adds upgrade copilot, self-healing CI, and bundle budgets.',
  },
  ios: {
    name: 'iOS',
    status: 'soon',
    statusLabel: 'In development',
    tagline: 'Swift + SwiftUI harness — Figma-accurate codegen, safe-area linting, Xcode healing.',
    description:
      'The iOS harness brings the same living knowledge base and MCP agent to Swift. Design-accurate SwiftUI codegen, Auto Layout and safe-area linting, Xcode build healing, and VoiceOver verification — with the simulator control loop from the CLI.',
    features: [
      { title: 'SwiftUI codegen from Figma', body: 'Sizes, spacing, colors, and radius map 1:1 from the design file — no guesswork.' },
      { title: 'Auto Layout & safe-area linting', body: 'Catch constraint breakage and safe-area violations in code review before they ship.' },
      { title: 'Xcode build healing', body: 'Compiler-error-driven fixes with the same compile-checked loop as the RN harness.' },
      { title: 'Dependency health', body: 'CocoaPods / SPM manifest health with maintenance and swap signals.' },
      { title: 'Simulator control', body: 'Boot, screenshot, tap, swipe, deep links, and VoiceOver tree dumps.' },
      { title: 'New Architecture templates', body: 'Deterministic TurboModule scaffolding with codegen wiring.' },
    ],
    install: 'npx vectalon init --platform ios',
    note: 'On the waitlist? We’ll email the moment the beta opens.',
  },
  android: {
    name: 'Android',
    status: 'soon',
    statusLabel: 'In development',
    tagline: 'Kotlin + Compose harness — Gradle health, manifest linting, emulator control.',
    description:
      'The Android harness applies the Vectalon loop to Kotlin and Jetpack Compose: manifest and permission linting, Gradle/AGP upgrade mapping, emulator control, TalkBack verification, and deterministic native-module scaffolding.',
    features: [
      { title: 'Compose codegen', body: 'Design-accurate Kotlin components with theme-token extraction from the design file.' },
      { title: 'Gradle & AGP health', body: 'Dependency drift, maintenance signals, and version mapping for safe upgrades.' },
      { title: 'Manifest & permission linting', body: 'Missing permissions, exported components, and cleartext-traffic hazards in review.' },
      { title: 'Emulator control', body: 'Boot AVDs, capture screenshots, tap/swipe, and read logcat from the CLI.' },
      { title: 'TalkBack verification', body: 'Dump the accessibility tree and verify announcements end-to-end.' },
      { title: 'New Architecture templates', body: 'Deterministic TurboModule + codegen scaffolding in Kotlin.' },
    ],
    install: 'npx vectalon init --platform android',
    note: 'On the waitlist? We’ll email the moment the beta opens.',
  },
  flutter: {
    name: 'Flutter',
    status: 'soon',
    statusLabel: 'In development',
    tagline: 'Dart + Widget harness — pub.dev health, widget-test generation, golden checks.',
    description:
      'The Flutter harness brings the Vectalon loop to Dart: pub.dev dependency health with swap candidates, widget-test generation from acceptance criteria, golden-file visual checks, and hot-reload-safe refactor suggestions.',
    features: [
      { title: 'Widget codegen', body: 'Design-accurate Dart widgets from Figma frames with extracted tokens.' },
      { title: 'pub.dev dependency health', body: 'Version drift, maintenance signals, and weekly-download context per package.' },
      { title: 'Widget-test generation', body: 'Given/When/Then acceptance criteria turned into deterministic widget tests.' },
      { title: 'Golden visual checks', body: 'Baseline screenshots diffed in CI — regressions flagged before merge.' },
      { title: 'Hot-reload-safe refactors', body: 'Refactor suggestions scoped so the running app stays consistent.' },
      { title: 'Accessibility checks', body: 'Semantics tree verification against the a11y ruleset.' },
    ],
    install: 'npx vectalon init --platform flutter',
    note: 'On the waitlist? We’ll email the moment the beta opens.',
  },
}

export function generateStaticParams() {
  return Object.keys(SDK_DATA).map(slug => ({ slug }))
}

export default function SdkPage({ params }: { params: { slug: string } }) {
  const sdk = SDK_DATA[params.slug]
  if (!sdk) notFound()

  const proUrl = checkoutUrlFor('pro', params.slug as ProductId)
  const allAccessUrl = checkoutUrlFor('all-access')

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      {/* Hero */}
      <section className="text-center">
        <div className="mx-auto mb-5 flex w-fit items-center gap-2">
          <span className="chip font-mono">
            vectalon<span className="text-brand">/</span>
            {params.slug}
          </span>
          <span className={`badge ${sdk.status === 'live' ? 'badge-ok' : 'badge-warn'}`}>
            {sdk.statusLabel}
          </span>
        </div>
        <h1 className="text-4xl font-bold text-slate-50 sm:text-5xl">{sdk.name}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300">{sdk.tagline}</p>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">{sdk.description}</p>
      </section>

      {/* Install / waitlist */}
      <section className="mt-10 flex flex-col items-center gap-5">
        {sdk.status === 'live' ? (
          <>
            <div className="term w-full max-w-xl">
              <div className="term-head">
                <span className="text-xs text-term-meta">terminal</span>
              </div>
              <pre className="term-body text-sm">
                <span className="text-term-brand">$</span> {sdk.install}
                <span className="caret ml-1.5" />
              </pre>
            </div>
            <p className="max-w-xl text-center text-xs text-slate-500">{sdk.note}</p>
          </>
        ) : (
          <>
            <WaitlistForm product={params.slug} />
            <p className="max-w-xl text-center text-xs text-slate-500">{sdk.note}</p>
          </>
        )}
      </section>

      {/* Features */}
      <section className="mt-20">
        <h2 className="text-center text-2xl font-bold text-slate-50">What it does</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sdk.features.map(f => (
            <div key={f.title} className="card transition hover:-translate-y-0.5 hover:border-brand/50">
              <h3 className="font-semibold text-slate-50">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing mini */}
      <section className="mt-20">
        <h2 className="text-center text-2xl font-bold text-slate-50">Pricing</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-400">
          Per-platform Pro license, or one All-Access key for every Vectalon SDK.
        </p>
        <div className="mx-auto mt-8 grid max-w-4xl gap-5 md:grid-cols-3">
          <div className="card flex flex-col">
            <div className="font-mono text-xs font-semibold text-slate-400">Pro — {sdk.name}</div>
            <div className="mt-1 font-display text-3xl font-bold text-slate-50">
              $19<span className="text-sm font-normal text-slate-500">/mo</span>
            </div>
            <p className="mt-2 flex-1 text-sm text-slate-400">
              All Pro features for this platform. 14-day trial, one GitHub login.
            </p>
            {sdk.status === 'live' && proUrl ? (
              <a href={proUrl} target="_blank" rel="noreferrer" className="btn-ghost mt-6 w-full">
                Buy Pro
              </a>
            ) : (
              <Link href="/trial" className="btn-ghost mt-6 w-full">
                Start 14-day trial
              </Link>
            )}
          </div>
          <div className="card terminal-glow flex flex-col border-brand/50 ring-1 ring-brand/30">
            <div className="font-mono text-xs font-semibold text-brand">All-Access</div>
            <div className="mt-1 font-display text-3xl font-bold text-slate-50">
              $49<span className="text-sm font-normal text-slate-500">/mo</span>
            </div>
            <p className="mt-2 flex-1 text-sm text-slate-400">
              Every platform — RN, iOS, Android, Flutter. One license, one auth.
            </p>
            {allAccessUrl ? (
              <a href={allAccessUrl} target="_blank" rel="noreferrer" className="btn-primary mt-6 w-full">
                Get All-Access
              </a>
            ) : (
              <a href="/pricing" className="btn-primary mt-6 w-full">
                See pricing
              </a>
            )}
          </div>
          <div className="card flex flex-col">
            <div className="font-mono text-xs font-semibold text-slate-400">Team</div>
            <div className="mt-1 font-display text-3xl font-bold text-slate-50">
              $99<span className="text-sm font-normal text-slate-500">/seat/mo</span>
            </div>
            <p className="mt-2 flex-1 text-sm text-slate-400">
              5–50 seats, shared brain, org-wide gates, custom model endpoints.
            </p>
            <a href="mailto:sales@vectalon.in" className="btn-ghost mt-6 w-full">
              Contact us
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
