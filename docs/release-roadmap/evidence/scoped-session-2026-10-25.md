# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: current-session · workflow: fix · app revision: 7da3f6e52049980f53460d0ccfce35130e1763aa

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 1 · grammar: required tool arguments: propose_edits

Anchor selection: top-level-source-blocks. Source selection is not implementation correctness.

## Bounded resource protocol

direct native in both conditions  no router enrichment/fallback  default sampling unchanged

Row limit: 1. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| vectalon-edits | 1 | macos-pressure-estimate | 3092376453 | 4451188736 | 1959/2048/4352/128 | none observed |

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| vectalon-edits | 3 | 0 | 1 | 2 | 0/1 | 0/1 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| vectalon-edits | 1 | failed | matched | failed | failed | initial: parsed / unrecorded | 19896 | 28119 | 88.9 | unscored | not-run | applied |
| vectalon-edits | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| vectalon-edits | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |

## Real outcome versus offline gate verification

One real Qwen2.5-Coder-7B call at `ef172a6` completed in 19,884 ms native / 28,119 ms including app checks. It matched the pinned artifact and stopped with `stopGenerationTrigger`. The required-tool response was strict JSON, selected an offered block and applied exactly, but its 52-byte replacement truncated the hook. Compiler (TS1005) and app tests failed. Two repetitions remain unstarted. This is a failed public-task diagnostic, not a successful fix or performance comparison with the different stock-filter task.

Input/context tokens: 1,959/4,352; output cap 2,048, batch 128. Minimum sampled available estimate about 2.88 GiB; maximum sampled process RSS about 4.15 GiB. Samples do not measure peak GPU/RAM or qualify sustained operation on this experimental 16 GiB host. App/probe positive and negative controls passed expected outcomes, but probe checks use Jest/native shims, not native build/device evidence.

The observed failure exposed a validation gap in the existing experimental edit generator. At `078cb0a`, the harness now parses each complete proposed fragment and the composed module before accepting a candidate. Independent fragment parsing prevents an incomplete replacement from absorbing the next unchanged statement. Complete export fragments may refer to existing declarations; the final module still gets its normal parse check. The original observed `applied` status above is retained as history, not rewritten.

[Offline replay](scoped-syntax-replay-2026-10-25.json) delivered the exact recorded response through the new gate, with matching original task/request fingerprints: zero native calls, one stub delivery, invalid/rejected, no selected candidate, unchanged fixtures. This proves early rejection of this input, not model improvement. Raw input remains in the opted-in temporary local report; durable hashes alone cannot recover that private input if the temporary report is removed. Stable regression fixtures reproduce the truncated-block failure without retaining generated source.

Three failing-before-fix syntax regressions reproduced the gap. Final verification: 665 model/benchmark/workflow tests across 43 suites, a repeat of all 36 edit-generator tests, 98 experiment/report checks, RN build, targeted lint, and product/contract/updated evaluation capability consistency passed. The full RN suite and native-device checks were not rerun. No lifecycle promotion or release.

Next qualify smaller source-grounded anchors offline before another separately declared inference trial: top-level-only anchors can require replacing an entire hook. Keep exact-application, syntax and compiler/app acceptance separate; syntax rejection does not make otherwise valid code correct. Core/Admin, production defaults, customer grants and thresholds unchanged.

