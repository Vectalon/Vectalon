# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: delayed-label-v1 · workflow: development-control · app revision: 96acf8ab0dd6e9eeb6887b4b9ecf23b20f24afbf

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 2 · grammar: required tool arguments: propose_edits

Anchor selection: module-and-direct-local-declarations. Source selection is not implementation correctness.

Recorded initial candidate: fd90d55fcf5e918b9607508c9db19f4249e55a1539d8e6956b0fb128d5b17979; original revision 44b7ccbfd4ef95c2ed3138ea1bcc2b430892f2bc. Rechecked without a new initial model call. Historical invocation/duration is not part of this run's budget; subsequent repair evidence is assisted, not first-pass success.

Condition vectalon-edits: source-grounded declaration edits  required native tool grammar; required tool: propose_edits; output cap: 2048; attempt cap: 2.

## Bounded resource protocol

direct native  no router enrichment/fallback  default sampling unchanged

Row limit: 1. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| vectalon-edits | 1 | macos-pressure-estimate | 2748779069 | 3773251584 | 1491/2048/3840/128 | none observed |

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| vectalon-edits | 3 | 0 | 1 | 2 | 0/1 | 0/1 |

## Workflow qualification boundary

Scope: this model artifact, task and condition only. Failed means an observed task, identity, safety or native gate failed; unverified means no recorded failure, not qualification. No automatic qualification: repeated held-out comparisons, comparable budgets and customer/native acceptance still require review. Native counts use supplied candidate verification only, never local inference calls. Pending rows and missing scores remain unresolved; tokens/cost and human effort remain unmeasured.

| Condition | Gate state | Rows with observed gate failure | Pending | Supplied native passed/checked |
|---|---|---:|---:|---:|
| vectalon-edits | failed | 1 | 2 | 0/0 |

## Initial versus assisted outcomes

Recorded initial candidate rechecked with zero new initial calls  at most one new repair call  2048 output tokens  180 seconds including recheck. Historical invocation/duration excluded from current budgets. Not first-pass or equal-budget improvement  strict repair selection unchanged.

Candidate verification is not selection or native qualification. Missing/invalid initial candidates are not passes. Equal declared call caps do not imply equal actual calls or input-token work.

| Condition | Initial verified passes/planned | Parse retries | Repair candidates verified/attempted | Selected app-check passes | Observed provider calls |
|---|---:|---:|---:|---:|---:|
| vectalon-edits | 0/3 | 0 | 0/1 | 0 | 1 recorded; remainder unrecorded |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| vectalon-edits | 1 | failed | matched | failed | failed | initial: parsed / failed; repair: invalid / unrecorded | 37262 | 37299 | 88.9 | 100.0 | not-run | applied  rejected |
| vectalon-edits | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| vectalon-edits | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |

## Interpretation

Protocol and resume path committed in `96acf8a` before inference. [Source-free record](react-recorded-repair-2026-10-25.json) links the exact `44b7ccb` initial candidate and its response/request/model/control/acceptance identities. Historical duration is separate; the recorded initial has no current provider calls and was rechecked under sandbox isolation. Original and assistant-reference controls behaved as expected. No reference fix or acceptance source was sent to the model.

Exactly one new native call ran, labelled repair, temperature 0, 2,048 requested output tokens. It took 28.772 seconds and stopped with `stopGenerationTrigger`. Its required-tool JSON replaced `block-2` with byte-identical text, preserving the same undefined functions, API mismatch and broken request ordering. Existing all-no-op rejection returned no new candidate. Recorded initial remains selected and failed; two repetitions stay not-run. Workflow time was 37.299 seconds, including the 8.480-second initial recheck. This is neither first-attempt success nor assisted improvement.

An offline reconstruction made zero new model calls and matched both repair request digest and final native-adapter request/grammar hashes exactly. Assertions confirmed scoped compiler feedback (including the undefined function diagnostic), read-only original input and the failed candidate were present; reference/acceptance source was absent. Code inspection also shows a fresh context/session, explicit system-prompt forwarding and refused context shifting. No missing-feedback or stale-session implementation defect was found by these checks; this does not prove model comprehension or hardware attestation.

Input/context for the actual repair were 1,491/3,840 tokens. The report now uses actual new-call context rather than historical initial context for this resumed run's resource table. Minimum sampled available-budget estimate was 2.56 GiB, above the 2 GiB reserve; these samples are not child/GPU peak or sustained-memory qualification. Actual output-token cost and human correction time remain unmeasured.

The resume loader rejects altered candidate bytes, extra files, changed raw output and provenance/identity mismatches before experiment output or execution. A minor partial-report defect found during the run was reproduced and fixed afterward: a pending verifier no longer publishes an error before its result exists. Completed results and native requests are unchanged; no new inference was run for that reporting fix.

Raw/generated public source stays only in opted-in `/private/tmp/vectalon-cart-pilot-qJ056A/report.json`; the offline reconstruction is local `/private/tmp/vectalon-recorded-repair-audit-2026-10-25.cjs`. Temporary data may expire; committed hashes alone do not reproduce source. Core/Admin, defaults, gates and grants unchanged; no package release. Native/device and held-out/customer improvement remain unqualified.

Next stop tuning this known public async control. Consolidate observed workflow qualification in the existing report surface: explicitly failed/unverified model × skill cells, distinct app/native and initial/assisted evidence, pending rows and limitations. Require fresh declared comparisons before any promotion; do not silently substitute models or interpret successful connectivity/rubric scores as engineering qualification.

Verification: all 144 experiment/report tests passed, including provenance tampering, one-current-call dispatch, answer isolation, resource context, pending-verifier state and source-free malformed-input errors. The malformed-JSON source-echo risk was reproduced with a synthetic marker and fixed; no actual credentials were used in that check. Product/Core-contract/capability consistency and whitespace checks passed. No RN package source changed; full RN suite and native/device checks were not rerun.
