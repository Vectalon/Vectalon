# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: delayed-label-v1 · workflow: development-control · app revision: 44b7ccbfd4ef95c2ed3138ea1bcc2b430892f2bc

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 1 · grammar: required tool arguments: propose_edits

Anchor selection: module-and-direct-local-declarations. Source selection is not implementation correctness.

Condition vectalon-edits: source-grounded declaration edits  required native tool grammar; required tool: propose_edits; output cap: 2048; attempt cap: 1.

## Bounded resource protocol

direct native  no router enrichment/fallback  default sampling unchanged

Row limit: 1. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| vectalon-edits | 1 | macos-pressure-estimate | 3264175144 | 4104912896 | 1078/2048/3584/128 | none observed |

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| vectalon-edits | 3 | 0 | 1 | 2 | 0/1 | 0/1 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| vectalon-edits | 1 | failed | matched | failed | failed | initial: parsed / unrecorded | 26538 | 35445 | 88.9 | 100.0 | not-run | applied |
| vectalon-edits | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| vectalon-edits | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |

## Interpretation

Protocol committed in `44b7ccb` before this one declared attempt. [Source-free record](react-async-edits-2026-10-25.json) pins unchanged control/acceptance to the [prior full-file trial](react-async-control-2026-10-25.md). Original source compiled but failed behavior; assistant reference passed compiler and full app acceptance. Reference was not supplied to the model.

The pinned 7B model returned a strict required-tool envelope selecting one module-level function (`block-2`), not smaller locals. Its replacement parsed and applied exactly, preserving the surrounding import. Compiler/app checks still failed: `TS2554` shows its public reload callback now requires an argument, and `TS2304` identifies an undefined `effect` identifier. All five control tests failed; 34 existing app tests passed. It also uses render-local random bookkeeping, so fixing the reported compiler errors alone would not establish correct request ordering. No assistant patch, parse retry, model repair or threshold change was made.

This distinguishes delivery success from task failure, not reliable edit-protocol or model-improvement qualification. Two repetitions stay not-run. Source-block context and native tool grammar differ from full-file conditions; historical rows are not equal-input causal controls. Native inference took 26.522 seconds and stopped with `stopGenerationTrigger`. Sampled available-budget estimate stayed above the 2 GiB reserve; no watchdog stop was observed. These samples do not establish peak child/GPU or sustained-memory safety. Actual cost/output-token work and human correction time are unmeasured.

Raw/generated public source stays in opted-in local `/private/tmp/vectalon-cart-pilot-gVjdZY/report.json`; temporary data may expire. Durable hashes are not source reproduction. This remains a public synthetic control, not fresh held-out/native/customer evidence. Core/Admin, production defaults, thresholds and grants unchanged; no release.

Next qualify bounded verifier feedback and repair through existing safe edit/application paths on separate development controls before a new held-out comparison. Preserve initial failure and any later assisted outcome independently; compiler-only success cannot substitute for behavioral/native checks. Do not expand this failed batch or silently switch models.

Verification: 117 experiment/report checks passed, including frozen control hashes, guarded scoped-mode dispatch, model/mode refusal and application-versus-verification history. Product manifest, Core-contract and capability consistency checks passed. No RN package source changed; the full RN suite and native/device checks were not rerun in this slice.
