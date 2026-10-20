# RN development pilot

Observed development evidence, not model qualification or unseen-task improvement. Native builds, tokens/cost and human correction time are unmeasured.

Model: qwen2.5-coder-3b · expected file SHA-256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
Output-token cap: 2048 · attempt cap: 1 · grammar: not requested

## Outcome matrix

Check fractions count only recorded, non-skipped checks. Missing checks are not passes. Task passes require matching model identity and both app checks; pending runs remain in the planned count.

| Condition | Planned | Task passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |
|---|---:|---:|---:|---:|---:|---:|
| task-only | 3 | 0 | 3 | 0 | 3/3 | 0/3 |
| vectalon | 3 | 0 | 3 | 0 | 0/3 | 0/3 |

## Repetitions and attempts

Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.

| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms |
|---|---:|---|---|---|---|---|---:|
| task-only | 1 | failed | matched | passed | failed | initial: parsed / unrecorded | 17140 |
| vectalon | 1 | failed | matched | failed | failed | initial: parsed / unrecorded | 16287 |
| vectalon | 2 | failed | matched | failed | failed | initial: parsed / unrecorded | 17561 |
| task-only | 2 | failed | matched | passed | failed | initial: parsed / unrecorded | 14023 |
| task-only | 3 | failed | matched | passed | failed | initial: parsed / unrecorded | 13465 |
| vectalon | 3 | failed | matched | failed | failed | initial: parsed / unrecorded | 8357 |
