# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: stock-filter · workflow: feature · app revision: 7da3f6e52049980f53460d0ccfce35130e1763aa

Model: qwen2.5-coder-7b · expected file SHA-256: 89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

## Bounded resource protocol

direct native in both conditions  no router enrichment/fallback  default sampling unchanged

Row limit: 1. Remaining planned rows stay not-run. Reserve: 2147483648 bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.

| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |
|---|---:|---|---:|---:|---|---|
| vectalon | 1 | macos-pressure-estimate | 3607772528 | 4242604032 | 4611/2048/7168/128 | none observed |

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 0 | 3 | 0/0 | 0/0 |
| vectalon | 3 | 0 | 1 | 2 | 0/1 | 0/1 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|
| task-only | 1 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| vectalon | 1 | failed | matched | failed | failed | initial: parsed / unrecorded | 75579 | 83975 | 88.9 | 50.0 | not-run | not-applicable |
| vectalon | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| task-only | 2 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| task-only | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |
| vectalon | 3 | not-run | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unrecorded | unscored | unscored | not-run | unrecorded |

## Decoding audit

One guided call at `6deb6f4` completed in 75,579 ms generation / 83,975 ms including checks. It matched the pinned Qwen2.5-Coder-7B artifact and stopped with `eogToken`. Five planned rows remain unstarted; this is an unpaired diagnostic, not a new comparison or improvement result.

The explicitly captured local response was 4,069 bytes, SHA-256 `2eafe6a6911848fd58676dff61c13aa360a941e3f560d2db8329527e026a512f`. Whole-response JSON parsing fails because the response is markdown-fenced; strict parsing of its fenced JSON succeeds. The parser's single file is exactly equal to that strict JSON result, with matching file-set hashes in the [source-free audit](output-decoding-2026-10-24.json). Invalid JSX and stray escaped fragments therefore precede this parser in this observed call. Compilation and app tests failed. Do not repair escaping blindly: valid source can intentionally contain literal backslash-n strings and regular expressions.

Offline strict/fenced/salvaged re-encoding preserved the earlier saved malformed candidate byte-for-byte. Synthetic JSX/Unicode/CRLF/quote/backslash/backtick cases also pass. These checks do not recover the previous raw response or explain its unparseable output, and they are not proof against every parser defect.

Input/context were 4,611/7,168 tokens, output cap 2,048, batch 128. Minimum sampled available-budget estimate was 3.36 GiB; maximum sampled process RSS about 3.95 GiB. Sampling is not peak GPU/RAM measurement, and this 16 GiB host remains below the recommended 32 GB class for 7B.

Next: separately declare a bounded repair diagnostic using existing compiler feedback and verification, retaining the initial failed candidate, actual repair calls and assisted outcome. No first-pass batch expansion or threshold changes. Raw output and generated public source stay only in the opted-in temporary local report; durable evidence contains no response/source text. Core/Admin, production parser/inference and grants unchanged; no package release.

Verification: 452 benchmark/workflow tests across 27 suites and all 85 experiment/report checks passed; targeted parser tests passed again after a lint-only fixture-quoting correction. Targeted lint, product, Core-contract and capability consistency, and diff whitespace checks passed. No full RN suite, native build/device run or new package release was performed for this diagnostic-only change.

