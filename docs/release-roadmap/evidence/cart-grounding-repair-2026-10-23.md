# RN development pilot

## Bounded repair — separate budget

Public cart diagnostic on `7c8a8f4`, same artifact and guided framing as [the first-pass run](cart-grounding-first-pass-2026-10-23.md). Three runs, up to two generation attempts and one provider invocation per attempt; 2,048 output tokens per attempt and 180 seconds per run. Repairs use temperature zero rather than the initial 0.2. This is **not equal-budget improvement evidence** against the one-attempt condition.

All three runs failed. Initial outputs were parsed and failed the app verifier. Every repair response was unparseable and unselected; the harness preserved the original failing candidate instead of hiding it or claiming recovery. Each repair ended with `eogToken`; observed tails contained incomplete/malformed envelope content, including broken escapes. Do not infer token-cap truncation or a tokenizer/runtime root cause from that observation. Verification feedback contained generated-file compiler diagnostics and a generic test-failure notice, not acceptance source/assertions or reference answers. No assistant correction was applied to model code.

[Source-free records](cart-grounding-repair-2026-10-23.json) retain both attempt outcomes, selection, failed checks, run times and all six response fingerprints. Opt-in raw/source remain only in `/private/tmp/vectalon-cart-pilot-A3Tjje/report.json`; do not upload it. No successful candidate, native check, release qualification or unseen-task improvement was established.

[Constrained-envelope follow-up](cart-grounding-constrained-2026-10-23.md) also failed all three tasks; valid JSON did not establish working source code.

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 2 · grammar: not requested

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| vectalon-verified-repair | 3 | 0 | 3 | 0 | 0/3 | 0/3 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|
| vectalon-verified-repair | 1 | failed | matched | failed | failed | initial: parsed / failed; repair: invalid / unrecorded | 43571 | 43750 | 100.0 | 66.7 | not-run |
| vectalon-verified-repair | 2 | failed | matched | failed | failed | initial: parsed / failed; repair: invalid / unrecorded | 33087 | 33090 | 100.0 | unscored | not-run |
| vectalon-verified-repair | 3 | failed | matched | failed | failed | initial: parsed / failed; repair: invalid / unrecorded | 44544 | 44548 | 100.0 | 66.7 | not-run |
