# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: delayed-label-v1 · workflow: development-control · app revision: d288b0a2c619fb045b333a1401137053ec0ef812

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 2 · grammar: required tool arguments: propose_edits

Anchor selection: module-and-direct-local-declarations. Source selection is not implementation correctness.

Condition vectalon-edits: source-grounded declaration edits  required native tool grammar; required tool: propose_edits; output cap: 2048; attempt cap: 2.

## Bounded resource protocol

direct native  no router enrichment/fallback  default sampling unchanged

Row limit: 1. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| vectalon-edits | 1 | macos-pressure-estimate | 3435973836 | 3862396928 | 1078/2048/3584/128 | none observed |

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| vectalon-edits | 3 | 0 | 1 | 2 | 0/0 | 0/0 |

## Initial versus assisted outcomes

One initial scoped-edit attempt plus at most one repair against its applied candidate  4096 requested output tokens total  360 seconds including checks  not equal to first-pass budgets. Repair selection requires passed app verification  100  tested guardrails and no adherence regression  unscored remains unscored .

Candidate verification is not selection or native qualification. Missing/invalid initial candidates are not passes. Equal declared call caps do not imply equal actual calls or input-token work.

| Condition | Initial verified passes/planned | Parse retries | Repair candidates verified/attempted | Selected app-check passes | Observed provider calls |
|---|---:|---:|---:|---:|---:|
| vectalon-edits | 0/3 | 0 | 0/0 | 0 | 1 recorded; remainder unrecorded |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| vectalon-edits | 1 | failed | matched | skipped | skipped | initial: invalid / unrecorded | 27582 | 27603 | 0.0 | 0.0 | not-run | rejected |
| vectalon-edits | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| vectalon-edits | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |

## Interpretation

Protocol and orchestration committed in `d288b0a` before inference. [Source-free record](react-async-repair-2026-10-25.json) preserves control/acceptance identity, initial rejection, partial attempt evidence and two unstarted repetitions. This was a new initial-plus-at-most-one-repair workflow, not a repair of the earlier recorded candidate.

One real call returned a valid tool envelope selecting `block-2`, but included an import in its function replacement. Composing it with the unchanged existing import caused Babel `VarRedeclaration` (`useState` already declared). Existing composed-module parsing rejected it with no selected artifact. No candidate app checks or repair call ran. Actual native inference took 27.569 seconds and stopped with `stopGenerationTrigger`; the two-call budget is a cap, not two observed invocations. Do not present the missing repair as a failure or success of live repair capability.

Original negative control compiled and failed behavior; assistant reference passed compiler/full app tests. Neither reference nor acceptance source was supplied in prompts. The new repair orchestration reuses exact-edit safety, recomputes anchors from the applied candidate, records initial/repair separately and stops on verifier error. Deterministic tests cover initial success, failed/invalid repair, guardrail/adherence regression, source/answer isolation and real edit-generator composition; they are not real-model repair qualification. Repair selection requires successful app verification, 100% tested guardrails and the unchanged applicable adherence gate.

No new default, grammar relaxation, model switch, threshold change or package release. Raw/generated public output remains only in opted-in `/private/tmp/vectalon-cart-pilot-jvauOt/report.json`; temporary source may expire. Native build/device and reliable held-out/customer improvement remain unverified. Core/Admin and grants unchanged.

Next qualify a separately declared assisted-only repair from the exact previously applied failed candidate, with pinned source/verification provenance and no new random initial generation. Keep replayed/recorded initial evidence separate from any new repair inference. Do not relabel or rerun this batch to obtain a repair call.

Verification: 130 experiment/report checks passed, including nine repair-loop controls, actual edit-generator composition and preserved skipped/unspent evidence. Product, Core-contract and capability consistency checks passed. No RN package source changed; full RN suite and native/device checks were not rerun.
