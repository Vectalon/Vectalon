# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: batched-counter-stress-v1 · workflow: development-control · app revision: 9b8cfaa394980725e10e24657169897260466fb3

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

Condition repeat-default: task-relevant full-file JSON  existing repetition penalties; required tool: not requested; output cap: 2048; attempt cap: 1.
Condition repeat-off: task-relevant full-file JSON  repetition penalties disabled; required tool: not requested; output cap: 2048; attempt cap: 1.

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| repeat-default | 3 | 0 | 3 | 0 | 1/3 | 0/3 |
| repeat-off | 3 | 0 | 3 | 0 | 3/3 | 0/3 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| repeat-default | 1 | failed | matched | passed | failed | initial: parsed / unrecorded | 7613 | 16537 | 94.4 | unscored | not-run | not-applicable |
| repeat-off | 1 | failed | matched | passed | failed | initial: parsed / unrecorded | 2970 | 11164 | 94.4 | unscored | not-run | not-applicable |
| repeat-off | 2 | failed | matched | passed | failed | initial: parsed / unrecorded | 2917 | 11054 | 94.4 | unscored | not-run | not-applicable |
| repeat-default | 2 | failed | matched | failed | failed | initial: parsed / unrecorded | 3259 | 10773 | 94.4 | unscored | not-run | not-applicable |
| repeat-default | 3 | failed | matched | failed | failed | initial: parsed / unrecorded | 3418 | 11181 | 94.4 | unscored | not-run | not-applicable |
| repeat-off | 3 | failed | matched | passed | failed | initial: parsed / unrecorded | 2880 | 10861 | 94.4 | unscored | not-run | not-applicable |

## Audit

Protocol revision `9b8cfaa` preceded inference. Both direct-native lanes used the same task-relevant guidance, source, acceptance, artifact, one-call/2,048-output-token cap, temperature 0.2 and `minP: 0.05`. All six request fingerprints are identical; condition/configuration metadata separately records repetition penalties. All artifacts matched and all attempts stopped with `eogToken`; no retries, repairs, fallback text or native-app builds occurred. All three verifier controls reproduced their expected results.

Current penalties compiled 1/3 candidates; the other two had `TS1005` and `TS2304`. Penalties disabled compiled 3/3, but all failed three behavior assertions. Inspection found captured mutable queue state still used in updater calculations; a functional setter alone does not establish correct increments or a pure update. Current penalties also failed behavior. The observed compilation difference in three repetitions is not sufficient to establish a general causal benefit or justify changing production defaults. Neither lane demonstrated task success or qualified safety/adherence.

[Source-free records](counter-sampling-2026-10-24.json) retain every failure and check. Raw responses/generated files remain only in the opted-in private report `/private/tmp/vectalon-cart-pilot-GwcIL2/report.json`; do not publish it. Historical router/repair experiments are not causal controls for these direct-native lanes. Seeds, input-token/cost accounting, human correction time and held-out RN/native evidence remain absent. The canonical roadmap owns the next action.
