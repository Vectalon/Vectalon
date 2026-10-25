# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: stock-filter · workflow: feature · app revision: 7da3f6e52049980f53460d0ccfce35130e1763aa

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 2 · grammar: files-json

## Bounded resource protocol

direct native in both conditions  no router enrichment/fallback  default sampling unchanged

Row limit: 1. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| vectalon-verified-repair | 1 | macos-pressure-estimate | 3092376453 | 3657760768 | 4611/2048/7168/128 | none observed |

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| vectalon-verified-repair | 3 | 0 | 1 | 2 | 0/1 | 0/1 |

## Initial versus assisted outcomes

Single guided diagnostic: initial plus at most one repair/parse retry  4096 requested output tokens total and 360 seconds including checks  not equal to first-pass budgets

Candidate verification is not selection or native qualification. Missing/invalid initial candidates are not passes. Equal declared call caps do not imply equal actual calls or input-token work.

| Condition | Initial verified passes/planned | Parse retries | Repair candidates verified/attempted | Selected app-check passes | Observed provider calls |
|---|---:|---:|---:|---:|---:|
| vectalon-verified-repair | 0/3 | 0 | 0/1 | 0 | 2 recorded; remainder unrecorded |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| vectalon-verified-repair | 1 | failed | matched | failed | failed | initial: parsed / failed; repair: parsed / failed | 163071 | 163095 | 85.2 | 50.0 | not-run | not-applicable  not-applicable |
| vectalon-verified-repair | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| vectalon-verified-repair | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |

## Outcome and audit boundary

The single declared structured workflow at `cf35ee9` completed in **163,095 ms**. Both responses matched the pinned Qwen2.5-Coder-7B artifact and stopped with `stopGenerationTrigger`.

| Stage | Native ms | Strict JSON and envelope | Compiler/app checks | Selected |
|---|---:|---|---|---|
| Initial, temperature 0.2 | 76,661 | Passed | Both failed | Yes, still failed |
| Repair, temperature 0 | 70,077 | Passed | Both failed | No |

The existing file-envelope schema, SHA-256 `3782765f598c9353b76387002e30900fc132910cd5a9ad84bcd57abe5cb7cd0a`, was applied to both native calls. The parser returned exactly the strict-decoded file set in each case; source-free raw/file-set hashes are retained in [JSON](structured-repair-2026-10-25.json). This verifies serialization for these two outputs, not correctness or a reliable causal improvement. Code remained malformed; compiler diagnostic categories include TS1490 and JSX syntax errors. The repair's guardrails/adherence rose to 92.6%/66.7% from 85.2%/50%, but neither app verification nor unchanged release gates passed. Selection correctly retained the failed initial candidate instead of accepting a higher-scoring failed repair.

The diagnostic shared a 360-second workflow budget and at most two calls of 2,048 requested output tokens each, with no extra retries. Formatted inputs/context allocations were 4,611/7,168 and 6,191/8,704 tokens, batch 128. Minimum sampled available-budget estimate was about 2.88 GiB; maximum sampled process RSS about 3.41 GiB. These are not peak GPU/RAM measurements or sustained-safety qualification. The 16 GiB host remains experimental/below recommended 32 GB for 7B; actual generated token counts/cost remain unmeasured. Two planned repetitions remain unstarted.

The schema is internally exported for reuse; production defaults and parser behavior did not change. The sandbox-refused inspection fixture evidence 1.0.29 remains retained. Authorized inspection 1.0.30 and the other affected fixture groups passed; refreshed implementation/fixture evidence does not promote lifecycle or prove customer/native success.

Next stop full-file stock-filter tuning and evaluate existing scoped edits in a separately declared installed-app diagnostic. Preserve exact-application checks, app verification and initial/assisted results; do not infer improvement from fewer serialization errors or raise budgets/weaken thresholds to obtain green outcomes. Public development diagnostics do not replace fresh held-out/native/customer evidence.

Raw response text and generated public source stay only in the explicitly opted-in temporary local report. Durable evidence retains hashes, metadata, checks, rejected repair and unstarted rows. Core/Admin/grants unchanged; no package release.

Verification: 661 model/benchmark/workflow tests across 43 suites, 92 experiment/report checks, 22 capability tests and 13 product/contract tests passed. RN build, targeted provider lint, three affected fixture qualification groups and product/contract/capability consistency passed. The initial localhost sandbox refusal is retained separately, not relabelled a pass. No fresh full RN suite, native build/device or paid-customer acceptance was performed.

