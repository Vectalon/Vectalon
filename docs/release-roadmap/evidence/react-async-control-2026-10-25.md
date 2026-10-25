# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: delayed-label-v1 · workflow: development-control · app revision: 8b85650175d6ef1eb52fb0bfd3e353bd3da9c7b3

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

Condition task-only: full-file JSON  no requested grammar; required tool: not requested; output cap: 2048; attempt cap: 1.
Condition task-relevant: minimal source-grounded full-file JSON  no requested grammar; required tool: not requested; output cap: 2048; attempt cap: 1.

## Bounded resource protocol

direct native in both conditions  no router enrichment/fallback  default sampling unchanged

Row limit: 2. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| task-only | 1 | macos-pressure-estimate | 3607772528 | 4235640832 | 395/2048/2816/128 | none observed |
| task-relevant | 1 | macos-pressure-estimate | 3607772528 | 3363880960 | 578/2048/3072/128 | none observed |

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 1 | 2 | 1/1 | 0/1 |
| task-relevant | 3 | 0 | 1 | 2 | 0/0 | 0/0 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| task-only | 1 | failed | matched | passed | failed | initial: parsed / unrecorded | 21296 | 30160 | 94.4 | 100.0 | not-run | not-applicable |
| task-relevant | 1 | failed | matched | skipped | skipped | initial: invalid / unrecorded | 12547 | 12555 | 0.0 | 0.0 | not-run | not-applicable |
| task-relevant | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| task-only | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| task-only | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| task-relevant | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |

## Interpretation

Protocol and control committed in `8b85650` before inference. [Source-free record](react-async-control-2026-10-25.json) preserves response/candidate fingerprints, all six planned rows and verifier calibration history. Two calibration preflights stopped on test-props typing errors; no inference ran. After correcting that annotation, original source compiled and failed behavior; assistant-authored reference passed compiler and 39 app tests. Reference is not model output or independently reviewed human evidence.

Task-only generated a valid envelope and compiled, but failed all five control assertions (34 existing app tests passed). Inspection shows request identity state that is never advanced and an early guard that prevents loading. Guided output had malformed JSON even after fence removal; parsing rejected it, no artifact was selected and app checks were skipped. Do not repair that output offline and relabel it as an initial success. Both pinned native calls ended with `eogToken`; no retries/repairs, threshold change or watchdog stop. Four repetition rows remain not-run.

Whole workflows: 30.160 seconds task-only / 12.555 seconds guided; native inference 21.275 / 12.545 seconds. Input lengths 395 / 578 tokens and context sizes 2,816 / 3,072 differ. Same declared caps do not establish equal actual compute or reduced developer effort. Minimum sampled available-budget estimate was 3.36 GiB; RSS/available samples are not child/GPU peak or sustained-memory qualification. Raw/generated public source stays only in opted-in local `/private/tmp/vectalon-cart-pilot-HaDakH/report.json`; temporary artifacts may expire.

Generic React guidance remains opt-in experimental, not promoted to customer defaults. Prompt-boundary tests exclude reference/acceptance source from all conditions. This known-weakness synthetic control shows no task-success improvement and cannot qualify held-out RN, native/device or customer behavior. Frozen orders failure and prior native session evidence remain unchanged. Next qualify source-grounded delivery on separate development controls before more full-file prompt tuning; then require fresh feature/fix/review comparisons. Core/Admin/grants unchanged; no release.

Verification: RN build and targeted lint passed; 321 RN suites passed (3,205 tests passed, one existing skipped). Product/Core-contract/capability consistency passed; implementation evidence advanced to 1.0.43 without lifecycle promotion. Native checks not run.

All 111 experiment/report checks passed after recording results, including guarded pair caps, model/repair override refusal, prompt isolation, distinct invalid-delivery versus assertion failures and four retained pending rows.
