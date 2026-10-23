# RN development pilot

## Pre-parse inspection — 2026-10-23

All six public cart development runs failed app acceptance. This is a diagnostic, not a new held-out comparison, and does not replace the frozen 18-run result. Run started on `3b43dd0` with unchanged model artifact, prompts, one-attempt/2,048-token caps and no grammar or repairs. Positive/negative controls passed/rejected before inference. All six responses matched the observed artifact and ended with `eogToken`.

Raw response capture was explicitly enabled locally with `--include-raw-response`, separately from parsed-source capture. In every run, the decoded raw file content exactly equals the parsed file content. All three guided responses contain catalog data instead of the requested hook implementation; strict JSON decoding after removing the outer Markdown fence agrees with the parser. Task-only responses use backtick-valued file content; the parser recovers that code verbatim. Those three compile but fail behavior tests: quantity validation/removal remains incomplete. No parser change or threshold reduction is justified by these six responses.

[Source-free records](cart-response-diagnostic-2026-10-23.json) retain per-response SHA-256, character count, attempt index/kind and exact-comparison method. Raw text and generated source remain only in the opt-in local report `/private/tmp/vectalon-cart-pilot-g7wivJ/report.json`; do not upload it. Hashes are identifiers, not anonymization or independently auditable raw archives. This observation cannot reconstruct earlier responses, prove the cause of prompt sensitivity or establish improvement. Next investigate general task/context grounding on development tasks, then use a fresh frozen evaluation set. No native check was run for these failing candidates; no package release or qualification promotion.

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 3 | 0 | 3/3 | 0/3 |
| vectalon | 3 | 0 | 3 | 0 | 0/3 | 0/3 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|
| task-only | 1 | failed | matched | passed | failed | initial: parsed / unrecorded | 15872 | 24190 | 96.0 | 66.7 | not-run |
| vectalon | 1 | failed | matched | failed | failed | initial: parsed / unrecorded | 8171 | 15490 | 100.0 | unscored | not-run |
| vectalon | 2 | failed | matched | failed | failed | initial: parsed / unrecorded | 8553 | 15747 | 100.0 | unscored | not-run |
| task-only | 2 | failed | matched | passed | failed | initial: parsed / unrecorded | 13497 | 21684 | 96.0 | 66.7 | not-run |
| task-only | 3 | failed | matched | passed | failed | initial: parsed / unrecorded | 13168 | 21399 | 96.0 | 66.7 | not-run |
| vectalon | 3 | failed | matched | failed | failed | initial: parsed / unrecorded | 8127 | 15673 | 100.0 | unscored | not-run |
