# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: batched-counter-stress-v1 · workflow: development-control · app revision: 47dd59bcaf8e6d64cc481d85f751b9fa7aef7a60

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

Condition task-only: full-file JSON  no requested grammar; required tool: not requested; output cap: 2048; attempt cap: 1.
Condition task-relevant: minimal source-grounded full-file JSON  no requested grammar; required tool: not requested; output cap: 2048; attempt cap: 1.

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 3 | 0 | 3/3 | 0/3 |
| task-relevant | 3 | 0 | 3 | 0 | 0/2 | 0/2 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| task-only | 1 | failed | matched | passed | failed | initial: parsed / unrecorded | 6278 | 15521 | 94.4 | unscored | not-run | not-applicable |
| task-relevant | 1 | failed | matched | failed | failed | initial: parsed / unrecorded | 3439 | 12152 | 94.4 | unscored | not-run | not-applicable |
| task-relevant | 2 | failed | matched | skipped | skipped | initial: invalid / unrecorded | 2723 | 2725 | 0.0 | 0.0 | not-run | not-applicable |
| task-only | 2 | failed | matched | passed | failed | initial: parsed / unrecorded | 2455 | 11016 | 94.4 | unscored | not-run | not-applicable |
| task-only | 3 | failed | matched | passed | failed | initial: parsed / unrecorded | 2623 | 12842 | 94.4 | unscored | not-run | not-applicable |
| task-relevant | 3 | failed | matched | failed | failed | initial: parsed / unrecorded | 4855 | 21795 | 94.4 | unscored | not-run | not-applicable |

## Failure audit

All three task-only candidates compiled but failed both retained/mixed-callback stress tests; the remaining 36 app assertions passed in each run. Their envelopes needed the existing template-literal recovery. Task-relevant repetitions 1 and 3 supplied valid JSON after outer-fence removal but invalid TypeScript (`TS1005`); repetition 2 yielded no accepted file, so app checks were skipped. The selected source exactly matched decoded envelope content in every accepted case: extraction did not remove the missing source brace. No source was repaired and no attempt was rerun.

All six attempts used one local provider call and matched the pinned artifact; all stopped with `eogToken`, not the output-token cap. Negative/new-test, positive/new-test and negative/old-test controls reproduced their declared outcomes. The full-file generator and guidance were unchanged. This is a fresh public stress control, not a rescore of earlier counter experiments. The combined guidance packet does not isolate individual instruction effects. Rubric scores are not task success; rejected-output zero scores are placeholders, and adherence remains unscored for accepted files.

[Source-free records and post-run inspection](counter-stress-comparison-2026-10-24.json) retain every row, fingerprint, duration and skipped check. Raw responses and generated source remain only in the opted-in private report `/private/tmp/vectalon-cart-pilot-f97Qh4/report.json`; do not publish it. No model improvement or native qualification is established. The canonical roadmap owns the next action.
