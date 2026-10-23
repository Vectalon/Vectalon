# RN development pilot

## Grounding change — public development diagnostic

Run revision `7c8a8f4`, after shared guidance distinguished reference input from requested output and guided context moved reference files before final requirements. No answers or task-specific code were inserted. All existing rules remain; task-only prompt framing is unchanged. Compared with [the earlier public diagnostic](cart-response-diagnostic-2026-10-23.md), task/acceptance/inference-module hashes, model artifact, runtime and generation settings match. All three task-only request fingerprints match the previous condition exactly; all guided request fingerprints differ as intended. App files are unchanged; archive hashes differ because Git archive metadata includes the different revision.

All six candidates still fail acceptance. Two guided responses now emit hook source but omit the existing ReactNode import and have incomplete quantity semantics. The third emits a JSON description of the hook, not source. Task-only outputs compile but fail behavior tests. Decoded raw file content equals parsed file content in all six runs. This is an observed change in response shape, **not verified task improvement** or proof that framing caused the difference; sampling seeds and actual resource use were not controlled/measured.

[Source-free records](cart-grounding-first-pass-2026-10-23.json) retain failures, check durations, guardrails/adherence and response fingerprints. Opt-in raw text/source remain only in `/private/tmp/vectalon-cart-pilot-q80P7D/report.json`; do not upload it. The frozen 18-run evaluation is unchanged. [Bounded repair is recorded separately](cart-grounding-repair-2026-10-23.md) with its larger budget, not folded into first-pass counts. No native run or model qualification is implied.

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
| task-only | 1 | failed | matched | passed | failed | initial: parsed / unrecorded | 16224 | 25079 | 96.0 | 66.7 | not-run |
| vectalon | 1 | failed | matched | failed | failed | initial: parsed / unrecorded | 15339 | 23831 | 100.0 | 66.7 | not-run |
| vectalon | 2 | failed | matched | failed | failed | initial: parsed / unrecorded | 15244 | 23654 | 100.0 | 66.7 | not-run |
| task-only | 2 | failed | matched | passed | failed | initial: parsed / unrecorded | 13131 | 21478 | 96.0 | 66.7 | not-run |
| task-only | 3 | failed | matched | passed | failed | initial: parsed / unrecorded | 13168 | 21476 | 96.0 | 66.7 | not-run |
| vectalon | 3 | failed | matched | failed | failed | initial: parsed / unrecorded | 6068 | 13527 | 100.0 | unscored | not-run |
