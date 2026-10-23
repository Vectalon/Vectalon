# Frozen one-app comparison — 2026-10-23

All 18 first attempts retained. No guided app-check passes and no qualified candidates. Supplemental native verification is recorded in [the native probe evidence](current-session-native-2026-10-23.md); the original inference outcomes below are unchanged.

---

# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: stock-filter · workflow: feature · app revision: 7da3f6e52049980f53460d0ccfce35130e1763aa

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 3 | 0 | 0/0 | 0/0 |
| vectalon | 3 | 0 | 3 | 0 | 0/1 | 0/1 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|
| task-only | 1 | failed | matched | unrecorded | unrecorded | initial: invalid / unrecorded | 37591 | 37845 | 0.0 | 0.0 | not-run |
| vectalon | 1 | failed | matched | unrecorded | unrecorded | initial: parsed / unrecorded | 21801 | 21804 | 97.7 | 0.0 | not-run |
| vectalon | 2 | failed | matched | unrecorded | unrecorded | initial: parsed / unrecorded | 21219 | 21220 | 97.7 | 0.0 | not-run |
| task-only | 2 | failed | matched | unrecorded | unrecorded | initial: invalid / unrecorded | 29715 | 29716 | 0.0 | 0.0 | not-run |
| task-only | 3 | failed | matched | unrecorded | unrecorded | initial: invalid / unrecorded | 28192 | 28195 | 0.0 | 0.0 | not-run |
| vectalon | 3 | failed | matched | failed | failed | initial: parsed / unrecorded | 17143 | 25025 | 96.2 | 0.0 | not-run |

---

# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: current-session · workflow: fix · app revision: 7da3f6e52049980f53460d0ccfce35130e1763aa

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 1 | 2 | 0 | 1/1 | 1/1 |
| vectalon | 3 | 0 | 3 | 0 | 0/3 | 0/3 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|
| task-only | 1 | failed | matched | unrecorded | unrecorded | initial: invalid / unrecorded | 25531 | 25723 | 0.0 | 0.0 | not-run |
| vectalon | 1 | failed | matched | failed | failed | initial: parsed / unrecorded | 8620 | 15855 | 94.4 | unscored | not-run |
| vectalon | 2 | failed | matched | failed | failed | initial: parsed / unrecorded | 7444 | 14490 | 100.0 | unscored | not-run |
| task-only | 2 | passed | matched | passed | passed | initial: parsed / unrecorded | 12527 | 20726 | 94.4 | unscored | not-run |
| task-only | 3 | failed | matched | unrecorded | unrecorded | initial: invalid / unrecorded | 40373 | 40374 | 0.0 | 0.0 | not-run |
| vectalon | 3 | failed | matched | failed | failed | initial: parsed / unrecorded | 8506 | 16026 | 94.4 | unscored | not-run |

---

# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.

Task: order-copy-review · workflow: review · app revision: 7da3f6e52049980f53460d0ccfce35130e1763aa

Review passes require the generated test to pass on the original service and fail through an assertion on the proposed service; a compile/runtime error is not detection.

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.

| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 3 | 0 | 0/2 | 0/2 |
| vectalon | 3 | 0 | 3 | 0 | 0/0 | 0/0 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|
| task-only | 1 | failed | matched | failed | failed | initial: parsed / unrecorded | 7045 | 16898 | 94.4 | 0.0 | not-run |
| vectalon | 1 | failed | matched | skipped | skipped | initial: parsed / unrecorded | 6552 | 6556 | 100.0 | unscored | not-run |
| vectalon | 2 | failed | matched | skipped | skipped | initial: parsed / unrecorded | 7907 | 7909 | 100.0 | unscored | not-run |
| task-only | 2 | failed | matched | unrecorded | unrecorded | initial: invalid / unrecorded | 7126 | 7127 | 0.0 | 0.0 | not-run |
| task-only | 3 | failed | matched | failed | failed | initial: parsed / unrecorded | 5746 | 15628 | 88.9 | 0.0 | not-run |
| vectalon | 3 | failed | matched | skipped | skipped | initial: parsed / unrecorded | 6922 | 6924 | 100.0 | unscored | not-run |
