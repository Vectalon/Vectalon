# Task-relevant guidance: fresh paired controls — 2026-10-24

Result: **no demonstrated improvement**. The new instruction packet preserved page-function success but passed no React counter runs, while one fresh task-only counter candidate passed app checks. No candidate repair, score substitution or qualification followed.

## Declared method

Revision `2289423` committed the experimental benchmark mode and protocol before inference. Same pinned Qwen2.5-Coder-3B file SHA-256 `724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7`, two unchanged public development controls, three repetitions per task/condition, alternating condition order. One provider call/initial attempt, temperature 0.2, 2,048 output tokens and 180 seconds per run, no repairs or model substitutions. Every responding artifact observation matched and all runs ended with `eogToken`, not the output-token cap.

Task-only retains the existing minimal file-JSON prompt and original source/requirements. Task-relevant adds preservation of imports/exports/types, complete-module and JSON-string instructions, plus a general pure state-updater rule when supplied source text contains a `useState` call. The rule comes from [React's state-queue documentation](https://react.dev/learn/queueing-a-series-of-state-updates), not the control implementation or assertions. No target function, expected implementation or verifier snippet is added. Both conditions disable provider enrichment. Textual detection is limited; aliased hooks, other state libraries and shared-provider ownership remain unqualified.

The existing isolated app compiler and full Jest suite judge outputs. Positive verifier controls passed; buggy originals compiled but failed behavior before inference. Acceptance and positive implementation remain excluded from requests. The combined instruction packet changes multiple factors, seeds/input-token accounting are absent, and the tiny public tasks are not held-out RN/native evidence. New compiled generator fingerprints identify this experiment; earlier historical runs used different generator builds and are not silently pooled here.

## Outcome matrix

| Task | Condition | Planned | Parsed | App-check passes | Typecheck passed/checked | Tests passed/checked |
|---|---|---:|---:|---:|---:|---:|
| Page function | Task-only | 3 | 3 | 3 | 3/3 | 3/3 |
| Page function | Task-relevant | 3 | 3 | 3 | 3/3 | 3/3 |
| React batched counter | Task-only | 3 | 3 | 1 | 2/3 | 1/3 |
| React batched counter | Task-relevant | 3 | 2 | 0 | 0/2 | 0/2 |

Counter task-only: repetition 1 failed compilation/behavior with an unknown name; repetition 2 compiled but failed batching; repetition 3 passed the declared app checks. Its implementation is not the verifier control, and passing the finite cases is not a guarantee for stale handlers, broader sequences or actual app screens.

Counter task-relevant: repetition 1 used a functional state updater but omitted a closing function brace and failed compilation; repetition 2 had no accepted file and skipped app checks; repetition 3 also failed compilation/behavior. The harness did not insert braces, recover rejected text manually or count intended logic as a pass. No native candidate checks ran.

Page candidates scored 100% tested guardrails; adherence was unscored. The passing counter candidate scored 94.4% tested guardrails with unscored adherence, so it is not qualified. The recorded failure is `TypeScript files avoid implicit any`; inspecting the current `typescript-strict` rule shows an explicit-return-annotation heuristic, not compiler semantic checking. Historical scores stay unchanged. This metric-label/policy issue needs an independent audit; it is not permission to lower thresholds or declare the candidate safe. Rejected-output zero scores remain placeholders rather than measured code quality.

## Records and next action

- [Page function: all six runs, controls, fingerprints, hashes and check status](page-bound-relevant-control-2026-10-24.json)
- [React counter: all six runs, controls, fingerprints, hashes and check status](batched-counter-relevant-control-2026-10-24.json)
- [Earlier task-only/block/guided full-file controls](generation-controls-2026-10-24.md)

Source-free inspection separately records envelope validity, selected-source syntax and compiler error codes; it never changes selection. Raw source stays only in the explicitly opted-in private reports `/private/tmp/vectalon-cart-pilot-HoUKzh/report.json` and `/private/tmp/vectalon-cart-pilot-6FvA9k/report.json`; do not upload them.

Next audit measurement validity before more prompt variants: distinguish return-annotation style policy from actual implicit-any diagnostics, retain all original outcomes, and predeclare stronger behavioral stress cases separately from these completed controls. Do not relabel existing app-check passes or failures after changing acceptance. The new guidance remains experimental and off customer/default paths; reliable improvement still requires fresh held-out RN/native and customer evidence. Core/Admin and customer grants/data unchanged; no release.
