# RN development pilot

## Constrained envelope — not source correctness

Same public cart diagnostic, revision `7c8a8f4`, local 3B artifact and guided framing as [first-pass](cart-grounding-first-pass-2026-10-23.md) and [unconstrained repair](cart-grounding-repair-2026-10-23.md). Reused the existing `--repair --constrained` path; no new inference defaults, task answers or code fixes. Up to two attempts, 2,048 output tokens each, one provider invocation each and 180 seconds per run; initial temperature 0.2, retry/repair zero. This is not equal-budget evidence against first-pass generation.

All three runs failed app checks. Five of six responses were complete JSON envelopes, but every complete response supplied JSON metadata as the hook content rather than a working source module. The first initial response reached `maxTokens` with an incomplete string and was rejected; its second attempt was a parse retry, not a repair. In the other two runs, parsed repairs also failed verification and were rejected, preserving the initial candidates. Valid serialization is not verified engineering success. No extra attempt, manual patch or weaker threshold was used.

[Source-free records](cart-grounding-constrained-2026-10-23.json) retain attempts, selections, verification, stop reasons, durations and response fingerprints. Opt-in raw/source remain only in `/private/tmp/vectalon-cart-pilot-oyVYFd/report.json`; do not upload it. All 12 runs / 18 generation attempts across these three development diagnostics are retained, and none passed app acceptance. The original frozen evaluation is unchanged. No native checks, release qualification, reliable task improvement or training claim follows.

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 2 · grammar: files-json

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| vectalon-verified-repair | 3 | 0 | 3 | 0 | 0/3 | 0/3 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|
| vectalon-verified-repair | 1 | failed | matched | failed | failed | initial: invalid / unrecorded; parse-retry: parsed / failed | 62417 | 62600 | 100.0 | unscored | not-run |
| vectalon-verified-repair | 2 | failed | matched | failed | failed | initial: parsed / failed; repair: parsed / failed | 29306 | 29309 | 100.0 | unscored | not-run |
| vectalon-verified-repair | 3 | failed | matched | failed | failed | initial: parsed / failed; repair: parsed / failed | 51232 | 51236 | 100.0 | 66.7 | not-run |
