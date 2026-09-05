import Link from 'next/link'
import { notFound } from 'next/navigation'
import { WaitlistForm } from '../../../components/WaitlistForm'
import { checkoutUrlFor, type ProductId } from '../../../lib/lemon-squeezy'
import { PRODUCT_MANIFEST } from '../../../lib/product-manifest'

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
    statusLabel: `Package available — v${PRODUCT_MANIFEST.packages.reactNative.version}`,
    tagline: 'React Native beta onboarding and policy checks, with separately labelled experimental engineering previews.',
    description:
      `The React Native package registers ${PRODUCT_MANIFEST.capabilities.mcpTools} project-aware tools and ${PRODUCT_MANIFEST.capabilities.deterministicCommands} deterministic commands. The released catalog enables qualified beta onboarding and policy capabilities by default; analysis, model, upgrade, distribution, and knowledge surfaces remain experimental, require opt-in, and may depend on configured models, credentials, or network services.`,
    features: [
      { title: 'MCP project context', body: 'Beta project inspection serves local context over the MCP protocol. Other registered MCP tools follow their own catalog lifecycle and requirements.' },
      { title: 'Impact regression coverage — experimental', body: 'Opt-in analysis can propose affected screens and regression coverage; results require review in the target project.' },
      { title: 'Upgrade Copilot — experimental', body: 'Opt-in upgrade tooling can inspect diffs and propose bounded native and JS/TS changes for review.' },
      { title: 'Guardrails on save — beta', body: 'Qualified React Native policy checks surface actionable local findings; this is not a security certification.' },
      { title: 'Bundle budgets — experimental', body: 'Opt-in analysis can report Metro bundle deltas and possible alternatives.' },
      { title: 'Device control — experimental', body: 'Registered device integrations require explicit opt-in plus the relevant simulator, credentials, and host tooling.' },
      { title: 'Repair workflows — experimental', body: 'Bounded retries can run configured verification, but generated fixes and target-project results still require human review.' },
      { title: 'Deterministic command catalog — experimental', body: `${PRODUCT_MANIFEST.capabilities.deterministicCommands} commands are registered across the package. Lifecycle, evidence, model use, network access, and availability are evaluated per owning capability.` },
      { title: 'Executive dashboard — experimental', body: 'Opt-in report aggregation can build a local dashboard from available report artifacts; sample output is not customer-workflow qualification.' },
    ],
    install: 'npx vectalon init',
    note: 'Free includes the qualified capabilities listed by the released catalog. Experimental commands require opt-in and are not guaranteed plan outcomes.',
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

export default async function SdkPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const sdk = SDK_DATA[params.slug]
  if (!sdk) notFound()

  const proUrl = checkoutUrlFor('pro', params.slug as ProductId)
  const teamUrl = checkoutUrlFor('team')

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
          Plans apply to the purchased product scope. This release covers Vectalon React Native.
        </p>
        <div className="mx-auto mt-8 grid max-w-3xl gap-5 md:grid-cols-2">
          <div className="card flex flex-col">
            <div className="font-mono text-xs font-semibold text-slate-400">Individual</div>
            <div className="mt-1 font-display text-3xl font-bold text-slate-50">
              $19<span className="text-sm font-normal text-slate-500">/dev/mo</span>
            </div>
            <p className="mt-2 flex-1 text-sm text-slate-400">
              Local AI + project intelligence + diagnostics for {sdk.name}. 14-day
              trial, one GitHub login.
            </p>
            {sdk.status === 'live' && proUrl ? (
              <a href={proUrl} target="_blank" rel="noreferrer" className="btn-ghost mt-6 w-full">
                Buy Individual
              </a>
            ) : (
              <Link href="/trial" className="btn-ghost mt-6 w-full">
                Start 14-day trial
              </Link>
            )}
          </div>
          <div className="card terminal-glow flex flex-col border-brand/50 ring-1 ring-brand/30">
            <div className="font-mono text-xs font-semibold text-brand">Team</div>
            <div className="mt-1 font-display text-3xl font-bold text-slate-50">
              $49<span className="text-sm font-normal text-slate-500">/dev/mo</span>
            </div>
            <p className="mt-2 flex-1 text-sm text-slate-400">
              Everything in Individual + Team Brain, shared policies, PR review,
              CI, shared knowledge, dashboards.
            </p>
            {teamUrl ? (
              <a href={teamUrl} target="_blank" rel="noreferrer" className="btn-primary mt-6 w-full">
                Buy Team
              </a>
            ) : (
              <a href="/pricing" className="btn-primary mt-6 w-full">
                See pricing
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
