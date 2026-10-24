# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: stock-filter · workflow: feature · app revision: 7da3f6e52049980f53460d0ccfce35130e1763aa

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

## Bounded resource protocol

direct native in both conditions  no router enrichment/fallback  default sampling unchanged

Row limit: 2. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| task-only | 1 | macos-pressure-estimate | 3264175144 | 3918069760 | 3617/2048/6144/128 | none observed |
| vectalon | 1 | macos-pressure-estimate | 3092376453 | 1230225408 | 4611/2048/7168/128 | none observed |

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 1 | 2 | 0/1 | 0/1 |
| vectalon | 3 | 0 | 1 | 2 | 0/0 | 0/0 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| task-only | 1 | failed | matched | failed | failed | initial: parsed / unrecorded | 75033 | 83798 | 88.9 | 66.7 | not-run | not-applicable |
| vectalon | 1 | failed | matched | unrecorded | unrecorded | initial: invalid / unrecorded | 68403 | 68411 | 0.0 | 0.0 | not-run | not-applicable |
| vectalon | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| task-only | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| task-only | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| vectalon | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |

## Interpretation and next boundary

Corrected runtime `ebb1dcd` completed two real pinned-artifact calls under the declared budgets. Task-only: 75,033 ms generation / 83,798 ms total, one parsed candidate, failed compilation and app tests. Guided: 68,403 ms generation / 68,411 ms total, no parseable non-empty file; app checks were not run, not passed. Both stopped with `eogToken`. Four planned rows remain unstarted. The earlier `f232769` adapter failure is [retained separately](bounded-pair-adapter-failure-2026-10-24.json), not overwritten or counted as a guided model call.

Task-only used 3,617 input / 6,144 context tokens; guided used 4,611 / 7,168. Both requested 2,048 output tokens and batch 128. Lowest sampled available-budget estimates were about 3.04 / 2.88 GiB; highest sampled process RSS about 3.65 / 1.15 GiB. These estimates exclude peak GPU/RAM attestation. This is two sequential calls only on an experimental 16 GiB host, not sustained-safety qualification.

No model improvement or launch qualification is established. Do not expand the 18-run batch yet. Next isolate output serialization/decoding versus model-generated source defects with offline parser checks and, only if necessary, one separately declared diagnostic with explicit local raw-response capture. Retain failures; do not repair these candidates and relabel them first-pass successes, inject answers, or lower thresholds. Parsed source contains malformed JSX and stray escaped fragments, but raw responses were not captured, so the cause cannot be assigned to the model versus decoding from this evidence alone.

Durable JSON retains candidate hashes and source-free attempts/resources; generated public source remains only in the opted-in temporary local report. Acceptance controls passed expected positive/negative checks. Native builds/devices, unseen tasks, repeated reliability, actual token costs and human correction time remain unverified. Core/Admin, production inference, grants and thresholds unchanged; no package release.

Regression verification: 81 experiment/report checks passed, including actual generation prompt paths with stubbed native responses, cancellation/reserve/metric-change/deadline escalation, two-row limits and source-free history. Product, Core-contract and capability consistency plus diff whitespace checks passed. The full RN suite was not rerun for this experiment-only change; its preceding 3,187 passed/one skipped remains historical evidence, not a new result for this revision.

