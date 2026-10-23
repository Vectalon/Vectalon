# RN development pilot

## Top-level source block diagnostic — 2026-10-23

Revision `8aef0ab`, same pinned Qwen2.5-Coder-3B artifact, public cart task, three repetitions, temperature 0.2, one attempt/provider call and 2,048 output tokens, no repairs. Positive controls passed and unchanged-app controls failed before inference. Block IDs select exact original top-level TypeScript/JSX spans and repeated selections are rejected; approved source is repeated in a block catalogue. Default generation, sampler settings, frozen tasks and release thresholds remain unchanged.

**3/3 candidates applied; 0/3 passed compilation or app tests.** Each response selected distinct known blocks; all artifact identities matched and all responses ended with `stopGenerationTrigger`. The model returned incomplete/misplaced fragments rather than complete updated declarations. Every run produced TypeScript syntax errors and failed five app test suites (ten suites passed; those passes do not make the run successful). Supplemental parser inspection found 12 of 18 proposed replacement/insertion strings were not independently parseable module text. A parseable fragment is not necessarily a correct or complete declaration. No candidate native checks ran.

Guardrail rubric scores were 96%, 96%, 100%; adherence was 66.7%, 66.7%, unscored. These scores do not override failed compilation, imply safety, or establish task success. All three initial candidates remain selected in attempt records because they were the adapter's output to downstream checks, not because they qualified.

The [source-free records](cart-block-edits-2026-10-23.json) retain all failed outcomes, app-check status, durations, request/module fingerprints, identity observations, response hashes and supplemental parser counts/types. The parser version is a post-run inspection observation, not full runtime attestation. Raw code remains only in the explicitly opted-in private report `/private/tmp/vectalon-cart-pilot-cN1GAI/report.json`; do not upload it.

This changed context and output protocol, not only grammar. It establishes an application path, not causal model improvement, held-out effectiveness or qualification. Output budgets stayed fixed; actual input tokens/cost, seeds and human correction time remain unmeasured. Next stop repeated cart protocol tuning and use predeclared small development fixtures to distinguish basic code-generation ability from context/tool-protocol failure with the same model. Keep acceptance answers out of prompts, preserve syntax/behavior failures, and require fresh held-out plus native evidence before any qualification claim. Core/Admin and customer data/grants unchanged; no package release.

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 1 · grammar: required tool arguments: propose_edits

Anchor selection: top-level-source-blocks. Source selection is not implementation correctness.

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| vectalon-edits | 3 | 0 | 3 | 0 | 0/3 | 0/3 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| vectalon-edits | 1 | failed | matched | failed | failed | initial: parsed / unrecorded | 16109 | 24260 | 96.0 | 66.7 | not-run | applied |
| vectalon-edits | 2 | failed | matched | failed | failed | initial: parsed / unrecorded | 11651 | 19058 | 96.0 | 66.7 | not-run | applied |
| vectalon-edits | 3 | failed | matched | failed | failed | initial: parsed / unrecorded | 13701 | 21008 | 100.0 | unscored | not-run | applied |
