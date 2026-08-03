# Phase V-5 — The "RN Coding Tests" Benchmark Suite

> **Scope:** a public, reproducible eval harness that measures how well the
> harness (and any model driving it) generates **React Native code** — the thing
> generic benchmarks ignore. Three axes: **generated-code correctness**,
> **RN best-practice adherence**, and **guardrail pass rate**.

## Status

> M1–M3 and M6 are **delivered** (committed on `main`). The harness lives in
> `src/bench/` with scenarios in `bench/scenarios/` and reference solutions in
> `bench/references/`; the CLI is `vectalon bench --model … --suite … --live`
> (see [`CLI_REFERENCE.md`](CLI_REFERENCE.md)). M4 (CI deterministic baseline
> gate) and M5 (scheduled real-model leaderboard) are next up — see the README
> [`Roadmap`](README.md) and [`ENHANCEMENT_PLAN.md`](ENHANCEMENT_PLAN.md) V-5.

| Milestone | Status |
|---|---|
| M1 — Scenario spec + 10 scenarios + deterministic baseline runner | ✅ Delivered (`src/bench/loader.ts` + `snapshot.ts`, `bench/scenarios/`)
| M2 — Rubric (15 checks) + scoring + report | ✅ Delivered (`src/bench/rubric.ts`, `scoring.ts`, `report.ts`)
| M3 — `vectalon bench` CLI + `--suite`/`--model`/`--live` flags | ✅ Delivered (`src/cli/commands/bench.ts`)
| M4 — CI deterministic baseline + PR gate | ⬜ Next up
| M5 — Public leaderboard (scheduled real-model pass, `BENCHMARK_RESULTS.md`) | ⬜ Next up (`--live` seam delivered)
| M6 — Reference solutions + relative-to-human scoring | ✅ Delivered (`bench/references/`, `src/bench/references.ts`)

## 1. Why this is the proof-of-one-of-a-kind

Every general-purpose coding benchmark (HumanEval, SWE-bench, …) treats a React
Native repo like any TypeScript repo. None checks whether generated code:

- uses `KeyboardAvoidingView` on a screen with `TextInput` on iOS,
- virtualizes long lists with `FlatList` instead of `ScrollView` + `.map`,
- types navigation route params with `NativeStackScreenProps`,
- avoids inline styles on hot paths, or
- refuses to commit a hardcoded API URL or a secret.

rn-vectalon already encodes those exact rules (`src/guardrails/rules.ts`,
`verificationPhase`, `detectConventions`). The benchmark turns that knowledge
into a **public, scored, regression-safe proof** that the harness beats generic
tools on *React Native specifically* — the moat this SDK is built on.

## 2. The three axes (and how they're scored)

Every eval scenario is run in a throwaway temp project (existing
`__tests__/helpers/tmp.ts` pattern). The workflow generates code for the prompt,
then scores it.

### Axis 1 — Correctness (weight 0.4)

Does the generated code actually work?

| Check | How | Weight |
|---|---|---|
| **Tests pass** | `yarn test` in the temp project (real adapter) | 0.5 |
| **Typecheck passes** | `yarn typecheck` (detected via `detectValidationCommands`) | 0.25 |
| **Lint passes** | `yarn lint` | 0.25 |
| Runtime smoke (optional) | boot in Metro sandbox / headless RN-web, assert no redbox | +0.1, capped |

`correctness = min(1, Σ pass(weight))`, with `fail = 0` per check. The runtime
smoke is a capped **recovery credit** — it can only lift a failing axis partway
back (since the three core checks already sum to 1.0), and `min(1, ·)` keeps
correctness from ever exceeding 1.0. In deterministic
(simulated) mode the correctness axis is reported as **N/A** and **excluded
from the composite, with the remaining weights renormalized** (adherence and
guardrails divide by 0.6) so simulated and model-driven scores share the same
0–1 scale.

### Axis 2 — RN best-practice adherence (weight 0.3)

A curated rubric of **RN-specific** checks (distinct from generic guardrails —
these assert *positive* best practices, not just absence of violations):

1. Screens with `TextInput` use `KeyboardAvoidingView` / `Keyboard.dismiss`
2. Long lists use `FlatList` / `SectionList` (not `ScrollView` + `.map`)
3. Screens use `SafeAreaView` / `useSafeAreaInsets`
4. Navigation screens use typed props (`NativeStackScreenProps` etc.) when
   reading `route.params`
5. Platform differences use `Platform.OS` / `Platform.select`
6. Styles come from `StyleSheet.create` (no inline objects on components)
7. Remote images handle errors/caching (`onError`, `cache` props)
8. Forms and interactive elements carry `accessibilityLabel` / roles
9. Async work is inside `try/catch` with user-visible error states
10. State updates are immutable (no `.push`/`.splice`/direct mutation)
11. Hooks pass dependency arrays (`useEffect`/`useCallback`/`useMemo`)
12. Expensive values are memoized, heavy work is out of render
13. Colors/tokens come from the design system, not hardcoded hex literals
14. Deep links are declared and handled via a routing table, not ad-hoc
15. Data fetching has loading / empty / error states

`adherence = applicableChecksPassed / applicableChecksTotal`.

### Axis 3 — Guardrail pass rate (weight 0.3)

Run the project's real `runGuardrails` / `PolicyEngine` over every generated
file.

`guardrailPassRate = passingRuleApplications / totalRuleApplications`
(only *applicable* rules count; `skipped` rules are excluded).

A **composite** is reported per scenario and per suite:

```
composite = 0.4·correctness + 0.3·adherence + 0.3·guardrailPassRate

# when correctness is N/A (simulated mode), renormalize:
composite = (0.3·adherence + 0.3·guardrailPassRate) / 0.6
```

Scenarios are grouped into **suites** (e.g. `core-ui`, `data-flow`,
`navigation`, `forms-security`, `perf`) so the leaderboard can slice by area.

## 3. Harness architecture

```
bench/
  scenarios/                    # one JSON file per scenario (rn-01 … rn-10)
  references/                   # human-authored reference solutions (M6)

src/bench/
  loader.ts          # versioned scenario-spec load + validation
  runner.ts          # orchestration: fixtures → generate → score → report
  rubric.ts          # the 15 RN best-practice checks (regex/AST-lite)
  scoring.ts         # composite math + suite aggregation
  report.ts          # markdown/JSON leaderboard output
  modelGenerate.ts   # ModelRouter generate seam (--model/--live pass)
  references.ts      # reference solutions + relative-to-human scoring
  snapshot.ts        # project snapshot for deterministic baseline
  types.ts           # shared scenario/score/report types
  index.ts           # public exports

src/cli/commands/bench.ts       # `vectalon bench [--model …] [--suite core-ui] [--live]`
```

**Scenario spec shape:**

```jsonc
{
  "id": "rn-01-login-screen",
  "suite": "forms-security",
  "title": "Login screen with auth API",
  "prompt": "Create a login screen that calls POST /auth/login ...",
  "fixtures": {
    "package.json": "{ ... }",        // deps the scenario needs
    "src/config/api.ts": "export const API_BASE_URL = ...",
    "src/screens/HomeScreen.tsx": "..."
  },
  "expect": {
    "files": ["src/screens/LoginScreen.tsx", "src/services/auth.ts"],
    "behaviors": ["TextInput present", "KeyboardAvoidingView on iOS",
                  "auth service uses config URL, not hardcoded"]
  },
  "correctness": { "tests": true, "typecheck": true, "lint": true },
  "axes": ["correctness", "adherence", "guardrails"]
}
```

**Deterministic-first:** with no model, the runner scores the deterministic
scaffold generator (`generateAddFeatureImplementation` fallback) so the harness
is testable offline; with `--model`, the real ModelRouter drives generation.
Both produce a score — CI runs the deterministic baseline, the leaderboard runs
the real-model pass.

The deterministic scaffold only emits the standard screen/hook/service "add
feature" trio, so the **no-model baseline covers the scaffold-able subset** —
`rn-01` (login), `rn-02` (FlatList fetch), `rn-05` (form validation), `rn-06`
(offline queue). The remaining scenarios (`rn-03` dark-mode tokens, `rn-04`
typed navigation, `rn-07` image feed, `rn-08` feature flags, `rn-09` accessible
form, `rn-10` refactor-to-hooks) are **model-only** and reported separately so
their scores are never confused with scaffold quality. The scaffold-able subset
is the CI regression gate; model-only scenarios gate on the real-model
leaderboard.

**Regression safety:** every guardrail rule, rubric check, and verification
change must move the benchmark — a PR that improves `no-inline-styles` should
raise adherence on `core-ui` scenarios; a PR that breaks typecheck detection
must show up here.

## 4. The first 10 eval scenarios

| # | ID | Suite | Prompt (abridged) | Checks the generated code must pass |
|---|---|---|---|---|
| 1 | `rn-01-login-screen` | forms-security | Create a login screen with email/password that calls the auth API and handles errors | `KeyboardAvoidingView`, a11y labels, no hardcoded URL (uses `config`), async try/catch, no `console.log`, no `any`, tests pass |
| 2 | `rn-02-flatlist-fetch` | data-flow | Fetch a paginated list and render it with pull-to-refresh | `FlatList` (not `ScrollView`+`.map`), loading/empty/error states, immutable updates, hook deps, typecheck clean |
| 3 | `rn-03-dark-mode-component` | core-ui | A themed card component honoring dark mode tokens | design tokens not hex literals, `StyleSheet.create`, no inline styles, a11y label, Platform-aware if needed |
| 4 | `rn-04-typed-navigation` | navigation | A settings stack with typed route params and deep links | `NativeStackScreenProps`, typed `route.params`, no deprecated `Navigator`/`AlertIOS`, safe-area on screens |
| 5 | `rn-05-form-validation` | forms-security | A multi-field form with client validation and secure persistence | validation states, `KeyboardAvoidingView`, no secrets in code (use `react-native-keychain`), no mutation in reducers, tests pass |
| 6 | `rn-06-offline-queue` | data-flow | An offline-first action queue with optimistic UI | optimistic rollback, immutability, error states, list virtualization, hook deps |
| 7 | `rn-07-image-feed` | perf | An image-heavy feed with thumbnails | remote images with `onError`/caching, `FlatList` + `getItemLayout`, no heavy work in render, memoized rows, lint clean |
| 8 | `rn-08-feature-flags` | core-ui | A feature-flag wrapper component and hook | config-driven flags (no hardcoded URLs), typed props, no `any`, proper hook deps, named export |
| 9 | `rn-09-accessible-form` | a11y | A fully screen-reader-friendly onboarding form | `accessibilityLabel`/`role`/`state` on every interactive element, `accessibilityHint`, focus handling, `KeyboardAvoidingView` |
| 10 | `rn-10-refactor-hooks-ts` | refactor | Convert a class/JS component to typed hooks | no unused imports, no `any`, named export, explicit return types, strict equality, no `var`, typecheck + lint pass |

**Baseline mode:** `rn-01`, `rn-02`, `rn-05`, `rn-06` run with the deterministic
scaffold (no model) as the CI regression gate; `rn-03`, `rn-04`, `rn-07`,
`rn-08`, `rn-09`, `rn-10` are model-only.

Each scenario ships with a **reference solution** (human-authored) so scores can
also be reported as **relative to the human baseline** (e.g. "generated code is
92% of human best-practice adherence"), which makes the benchmark honest about
what "passing" means.

> Note: the human baseline is scored by the *same* rubric, so a reference that
> uses a hardcoded hex literal or a sparse empty state will score below 1.0 on
> that axis — the reference ceiling is not automatically 100%. A generated
> solution that avoids those pitfalls can therefore report relative adherence
> above 100%, which is honest scoring, not an error.

## 5. Publishing & community

- **Repo:** `bench/` directory with scenarios, fixtures, and the deterministic
  baseline committed — anyone can `npm install` + `vectalon bench` and reproduce.
- **Leaderboard:** CI (GitHub Actions) runs the deterministic baseline on every
  PR; a scheduled workflow runs real-model passes and commits a
  `BENCHMARK_RESULTS.md` table (scenario × model × axis).
- **Model comparison:** the same harness, many models — local Qwen, OpenAI,
  Anthropic, any custom endpoint via `ModelRouter`. The benchmark becomes the
  *only* public RN-specific model leaderboard.
- **Extensibility:** the community can add scenarios via PR (spec shape is
  versioned); a `--suite` flag keeps CI runs fast (subset selection).

## 6. Milestones

| Milestone | Deliverable | Status |
|---|---|---|
| M1 | Scenario spec + 10 scenarios + deterministic baseline runner | ✅ Delivered |
| M2 | Rubric (15 checks) + scoring + markdown report | ✅ Delivered |
| M3 | `vectalon bench` CLI + `--suite`/`--model`/`--live` flags | ✅ Delivered |
| M4 | CI deterministic baseline + PR gate | ⬜ Next up |
| M5 | Public leaderboard (scheduled real-model pass, BENCHMARK_RESULTS.md) | ⬜ Next up (`--live` seam delivered) |
| M6 | Reference solutions + relative-to-human scoring | ✅ Delivered |

**Definition of done:** `vectalon bench` runs offline in under 2 minutes,
produces a reproducible markdown/JSON report, and a PR that worsens any axis on
the baseline suite fails CI.
