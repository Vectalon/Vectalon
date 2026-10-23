# RN development pilot

## Source-grounded edit diagnostic — 2026-10-23

Revision `e98384a`, public development cart task, same pinned Qwen2.5-Coder-3B artifact, three repetitions, temperature 0.2, one attempt/provider call, 2,048 output tokens and no repairs. Positive controls passed and unchanged-app controls failed before inference. Required-tool grammar selects anchors from unique nonblank original source lines. Full-file generation, sampler settings, frozen tasks and qualification thresholds remain unchanged.

**3/3 responses selected real original anchors; 1/3 candidates applied; 0/3 app-check passes.** All 14 proposed anchors occurred exactly once in the original file. Repetition 1 invalidated a later anchor through an earlier replacement. Repetition 3 introduced repeated anchors and removed another, so guarded sequential application rejected the candidate. Repetition 2 applied, then failed TypeScript (`TS1131: Property or signature expected`) and the full app test run (5 suites failed, 10 passed). Its 100% tested guardrail rubric and 66.7% adherence score do not override compilation failure or establish safety/task qualification. No candidate native checks ran.

The [source-free records](cart-source-anchors-2026-10-23.json) retain all attempts, identity observations, fingerprints, durations, edit-application outcomes, failed/skipped checks and response hashes. Supplemental sequential reconstruction identifies stale/ambiguous anchors without executing generated code; it is distinguished from the adapter's recorded application result. Rejected candidates' zero rubric scores below are runner placeholders, not measured code quality. Raw text/source remain only in the opted-in private report `/private/tmp/vectalon-cart-pilot-RNZCLM/report.json`; do not upload it.

This resolves original-anchor invention in these runs, not code placement, edit interactions or verified task success. The protocol restricts anchors to single lines and repeats supplied source in the schema, changing context and output space; it is not a grammar-only causal study, universal model improvement or unseen-task evidence. Seeds, actual tokens/cost, human correction time, Android and native candidate verification remain unmeasured/unrun. Next investigate edit interaction and code-placement failures on development fixtures through existing safe paths before a fresh held-out comparison. No acceptance answers enter prompts, no fuzzy matching, no package release; Core/Admin and customer grants unchanged.

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 1 · grammar: required tool arguments: propose_edits

Anchor selection: unique-source-lines. Source selection is not implementation correctness.

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| vectalon-edits | 3 | 0 | 3 | 0 | 0/1 | 0/1 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| vectalon-edits | 1 | failed | matched | skipped | skipped | initial: invalid / unrecorded | 19082 | 19329 | 0.0 | 0.0 | not-run | rejected |
| vectalon-edits | 2 | failed | matched | failed | failed | initial: parsed / unrecorded | 11682 | 20240 | 100.0 | 66.7 | not-run | applied |
| vectalon-edits | 3 | failed | matched | skipped | skipped | initial: invalid / unrecorded | 19779 | 19780 | 0.0 | 0.0 | not-run | rejected |
