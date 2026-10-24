# Installed-app 7B replication — interrupted, 2026-10-24

The 18-run experiment is **incomplete**. It was stopped for host resource protection; no model improvement or launch qualification is established.

| Workflow | Condition | Planned | Completed failures | Externally interrupted | Not started |
|---|---|---:|---:|---:|---:|
| Stock filter feature | Task-only | 3 | 1 | 0 | 2 |
| Stock filter feature | Vectalon | 3 | 0 | 1 | 2 |
| Session fix | Task-only | 3 | 0 | 0 | 3 |
| Session fix | Vectalon | 3 | 0 | 0 | 3 |
| Order-copy review | Task-only | 3 | 0 | 0 | 3 |
| Order-copy review | Vectalon | 3 | 0 | 0 | 3 |

Protocol revision `ec0eb45` preceded inference. The separate 7B freeze pins the installed artifact, existing app revision, shared task definitions, acceptance and session probe/assertions; the original 3B freeze remains byte-identical. These are reused public tasks, not fresh held-out evidence.

The completed feature attempt took 161,556 ms, matched the pinned 7B file and stopped with `eogToken`. Its parsed source failed compilation and app tests. This is a genuine failed result, not a timeout or manually repaired candidate. The next row was marked running without a retained result when the resolved process was stopped with SIGTERM. Original row statuses are preserved; interrupted/unstarted rows are not additional model failures or zero-call evidence.

System-wide free memory reached 5% during the run and recovered to 64% after the process exited. The host has 16 GiB RAM. The inference caller currently leaves `createContext()` sizing unspecified; the installed library documents its default as memory-dependent `auto`, attempting a high context size. This is a relevant unbounded allocation path, not proof that context size alone caused this resource event. No further model inference was attempted after interruption.

## Verifier and probe boundary

Feature compiler/Jest controls passed before inference: original compiles but fails acceptance; the separate correct control compiles and passes. After memory recovered, session and review preflights ran without loading the model; their negative/positive outcomes also matched requirements.

The session probe was staged as temporary `App.tsx` and exercised the actual hook through its buttons. Under Jest/native shims, the broken hook compiles but fails the UI assertions; the correct control compiles and passes. The probe and its assertions are hash-pinned and excluded from both model requests. This is **not** native build, simulator/device or model-candidate verification. Review verification requires an assertion failure on the proposed service, not merely invalid generated tests.

[Source-free records](one-app-7b-interrupted-2026-10-24.json) retain partial inference, all verifier controls, fingerprints and interruption classification. Raw/source reports remain only at the private temporary paths identified in that record; do not publish them. No thresholds, production model/sampling defaults, Core/Admin code or customer grants changed; no package release.

Next action belongs to the canonical roadmap: bound and measure native context memory before another inference batch, disclose any changed runtime protocol, and retain this incomplete run rather than replacing it.
