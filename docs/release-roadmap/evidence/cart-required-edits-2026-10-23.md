# RN development pilot

## Required edit arguments — 2026-10-23

Revision `38d1bf2`, public cart task, three repetitions with the same pinned Qwen2.5-Coder-3B artifact, one attempt/provider call, 2,048 output tokens, temperature 0.2 and no repairs. Positive acceptance controls passed; unchanged-app controls failed before inference. Default generation, sampler settings and frozen tasks were not changed.

**3/3 structured proposals; 0/3 accepted edits; no candidate app/native checks ran.** Responses contained only the named tool and arguments, with 6, 7 and 2 edits respectively. All 15 proposed anchors had zero exact occurrences in the original target. The model invented or reformatted source anchors; required argument structure did not establish source grounding or correct implementation. Every candidate was rejected, with no answer-text recovery or fuzzy matching. All three artifact identities matched; all responses stopped with `stopGenerationTrigger`.

The [source-free records](cart-required-edits-2026-10-23.json) retain request/module/task hashes, attempts, durations, skipped checks and response-inspection hashes/counts. Raw source remains only in the explicitly opted-in private report `/private/tmp/vectalon-cart-pilot-YmQQcy/report.json`; do not upload it. Anchor counts compare each proposal with the original source, not sequentially rewritten source. All proposals already failed on their first anchor. Zero rejected-file rubric scores below are runner placeholders, not measured code quality; attempt-level adherence/guardrails remain null.

This small unseeded public diagnostic changes both prompt protocol and grammar, so it is not a causal grammar-only ablation, unseen-task improvement or customer qualification. Next investigate source-grounded edit selection on development fixtures using existing safe edit application, preserving exact anchors and independent app checks. Do not add task-specific answers or relax safety gates. A grounded candidate must still pass behavior, guardrail/adherence and native checks before a fresh held-out comparison. Core/Admin unchanged; no release.

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 1 · grammar: required tool arguments: propose_edits

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| vectalon-edits | 3 | 0 | 3 | 0 | 0/0 | 0/0 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| vectalon-edits | 1 | failed | matched | skipped | skipped | initial: invalid / unrecorded | 23526 | 23749 | 0.0 | 0.0 | not-run | rejected |
| vectalon-edits | 2 | failed | matched | skipped | skipped | initial: invalid / unrecorded | 15568 | 15570 | 0.0 | 0.0 | not-run | rejected |
| vectalon-edits | 3 | failed | matched | skipped | skipped | initial: invalid / unrecorded | 24003 | 24005 | 0.0 | 0.0 | not-run | rejected |
