# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: stock-filter · workflow: feature · app revision: 7da3f6e52049980f53460d0ccfce35130e1763aa

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 2 · grammar: not requested

## Bounded resource protocol

direct native in both conditions  no router enrichment/fallback  default sampling unchanged

Row limit: 1. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| vectalon-verified-repair | 1 | macos-pressure-estimate | 3264175144 | 4061593600 | 4611/2048/7168/128 | none observed |

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| vectalon-verified-repair | 3 | 0 | 1 | 2 | 0/1 | 0/1 |

## Initial versus assisted outcomes

Single guided diagnostic: initial plus at most one repair/parse retry  4096 requested output tokens total and 360 seconds including checks  not equal to first-pass budgets

Candidate verification is not selection or native qualification. Missing/invalid initial candidates are not passes. Equal declared call caps do not imply equal actual calls or input-token work.

| Condition | Initial verified passes/planned | Parse retries | Repair candidates verified/attempted | Selected app-check passes | Observed provider calls |
|---|---:|---:|---:|---:|---:|
| vectalon-verified-repair | 0/3 | 0 | 0/1 | 0 | 2 recorded; remainder unrecorded |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| vectalon-verified-repair | 1 | failed | matched | failed | failed | initial: parsed / failed; repair: invalid / unrecorded | 154076 | 154096 | 88.9 | 50.0 | not-run | not-applicable  not-applicable |
| vectalon-verified-repair | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| vectalon-verified-repair | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |

## Assisted outcome and limits

One declared guided workflow at `35ad95f` completed in **154,096 ms**. This assisted diagnostic permits up to two calls and 4,096 requested output tokens under a shared 360-second deadline, not the smaller first-pass budget. Two remaining planned repetitions were not run.

| Stage | Native ms | Parse | App verification | Selected |
|---|---:|---|---|---|
| Initial, temperature 0.2 | 74,149 | One file parsed | TypeScript and app tests failed | Yes, still failed |
| Repair, temperature 0 | 71,734 | Invalid; no file parsed | Not run | No |

Both native responses matched the pinned Qwen2.5-Coder-7B artifact and stopped with `eogToken`. The repair used the existing generator and scoped verifier feedback; compiler diagnostics came only from the generated target, with generic task-failure text rather than acceptance assertions. No model response was substituted or candidate silently fixed. Initial candidate/check hashes and both source-free native call observations are retained in [JSON evidence](guided-repair-2026-10-24.json).

Initial formatted input/context: 4,611/7,168 tokens. Repair: 6,394/8,704. Both requested 2,048 output tokens and batch 128; actual generated token counts/cost remain unmeasured. The minimum sampled available-memory estimate was about 3.04 GiB, above the unchanged 2 GiB reserve; maximum sampled process RSS about 3.78 GiB. Samples do not measure peak GPU/RAM or qualify sustained operation. The 16 GiB host remains experimental for 7B.

**No assisted task success or improvement was established.** Do not spend more unconstrained full-file retries on this public task. Next test the existing native structured file-envelope grammar under a separately declared diagnostic, retaining identical acceptance checks and separate attempt kinds. Valid serialization would not prove JSX validity, semantics, guardrails or native success. Previous first-pass and parser-diagnostic failures remain unchanged.

Generated public source stays in the explicitly opted-in temporary local report; durable evidence contains hashes, metadata and outcomes, not source. Core/Admin, production behavior, customer grants and release thresholds unchanged. No package release.

Verification: all 90 experiment/report checks passed, including failed-initial/passing-repair selection with stubbed native output, guarded budget restrictions, rejected invalid repair history and source-free serialization. Product, Core-contract and capability consistency plus diff whitespace checks passed. Real app positive/negative controls passed their expected checks before inference. No fresh full RN suite or native build/device check was performed for this experiment-only change.

