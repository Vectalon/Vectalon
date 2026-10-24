# Full-output-budget resource trial — 2026-10-24

Outcome: one real 7B call completed in **74,593 ms** under the predeclared 180-second deadline. This is resource evidence only. Model output was discarded, not parsed or checked as an app change; no task-success, native-device or improvement claim follows.

[Source-free observation](native-context-full-budget-2026-10-24.json), protocol/runtime revision `9f726c7270315c2cd2e54f5ff2d1924bfd2680a1`. Invocation: `node scripts/experiments/native-context-preflight.cjs --full-budget`. One call, no repair, task-only frozen public stock-filter input, temperature 0.2, existing production sampling defaults. The original evaluation freezes and interrupted batch remain unchanged.

| Observation | Result |
|---|---|
| Model | Qwen2.5-Coder-7B; observed SHA-256 matched the pinned artifact |
| Complete formatted input | 3,617 tokens |
| Requested output cap | 2,048 tokens, not an observed output-token count |
| Allocated context / batch | 6,144 / 128 tokens |
| Stop reason | `eogToken` (normal end, not token-cap exhaustion) |
| Host capacity | 16 GiB; below recommended 32 GB class for 7B |
| Available-budget estimate | 6.24 GiB before; sampled minimum 3.2 GiB; 3.52 GiB after |
| Maximum sampled process RSS | 3,021,717,504 bytes, about 2.81 GiB |

The read-only macOS pressure metric is an estimate. One-second process/host samples do not measure peak GPU/RAM; the 2 GiB watchdog reserve remained unchanged. The process exited successfully, and a subsequent system query showed 56% available memory. Original raw-free refusal and eight-token calibration remain separate records.

## Interpretation and next boundary

The requested full-output budget fits this task-only prompt and completed once without the observed reserve being crossed. It does not prove generation of all 2,048 tokens, guided-prompt allocation, cached multi-call stability, task correctness or sustained safety on this host.

Before restarting a paired experiment, carry the cancellation/reserve watchdog into its runner and retain separately labelled runtime identity and interrupted/unstarted statuses. Then run one bounded task-only/guided pair before considering the full three-task batch. Preserve failures and compare this model only against itself; public development tasks cannot replace fresh held-out/native/customer qualification.

Verification: all 68 experiment/report tests passed, including both calibration modes, mismatched-artifact refusal, unknown-argument refusal and retained source-free observation checks. Product, Core-contract and capability consistency checks and diff whitespace validation passed. No fresh full RN suite was run because production source was unchanged; the preceding slice's 3,187 passed/one skipped remains historical regression evidence.

Core/Admin, production inference, grants and release thresholds were unchanged. No package release.
