# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: orders-refresh-race · workflow: fix · app revision: 7da3f6e52049980f53460d0ccfce35130e1763aa

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

## Bounded resource protocol

direct native in both conditions  no router enrichment/fallback  default sampling unchanged

Row limit: 2. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| task-only | 1 | macos-pressure-estimate | 3435973836 | 3405234176 | 1809/2048/4352/128 | none observed |
| vectalon | 1 | macos-pressure-estimate | 3435973836 | 147079168 | 2803/2048/5120/128 | none observed |

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 1 | 2 | 1/1 | 0/1 |
| vectalon | 3 | 0 | 1 | 2 | 1/1 | 0/1 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| task-only | 1 | failed | matched | passed | failed | initial: parsed / unrecorded | 30140 | 72340 | 94.4 | 100.0 | not-run | not-applicable |
| vectalon | 1 | failed | matched | passed | failed | initial: parsed / unrecorded | 29246 | 40411 | 94.4 | 100.0 | not-run | not-applicable |
| vectalon | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| task-only | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| task-only | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| vectalon | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |

## Interpretation and limits

Task inputs and acceptance were frozen in `5631189` before either call. [Source-free evidence](orders-refresh-pair-2026-10-25.json) retains all six planned rows, model/request/implementation hashes, candidate/response fingerprints and original/positive verifier controls. Only the first pair ran; neither was repaired. Both observed the pinned artifact and stopped with `eogToken`.

Task-only compiled but its sandboxed Jest subprocess exhausted the V8 heap after 40.828 seconds (null exit code, no completed assertion summary). Inspection shows a state-dependent callback that updates its own dependency and is invoked by an effect: a refresh loop. Treat this as failed/incomplete execution, not a completed semantic assertion result. Do not increase the heap to obtain a pass. Parent-process RSS samples do not capture child-process peaks or GPU memory.

Guided compiled but failed eight of forty tests across three suites. Its request guard compares against captured state inside a callback with an empty dependency array, so initial loading and later completion fail. Both outputs score 100% on generic rubric adherence and 94.4% guardrails; neither works or qualifies. No useful relative task-success improvement was observed.

Native inference took 30.125 seconds task-only and 29.242 seconds guided. Whole workflows took 72.340 and 40.411 seconds respectively; these are not proof of less developer effort, since neither completed the task. Input tokens/context sizes differ (1,809/4,352 versus 2,803/5,120); identical declared call/output/time caps do not mean equal actual compute. Minimum sampled available-budget estimate was 3.2 GiB in both lanes, above the 2 GiB reserve; no watchdog stop was observed. Cost, generated-token counts, peak child/GPU memory and human correction time remain unmeasured.

Freshly authored public development task, not private held-out evidence; pretraining exposure unknown. Source/acceptance boundaries passed both prompt tests; assistant-authored control code and verifier source were excluded. Raw/generated artifacts remain only in opted-in `/private/tmp/vectalon-cart-pilot-C63G3D/report.json`; temporary data may expire and hashes do not reproduce source. No model output was applied to repository app files.

Next investigate React stale-closure/effect-dependency guidance on separate development controls before another separately declared trial. Do not tune this frozen answer, rewrite either failure, run an undeclared repair or expand repetitions automatically. Native orders acceptance, fresh feature/review tasks, reliable paired improvement and customer acceptance remain open. Core/Admin, production defaults and valid grants unchanged; no package release.

Verification: 107 experiment/report tests passed after recording outcomes, including prompt isolation, frozen identities, fresh-lane resource guards, refusal of model/repair substitution and preserved failure/pending counts. Product, Core-contract and capability consistency checks passed before inference. Full RN regression suite and native orders checks were not run.
