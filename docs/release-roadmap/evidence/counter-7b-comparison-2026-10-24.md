# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: batched-counter-stress-v1 · workflow: development-control · app revision: 82310c2f817d375802ec0b0ed832346e5944815a

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

Condition task-only: full-file JSON  no requested grammar; required tool: not requested; output cap: 2048; attempt cap: 1.
Condition task-relevant: minimal source-grounded full-file JSON  no requested grammar; required tool: not requested; output cap: 2048; attempt cap: 1.

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 3 | 0 | 3/3 | 0/3 |
| task-relevant | 3 | 1 | 2 | 0 | 3/3 | 1/3 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| task-only | 1 | failed | matched | passed | failed | initial: parsed / unrecorded | 37881 | 47024 | 94.4 | unscored | not-run | not-applicable |
| task-relevant | 1 | failed | matched | passed | failed | initial: parsed / unrecorded | 9420 | 18925 | 94.4 | unscored | not-run | not-applicable |
| task-relevant | 2 | failed | matched | passed | failed | initial: parsed / unrecorded | 9481 | 19065 | 94.4 | unscored | not-run | not-applicable |
| task-only | 2 | failed | matched | passed | failed | initial: parsed / unrecorded | 10551 | 19650 | 94.4 | unscored | not-run | not-applicable |
| task-only | 3 | failed | matched | passed | failed | initial: parsed / unrecorded | 8969 | 18047 | 94.4 | unscored | not-run | not-applicable |
| task-relevant | 3 | passed | matched | passed | passed | initial: parsed / unrecorded | 8979 | 19065 | 94.4 | unscored | not-run | not-applicable |

## Audit and independent recheck

Protocol revision `82310c2` preceded inference. This is a separate installed Qwen2.5-Coder-7B lane, not a 7B-versus-3B improvement claim. All six artifact observations matched SHA-256 `89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be`; all used one local call and stopped with `eogToken`. Source, acceptance, guidance, default sampler and per-run budget stayed fixed. All verifier controls reproduced expected outcomes.

All six candidates compiled. Task-only failed 3/3; task-relevant failed repetitions 1 and 2 but passed repetition 3. Each failing run failed three behavior assertions; its other 35 app assertions passed. The successful candidate passed all 38 assertions across 15 suites. A fresh isolated git-archive export independently compiled and retested the exact generated source bytes (SHA-256 `431e688be46e5baf8a813b77e52527fd79cff35c72061c4c2392a88b04bd73aa`), again passing all 38 tests. The staged acceptance differs only by a final newline; both acceptance hashes are recorded. No source repair, extra model attempt or historical rescoring occurred.

One observed development pass is not reliable improvement, statistical qualification or launch readiness. The passing candidate scored 94.4% tested guardrails with adherence unscored; the unchanged 100%/80% gates remain unmet. No native-app build/device check, human correction time or cost/input-token accounting was measured. Production model/sampler defaults and Core/Admin/grants remain unchanged; no release.

[Source-free records and independent recheck](counter-7b-comparison-2026-10-24.json) preserve all failures and metadata. Raw/source reports remain private at `/private/tmp/vectalon-cart-pilot-lMcVOX/report.json`; do not upload them. The canonical roadmap owns the next action.
