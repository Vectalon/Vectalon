# Native context resource calibration — 2026-10-24

Outcome: bounded native inference completed once. This is resource-path evidence, not app-task success, native-device verification or model improvement. The interrupted 18-run evaluation remains incomplete.

| Attempt | Runtime revision | Result | Retained record |
|---|---|---|---|
| Initial raw-free gate | `70c2573` | Refused before loading weights/context; final watchdog classified aborted. Raw free pages were 84 MiB; no model observation. | [Initial refusal](native-context-raw-free-refusal-2026-10-24.json) |
| Corrected macOS estimate | `b892d6c` | One bounded inference completed in 39,696 ms; pinned artifact matched. | [Bounded calibration](native-context-bounded-2026-10-24.json) |

The same request fingerprint is retained across both attempts. The second run used Qwen2.5-Coder-7B, artifact SHA-256 `89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be`, and the frozen stock-filter public task-only input. Complete formatted input: 3,617 tokens; output cap: eight tokens; allocated context: 4,096; batch size: 128. The response stopped at its token cap; response text was discarded and no generated task was tested.

On this 16 GiB host, the read-only macOS pressure estimate started at 6.4 GiB and reached a sampled minimum of 3.2 GiB, above the unchanged 2 GiB reserve. Maximum sampled process RSS was 1,370,521,600 bytes (about 1.28 GiB). These one-second samples are not peak RAM/GPU usage or an allocation guarantee. Raw OS free pages are recorded separately; invalid pressure queries fall back conservatively to that raw metric.

The runtime now reserves complete formatted input plus requested output plus 256 tokens, uses bounded context allocation, and refuses unsafe fit/low-memory/concurrent allocations instead of silently dropping context. Neither sampling defaults nor release thresholds changed. This source work is not in the published RN package yet.

## Remaining boundary

The full 2,048-output-token task-only request would require a 6,144-token allocation with this input; that workload was **not measured** here. Guided prompts and sustained batches are also unproven. A 16 GiB host remains below the recommended 32 GB class for 7B and is experimental. Declare and inspect one separately labelled full-budget resource trial with a watchdog before considering another paired batch. Preserve original 3B/7B freezes and all prior outcomes; do not use this calibration as held-out task evidence.

## Regression verification

Full RN regression exited successfully: 3,187 passed, zero failed, one skipped across 321 suites. The skipped check remains unverified. Focused model/benchmark/fix coverage passed 502 tests; experiment/report checks passed 64; capability tests passed 22; product/contract tests passed 13. RN build, targeted lint, website typecheck, and product/contract/capability consistency checks passed. These checks do not establish model improvement or native-device success.

Core, Admin, customer grants and production data were unchanged. No package release.
