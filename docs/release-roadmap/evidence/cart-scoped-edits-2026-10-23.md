# RN development pilot

## Single-file edit proposal — 2026-10-23

Run revision `3a95c9e`, three repetitions on the public cart development task, one model/provider call and 2,048 output tokens each, temperature 0.2, no repairs. Used the same pinned Qwen2.5-Coder-3B artifact and the existing app acceptance controls; positives passed and negatives were rejected before inference. Full-file generation defaults and the frozen evaluation were not changed. The edit strategy changes the prompt and output protocol; this is not a same-prompt ablation or unseen-task improvement experiment.

**Zero accepted proposals out of three. No app checks or native checks ran on these candidates.** All three responses were valid tool-envelope JSON naming `propose_edits`, but their `arguments` objects were empty. Two put attempted edits into the separate answer string instead. The harness did not reinterpret answer text as authorized edits; it rejected every candidate before staging or execution. All observed artifact identities matched. The generic local tool-envelope grammar permits empty arguments and does not enforce the proposed tool's argument schema: serialization success is not a valid edit proposal.

[Source-free records](cart-scoped-edits-2026-10-23.json) retain all three failed outcomes, unselected initial attempts, edit rejection, observed identities, stop reasons, actual request fingerprints, durations and response hashes. App-check fractions are 0/0, not passes. Original reports leave those checks unrecorded; supplemental response-inspection metadata explicitly records that they were not run. Raw text/source remain only in the opt-in local report `/private/tmp/vectalon-cart-pilot-IgIxjy/report.json`; do not upload it. The compiled generation-module hash was observed after the run before rebuilding, not attested in process.

After the run, metadata capture was tightened to whitelist model/artifact fields, and future edit runs explicitly mark unrun app checks as skipped. These changes do not alter model requests or the retained outcomes. Regression tests verify successful scoped edit materialization, all-or-nothing rejection, preserved surrounding source, ambiguous/stale anchors, malformed envelopes, unsupported targets, provider errors, source-free reporting and no held-out-answer leakage. Stubbed success proves the adapter seam, not model ability.

Next enforce a required edit-argument contract through the native generation seam, then measure anchor validity and app semantics. Do not assume that fixing envelope structure will fix model logic. No model qualification, training claim, customer workflow promotion, package release or native proof follows from this development diagnostic.

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 1 · grammar: local tool envelope

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| vectalon-edits | 3 | 0 | 3 | 0 | 0/0 | 0/0 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| vectalon-edits | 1 | failed | matched | unrecorded | unrecorded | initial: invalid / unrecorded | 7814 | 8076 | 0.0 | 0.0 | not-run | rejected |
| vectalon-edits | 2 | failed | matched | unrecorded | unrecorded | initial: invalid / unrecorded | 10734 | 10736 | 0.0 | 0.0 | not-run | rejected |
| vectalon-edits | 3 | failed | matched | unrecorded | unrecorded | initial: invalid / unrecorded | 11571 | 11573 | 0.0 | 0.0 | not-run | rejected |
