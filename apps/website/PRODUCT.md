# Product

<!-- impeccable:product-schema 1 -->

Current RN release: <!-- product-fact:rn-version -->0.15.0<!-- /product-fact --> ·
benchmark scenarios: <!-- product-fact:benchmark-scenarios -->43<!-- /product-fact --> ·
deterministic agents: <!-- product-fact:deterministic-commands -->44<!-- /product-fact --> ·
MCP tools: <!-- product-fact:mcp-tools -->64<!-- /product-fact --> ·
Individual: <!-- product-fact:individual-price -->$19<!-- /product-fact --> ·
Team: <!-- product-fact:team-price -->$49<!-- /product-fact -->

## Platform

web

## Users

Primary: professional React Native developers working on real codebases (bare RN CLI or Expo), who already live in the terminal and want AI assistance that understands *their* project instead of giving generic answers. Secondary: engineering leads / small teams evaluating a paid dev tool (≤3 devs free, >3 paid). [Inferred from site copy and README; not user-interviewed.]

## Product Purpose

Vectalon is the AI engineering control plane for React Native teams. Give it a React Native repository and it continuously **understands, reviews, diagnoses, upgrades, and validates** the application. It embeds an AI harness directly into a codebase: it scans a project, builds a living knowledge base, and runs a local MCP-native agent plus 44 deterministic, report-driven commands. The website exists to make the mechanism credible (a real CLI, real terminal output, real benchmarks) and convert visitors to the free tier / trial.

## Positioning

Vectalon is deliberately **not** "an AI coding assistant". The product definition is a control plane for the RN engineering loop: give it a repository and it continuously

- **understands** — versioned project knowledge graph (L0→L3 memory) + live ecosystem intel (refreshed hourly under `serve`),
- **reviews** — guardrails on save, `review` / `arch` / `sec` / SOC 2 / GitHub PR triage,
- **diagnoses** — `diagnostics`, `build-fix`, `test-repair`, `crash`, `incident`,
- **upgrades** — rn-diff-purge diffs, AST-grade impact analysis, codemods,
- **validates** — `bench` (the 43-scenario pack + CI regression gate), `smoke`, E2E generation.

The mechanism a competitor could not copy-paste: the agent never works from a generic guess — it works from the versioned knowledge graph, and every generated fix is compile-checked before it lands. Tagline: "The AI harness that lives in your terminal."

## Operating Context

The product is a CLI (`npx vectalon init / serve / feature / doctor / diagnostics / generate / upgrade / bench / smoke …`) plus 44 deterministic agent commands (review, arch, sec, soc2, dashboard, figma, gh-pr, monitor, evals, dx, archive, share, … — phases 8-12, roadmap items 061-104) that run on the free tier with a report and a verdict and no model calls. The website's demo is a real recorded terminal session (85 s, no cuts, on a 19-screen Expo app), while current benchmark results are derived from all 43 committed scenarios. Pricing: Free $0 (init, serve, feature, doctor, + all 44 agents; no card), Individual $19/dev/mo (Local AI + project intelligence + diagnostics), Team $49/dev/mo (Team Brain, shared policies, PR review, CI, dashboards), Enterprise custom (self-hosted, SSO, audit, private models). `vectalon plan` shows the current plan; `vectalon outcomes` shows the engineering-outcome ledger and savings estimate. Business Source License 1.1 — free for personal/education/OSS and commercial teams ≤3 devs; becomes MIT after 4 years. React Native 0.14.2 is available; iOS, Android, Flutter, and Python are in development.

## Strategy — Capability Freeze (P0)

The initial product is defined and closed: Vectalon = the AI engineering control plane for React Native teams. **P0: stop adding major capabilities.** No new agents, diagnostics, models, or workflows unless the user explicitly overrides. The existing surface is the product: the 44 deterministic agents, the 13-phase workflow (PRD → Scope → Impact → Design → Architecture → Tasks → Tests → Implementation → Review → Verification → Readiness → PR → Documentation → Close, with self-healing from verification/readiness back into implementation), the fast/balanced/quality model presets, and the 43-scenario benchmark pack. New work goes into depth, reliability, and validation of what already exists.

## Capabilities and Constraints

- Site: Next.js App Router (apps/website), Tailwind, dual light/dark theme currently, Phosphor icons, Space Grotesk + JetBrains Mono fonts.
- Real assets on hand: full-demo.mp4 + poster, benchmark leaderboard data, changelog, pricing tiers, SDK pages (react-native live; ios/android/flutter "soon"), docs, waitlist form, admin dashboard.
- Monetization is live (license API, checkout links, /trial with GitHub login).
- Factual claims must not be invented: benchmark numbers, prices, versions come from the repo (packages/rn, docs/CLI_REFERENCE.md, changelog).

## Brand Commitments

Name: Vectalon (vectalon.in). Existing palette (vermilion #E35336, cream #F5F5DC, sand #F4A460, sienna #A0522D) is *not* binding — the user has requested a full visual redesign ("change the design", black overlay bothers them). No other explicit brand constraints were stated.

## Evidence on Hand

- apps/website/app — all routes (home, pricing, benchmarks, docs, changelog, sdk, trial, admin).
- apps/website/demo — full-demo.mp4 + poster; recording tapes.
- packages/rn — the CLI itself, benchmark results (BENCHMARK_RESULTS.md).
- README.md — license, product table, monorepo structure.

## Product Principles

1. The terminal is the product — the CLI's real output is the most credible proof the site has.
2. Honesty over hype: real benchmarks, real recording, real versions; never invent numbers or testimonials.
3. Developer-first tone: dense, specific, no marketing fluff.
4. Free tier is genuinely useful — the conversion story is "try it now, no signup".
5. Multi-platform story (RN now, iOS/Android/Flutter next) but RN is the flagship.

## Accessibility & Inclusion

No product-specific standard was established. Current site uses theme tokens with WCAG-AA-conscious contrast and `prefers-reduced-motion` guards; a redesign must not regress those.
