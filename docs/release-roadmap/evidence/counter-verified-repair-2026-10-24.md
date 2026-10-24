# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: batched-counter-stress-v1 · workflow: development-control · app revision: c7c5362044162631e86e87375156a4bb35bbae49

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 2 · grammar: not requested

Condition task-only: full-file JSON  no requested grammar; required tool: not requested; output cap: 2048; attempt cap: 2.
Condition task-relevant: minimal source-grounded full-file JSON  no requested grammar; required tool: not requested; output cap: 2048; attempt cap: 2.

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 3 | 0 | 2/3 | 0/3 |
| task-relevant | 3 | 0 | 3 | 0 | 0/3 | 0/3 |

## Initial versus assisted outcomes

both conditions: bounded app verifier  compiler-only diagnostics and generic test-failure feedback

Candidate verification is not selection or native qualification. Missing/invalid initial candidates are not passes. Both lanes have the same call cap; actual calls and input-token work can differ.

| Condition | Initial verified passes/planned | Parse retries | Repair candidates verified/attempted | Selected app-check passes | Observed provider calls |
|---|---:|---:|---:|---:|---:|
| task-only | 0/3 | 0 | 0/3 | 0 | 6 |
| task-relevant | 0/3 | 1 | 0/2 | 0 | 6 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| task-only | 1 | failed | matched | passed | failed | initial: parsed / failed; repair: parsed / failed | 25672 | 25887 | 94.4 | unscored | not-run | not-applicable  not-applicable |
| task-relevant | 1 | failed | matched | failed | failed | initial: parsed / failed; repair: parsed / failed | 21739 | 21742 | 94.4 | unscored | not-run | not-applicable  not-applicable |
| task-relevant | 2 | failed | matched | failed | failed | initial: parsed / failed; repair: parsed / failed | 24710 | 24714 | 94.4 | unscored | not-run | not-applicable  not-applicable |
| task-only | 2 | failed | matched | passed | failed | initial: parsed / failed; repair: parsed / failed | 24700 | 24704 | 94.4 | unscored | not-run | not-applicable  not-applicable |
| task-only | 3 | failed | matched | failed | failed | initial: parsed / failed; repair: parsed / failed | 24044 | 24048 | 94.4 | unscored | not-run | not-applicable  not-applicable |
| task-relevant | 3 | failed | matched | failed | failed | initial: invalid / unrecorded; parse-retry: parsed / failed | 14328 | 14332 | 94.4 | unscored | not-run | not-applicable  not-applicable |

## Audit notes

Protocol revision `c7c5362` preceded inference. Both lanes used the same artifact, source/requirements, app acceptance, two-call/4,096-output-token cap and 180-second deadline. Initial temperature was 0.2; second-call temperature was 0. All 12 artifact observations matched and stopped with `eogToken`. Controls reproduced the negative/new-test failure, positive/new-test pass and negative/old-test pass.

Task-only repetitions 1 and 2 compiled on both initial and repair candidates but failed the two retained/mixed-callback tests. Repetition 3 had a `TS2345` type error initially and after repair. Task-relevant repetitions 1 and 2 retained `TS1005` syntax errors after compiler feedback; their raw initial/repair responses were identical despite different request fingerprints. Repetition 3 initially yielded no accepted file; its parse retry produced a `TS1005` failure and exhausted the two-call cap. Failed repairs were rejected; no manual source fixes or extra calls followed.

Feedback contains only compiler diagnostics for the generated target and generic test-failure messages, not test assertions, acceptance source or positive implementations. Provider wiring forwards the changed request, but fingerprints do not attest to internal model processing. The unchanged runtime applies fixed anti-repetition sampling; whether it contributes to delimiter failures is an untested hypothesis, not an explanation established by this experiment.

These are fresh public development controls with equal repair caps, not an equal-budget comparison of repair against no feedback, held-out RN/native evidence or launch qualification. No first-pass success or assisted improvement was demonstrated. Raw/source evidence stays only in the opted-in private report `/private/tmp/vectalon-cart-pilot-rBvliH/report.json`; do not publish it. [Source-free records](counter-verified-repair-2026-10-24.json) preserve each verification, selection, failure and observed call. The canonical roadmap owns the next action.
