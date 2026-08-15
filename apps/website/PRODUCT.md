# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: professional React Native developers working on real codebases (bare RN CLI or Expo), who already live in the terminal and want AI assistance that understands *their* project instead of giving generic answers. Secondary: engineering leads / small teams evaluating a paid dev tool (≤3 devs free, >3 paid). [Inferred from site copy and README; not user-interviewed.]

## Product Purpose

Vectalon is an open-core developer tool that embeds an AI harness directly into a codebase: it scans a project, builds a living knowledge base, and runs a local MCP-native agent that generates, reviews, upgrades, and heals code. The website exists to make the mechanism credible (a real CLI, real terminal output, real benchmarks) and convert visitors to the free tier / trial.

## Positioning

The mechanism a competitor could not copy-paste: the agent never works from a generic guess — it works from a versioned project knowledge graph (L0→L3 memory) refreshed from live ecosystem intel hourly, and every generated fix is compile-checked before it lands. "The AI harness that lives in your terminal."

## Operating Context

The product is a CLI (`npx vectalon init / serve / feature / doctor / diagnostics / generate / upgrade / bench / smoke …`) plus 44 deterministic agent commands (review, arch, sec, soc2, dashboard, figma, gh-pr, monitor, evals, dx, archive, share, … — phases 8-12, roadmap items 061-104) that run on the free tier with a report and a verdict and no model calls. The website's demo is a real recorded terminal session (85 s, no cuts, on a 19-screen Expo app) and real benchmark numbers (13 scenarios, guardrail pass rate 92%). Pricing: Free tier $0 (init, serve, feature, doctor, + all 44 agents; no card), Pro $19/mo, All-access $49/mo, Team $99/mo. Business Source License 1.1 — free for personal/education/OSS and commercial teams ≤3 devs; becomes MIT after 4 years. React Native product live (current release 0.12.0); iOS, Android, Flutter in development.

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
