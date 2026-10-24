# Small paired generation controls — 2026-10-24

Result: the selected model can complete the simple typed function without the edit protocol; neither condition completed the React batched-state task. The block-edit condition passed **0/6**, versus **3/6 task-only**. This is negative development evidence, not a causal grammar study or RN qualification.

## Declared method

Revision `03e93ea` committed both public tasks, verifier controls and runner before inference. Qwen2.5-Coder-3B, observed GGUF SHA-256 `724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7`; all twelve runs matched that file observation. Each task/condition had three repetitions, alternating condition order, one initial attempt/provider call, 2,048 output tokens, temperature 0.2 and a 180-second run deadline. No retries, repairs, candidate edits or model substitutions occurred.

Task-only requests complete file JSON with minimal instructions and original source. Block edits use the existing required-tool/AST-block adapter and repeat approved source in a catalogue. Prompts and input sizes differ; no grammar-only causal attribution is justified. Actual token/cost accounting, seeds, human correction time and native checks are absent. Background consistency checks overlapped part of the shared-host run; durations in JSON are observations, not controlled performance evidence.

Both tasks use the installed Expo demo's compiler and full Jest suite in disposable copies. The original synthetic files compile but fail behavioral acceptance; separate assistant-written verifier controls pass both checks. Neither verifier source nor positive implementation was in model requests. These are controlled development fixtures, not unseen tasks, customer workflows or native-app task proof.

## Outcome matrix

Checked denominators exclude explicit skips. Every planned run stays visible.

| Task | Condition | Planned | Parsed candidates | App-check passes | Typecheck passed/checked | Tests passed/checked |
|---|---|---:|---:|---:|---:|---:|
| Bounded/rounded page function | Task-only | 3 | 3 | 3 | 3/3 | 3/3 |
| Bounded/rounded page function | Block edits | 3 | 2 | 0 | 0/2 | 0/2 |
| React batched counter | Task-only | 3 | 2 | 0 | 1/2 | 0/2 |
| React batched counter | Block edits | 3 | 3 | 0 | 0/3 | 0/3 |

Page function: all task-only outputs passed. Block-edit repetition 1 selected the same block twice and was rejected; repetitions 2 and 3 applied but failed typechecking and behavior due to an undefined return where a number was required. The three successful task-only candidates scored 100% on the tested guardrail rubric; adherence was unscored, not 100% or qualified.

React counter: all raw task-only envelopes were malformed even after removing their outer JSON fences. The existing parser accepted recoverable files in repetitions 2 and 3; those outcomes remain separate from clean envelope serialization. Repetition 1 was rejected and app checks skipped; repetition 2 compiled but failed the batched-update test; repetition 3 failed compilation with a missing `useRef` name and failed behavior. All three block-edit proposals applied but introduced missing names/scope errors and failed both checks. The earlier live update saying all task-only counter responses were rejected before app checks was premature; the final records here correct it.

## Records and boundaries

- [Page function: all six runs, controls, settings, fingerprints and response hashes](page-bound-control-2026-10-24.json)
- [React counter: all six runs, controls, settings, fingerprints and response hashes](batched-counter-control-2026-10-24.json)

Raw source remains only in explicitly opted-in private reports `/private/tmp/vectalon-cart-pilot-rDO2zC/report.json` and `/private/tmp/vectalon-cart-pilot-J01MWx/report.json`; do not upload them. Durable JSON omits raw responses, generated artifacts and command output. Source-free inspections record envelope validity without repairing it or changing selection. Rejected-output zero rubric scores are placeholders, not measured source quality. Passing app checks or an applied edit is not native qualification, safety proof or model improvement.

Next measure the existing guided full-file generator on these same development controls under separately declared budgets, before changing prompts or adding more protocols. That separates current guidance from the experimental edit strategy more usefully; it still needs fresh held-out RN/native evidence afterward. Keep block edits experimental and out of default customer paths. Core/Admin and customer data/grants unchanged; no release.
