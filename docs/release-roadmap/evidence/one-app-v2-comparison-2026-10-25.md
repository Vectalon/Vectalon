# Fresh one-app comparison — 2026-10-25

Protocol frozen in `f0b8b2d` before inference. [Source-free evidence](one-app-v2-comparison-2026-10-25.json) retains all 18 first attempts: three per task/condition, one matching pinned local 7B call each, no repairs or pending rows. App/fixture/runtime fingerprints and per-candidate/response hashes are retained. All acceptance/reference controls stayed outside requests. The initial preflight's outer-sandbox restriction is retained in [preflight evidence](one-app-v2-preflight-2026-10-25.json); permitted runs still used the isolated app verifier.

| Workflow / public task | Task-only app-check passes | Vectalon app-check passes | Native device checks | Qualification |
|---|---:|---:|---:|---|
| Feature / distinct cart count | 0/3 | 0/3 | 0 | Failed observed gates |
| Fix / catalog return isolation | 3/3 | 3/3 | 0 | Failed recorded adherence gate |
| Review / order input isolation | 0/3 | 0/3 | 0 | Failed observed gates |

No measured Vectalon advantage or launch qualification. Six service-fix app successes repeat a narrow result in both conditions; they do not show lower developer effort or better completion. Guardrails were 100% there, but generic adherence remained 0%. Offline rubric inspection identifies `error-states` as the applicable failed check; no score or gate was changed. Audit applicability independently before interpreting that score as service correctness. Feature/review compiler and behavior failures remain failures even where other checks or rubric scores pass.

Feature: three task-only candidates passed all 36 app tests but failed compilation on stray generated identifiers. Guided attempts had malformed delivery or invalid source. Review: no generated test both compiled, passed the original and detected the proposed regression through an assertion; a proposed assertion failure without a passing original is not valid detection.

Declared caps: temperature 0.2, 2,048 output tokens, one call, 180 seconds including app verification per row; both conditions bypass router enrichment/fallback and use unchanged native sampling. Alternating order is not randomization; seeds and actual input/output token costs are unmeasured. No resource stop occurred, but samples are not peak GPU/RAM or sustained-safety evidence. Human effort, private held-out tasks, native checks and external acceptance remain unmeasured. All tasks are newly authored public development tasks in one installed Expo 58 / RN 0.88 app; pretraining exposure is unknown. No silent model substitution, test/prompt change, repair, parser adjustment, threshold relaxation or package release.

Raw/generated source remains local opt-in only: feature `/private/tmp/vectalon-cart-pilot-Yv0gFx`, fix `/private/tmp/vectalon-cart-pilot-ZzjMiw`, review `/private/tmp/vectalon-cart-pilot-4hOK27`. Temporary files may expire; hashes alone do not reproduce candidate source. Below are the existing report matrices, rendered without changing original outcomes.

## feature: cart-distinct-count

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: cart-distinct-count · workflow: feature · app revision: 7da3f6e52049980f53460d0ccfce35130e1763aa

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

### Bounded resource protocol

direct native  no router enrichment/fallback  default sampling unchanged

Row limit: 6. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| task-only | 1 | macos-pressure-estimate | 2576980377 | 2677391360 | 1446/2048/3840/128 | none observed |
| vectalon | 1 | macos-pressure-estimate | 4123168604 | 1079099392 | 2440/2048/4864/128 | none observed |
| vectalon | 2 | macos-pressure-estimate | 4466765987 | 1115144192 | 2440/2048/4864/128 | none observed |
| task-only | 2 | macos-pressure-estimate | 2405181685 | 1051967488 | 1446/2048/3840/128 | none observed |
| task-only | 3 | macos-pressure-estimate | 5153960755 | 1045889024 | 1446/2048/3840/128 | none observed |
| vectalon | 3 | macos-pressure-estimate | 4810363371 | 1112817664 | 2440/2048/4864/128 | none observed |

### Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 3 | 0 | 0/3 | 3/3 |
| vectalon | 3 | 0 | 3 | 0 | 0/2 | 0/2 |

### Workflow qualification boundary

Scope: this model artifact, task and condition only. Failed means an observed task, identity, safety or native gate failed; unverified means no recorded failure, not qualification. No automatic qualification: repeated held-out comparisons, comparable budgets and customer/native acceptance still require review. Native counts use supplied candidate verification only, never local inference calls. Pending rows and missing scores remain unresolved; tokens/cost and human effort remain unmeasured.

| Condition | Gate state | Rows with observed gate failure | Pending | Supplied native passed/checked |
|---|---|---:|---:|---:|
| task-only | failed | 3 | 0 | 0/0 |
| vectalon | failed | 3 | 0 | 0/0 |

### Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| task-only | 1 | failed | matched | failed | passed | initial: parsed / unrecorded | 39140 | 48602 | 92.0 | 66.7 | not-run | not-applicable |
| vectalon | 1 | failed | matched | unrecorded | unrecorded | initial: invalid / unrecorded | 37218 | 37226 | 0.0 | 0.0 | not-run | not-applicable |
| vectalon | 2 | failed | matched | failed | failed | initial: parsed / unrecorded | 38126 | 45878 | 92.0 | 66.7 | not-run | not-applicable |
| task-only | 2 | failed | matched | failed | passed | initial: parsed / unrecorded | 33074 | 41970 | 92.0 | 66.7 | not-run | not-applicable |
| task-only | 3 | failed | matched | failed | passed | initial: parsed / unrecorded | 29604 | 38524 | 92.0 | 66.7 | not-run | not-applicable |
| vectalon | 3 | failed | matched | failed | failed | initial: parsed / unrecorded | 36960 | 44641 | 92.0 | 66.7 | not-run | not-applicable |

## fix: catalog-get-isolation

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: catalog-get-isolation · workflow: fix · app revision: 7da3f6e52049980f53460d0ccfce35130e1763aa

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

### Bounded resource protocol

direct native  no router enrichment/fallback  default sampling unchanged

Row limit: 6. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| task-only | 1 | macos-pressure-estimate | 4123168604 | 5056233472 | 1277/2048/3584/128 | none observed |
| vectalon | 1 | macos-pressure-estimate | 3264175144 | 4743872512 | 2271/2048/4608/128 | none observed |
| vectalon | 2 | macos-pressure-estimate | 3779571220 | 4609114112 | 2271/2048/4608/128 | none observed |
| task-only | 2 | macos-pressure-estimate | 3092376453 | 4166254592 | 1277/2048/3584/128 | none observed |
| task-only | 3 | macos-pressure-estimate | 3264175144 | 4178444288 | 1277/2048/3584/128 | none observed |
| vectalon | 3 | macos-pressure-estimate | 3435973836 | 4170317824 | 2271/2048/4608/128 | none observed |

### Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 3 | 0 | 0 | 3/3 | 3/3 |
| vectalon | 3 | 3 | 0 | 0 | 3/3 | 3/3 |

### Workflow qualification boundary

Scope: this model artifact, task and condition only. Failed means an observed task, identity, safety or native gate failed; unverified means no recorded failure, not qualification. No automatic qualification: repeated held-out comparisons, comparable budgets and customer/native acceptance still require review. Native counts use supplied candidate verification only, never local inference calls. Pending rows and missing scores remain unresolved; tokens/cost and human effort remain unmeasured.

| Condition | Gate state | Rows with observed gate failure | Pending | Supplied native passed/checked |
|---|---|---:|---:|---:|
| task-only | failed | 3 | 0 | 0/0 |
| vectalon | failed | 3 | 0 | 0/0 |

### Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| task-only | 1 | passed | matched | passed | passed | initial: parsed / unrecorded | 32258 | 41111 | 100.0 | 0.0 | not-run | not-applicable |
| vectalon | 1 | passed | matched | passed | passed | initial: parsed / unrecorded | 33207 | 42680 | 100.0 | 0.0 | not-run | not-applicable |
| vectalon | 2 | passed | matched | passed | passed | initial: parsed / unrecorded | 29273 | 38711 | 100.0 | 0.0 | not-run | not-applicable |
| task-only | 2 | passed | matched | passed | passed | initial: parsed / unrecorded | 23554 | 32429 | 100.0 | 0.0 | not-run | not-applicable |
| task-only | 3 | passed | matched | passed | passed | initial: parsed / unrecorded | 23027 | 31707 | 100.0 | 0.0 | not-run | not-applicable |
| vectalon | 3 | passed | matched | passed | passed | initial: parsed / unrecorded | 30299 | 39144 | 100.0 | 0.0 | not-run | not-applicable |

## review: order-input-review

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: order-input-review · workflow: review · app revision: 7da3f6e52049980f53460d0ccfce35130e1763aa

Review passes require the generated test to pass on the original service and fail through an assertion on the proposed service; a compile/runtime error is not detection.

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

### Bounded resource protocol

direct native  no router enrichment/fallback  default sampling unchanged

Row limit: 6. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| task-only | 1 | macos-pressure-estimate | 3264175144 | 4621860864 | 1110/2048/3584/128 | none observed |
| vectalon | 1 | macos-pressure-estimate | 3092376453 | 2752135168 | 2104/2048/4608/128 | none observed |
| vectalon | 2 | macos-pressure-estimate | 3264175144 | 2144337920 | 2104/2048/4608/128 | none observed |
| task-only | 2 | macos-pressure-estimate | 3264175144 | 1426145280 | 1110/2048/3584/128 | none observed |
| task-only | 3 | macos-pressure-estimate | 3264175144 | 764198912 | 1110/2048/3584/128 | none observed |
| vectalon | 3 | macos-pressure-estimate | 4123168604 | 1045692416 | 2104/2048/4608/128 | none observed |

### Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 3 | 0 | 0/3 | 0/3 |
| vectalon | 3 | 0 | 3 | 0 | 2/3 | 0/3 |

### Workflow qualification boundary

Scope: this model artifact, task and condition only. Failed means an observed task, identity, safety or native gate failed; unverified means no recorded failure, not qualification. No automatic qualification: repeated held-out comparisons, comparable budgets and customer/native acceptance still require review. Native counts use supplied candidate verification only, never local inference calls. Pending rows and missing scores remain unresolved; tokens/cost and human effort remain unmeasured.

| Condition | Gate state | Rows with observed gate failure | Pending | Supplied native passed/checked |
|---|---|---:|---:|---:|
| task-only | failed | 3 | 0 | 0/0 |
| vectalon | failed | 3 | 0 | 0/0 |

### Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| task-only | 1 | failed | matched | failed | failed | initial: parsed / unrecorded | 27103 | 38798 | 100.0 | 0.0 | not-run | not-applicable |
| vectalon | 1 | failed | matched | passed | failed | initial: parsed / unrecorded | 23162 | 34027 | 100.0 | 0.0 | not-run | not-applicable |
| vectalon | 2 | failed | matched | failed | failed | initial: parsed / unrecorded | 24834 | 39067 | 100.0 | 100.0 | not-run | not-applicable |
| task-only | 2 | failed | matched | failed | failed | initial: parsed / unrecorded | 21367 | 32479 | 100.0 | 0.0 | not-run | not-applicable |
| task-only | 3 | failed | matched | failed | failed | initial: parsed / unrecorded | 23688 | 34088 | 100.0 | 0.0 | not-run | not-applicable |
| vectalon | 3 | failed | matched | passed | failed | initial: parsed / unrecorded | 22168 | 32113 | 100.0 | 0.0 | not-run | not-applicable |
