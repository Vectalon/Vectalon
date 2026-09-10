# SDD ledger — plan: docs/release-roadmap/08-license-lifecycle-and-cryptography.md

## Pre-flight interface scan

| Tasks | Producer → consumer | Finding |
|---|---|---|
| 1 → 5 | Core lifecycle states → Admin mutations | Shared state names and transition rules required. |
| 2 → 3 | Crypto policy → Core verifier modules | Existing RS256 parser/verifier should be extended, not replaced. |
| 2 → 4 | Key-set policy → Admin signer custody | Managed KMS is unavailable today; signer interface plus env-backed adapter is the reversible minimum. |
| 3 → 6 | Core typed results/storage → Vectalon CLI UX | Preserve existing credential compatibility and Free fallback. |
| 4 → 5 | Admin signer/audit → lifecycle commands | Signing authority must remain server-only and separate from support reads. |
| 5 → 6 | Admin refresh/amend/revoke → Vectalon activation/refresh | Versioned response contract required. |
| 2,7 | Key overlap policy → golden vectors/rotation drill | Key-set selection and compromised-key rejection must be executable. |
| 1 | State machine text vs transitions | Consistent; canceled and refunded become terminal access states. |
| 2 | Crypto rules vs existing production tokens | Must retain current RS256/kid compatibility during overlap. |
| 3 | Deep modules vs existing code | Refactor only where required; avoid duplicate verifier. |
| 4 | KMS requirement vs current infrastructure | Ruling: ship KMS-capable signer boundary with existing Vercel secret adapter; managed KMS activation remains deployment configuration. Cost if wrong: another adapter/migration before higher-volume sales. |
| 5 | Command breadth vs zero-user launch | Implement shared transition engine and issued-license persistence once; expose only required API actions. |
| 6 | UX breadth vs CLI surface | Reuse `vectalon auth`; add refresh/status/recovery there. |
| 7 | Rotation/compromise evidence | Use deterministic golden vectors and repository/build secret scans. |
## Task status

| Task | State | Implementer | Reviewer | Notes |
|---|---|---|---|---|
| 01 Core lifecycle + cryptography | approved | 085ed32 + e86119f + 11b8453 + c8df172 + 98aee26 | approved | 599 tests; shared V2 schema/vectors frozen at 98aee26; packaged root now carries the trusted-claim constructor and fail-closed lifecycle evidence |
| 02 Admin lifecycle commands + custody | approved-with-deployment-blockers | 5b9d0e4..79bcfca | approved | 67 tests; migrations/live PG/KMS activation remain deployment gates |
| 03 Vectalon activation + storage UX | remediated-awaiting-independent-review | b33dfa0 + final-review remediation | pending | root-only bundled Core trust path, terminal refresh quarantine, and explicit failed-status UX now covered by signed-token and isolated packed-artifact tests |
| 04 Cross-repo drill + release | integration-qualified-with-deployment-blockers | 643bd87 + final-review remediation | pending | terminal lifecycle response is typed through website/RN; focused RN 45 and website 13 tests passed; no production migration/KMS activation |
