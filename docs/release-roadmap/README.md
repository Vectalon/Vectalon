# Vectalon release roadmap — execution index

This index turns the ratified Step 02 architecture into the next ten implementation steps. The audience is the technical lead and maintainers of Core, Vectalon, and Admin. These are implementation specifications and reviewer gates; this branch contains no product implementation.

## Architectural invariants

1. Core owns reusable contracts, verification, entitlement policy, engineering profiles, and generic guardrail primitives. It is a library, not a server or database.
2. Vectalon owns the public product manifest, RN/CLI/native adapters, website, customer-facing gateway, packages, and release evidence.
3. Admin owns authoritative customers, purchases, subscriptions, trials, license issuance/revocation, audit, support, and operational reporting.
4. Admin and Vectalon share no code or database. Runtime coordination uses authenticated, versioned HTTP/events. Consumers pin a verified Core revision.
5. No claim becomes `available` or paid until customer-shaped evidence proves it supportable.

## Monetisation findings to resolve

| Finding | Required resolution | Owning step |
|---|---|---|
| Public copy promises a Free plan, but the manifest contains only three paid plans | Add structured Free plan and entitlements or remove the promise | 03, 05 |
| Product is marked `available` and “monetization is live” while Admin remains a static prototype | Use an honest beta lifecycle until purchase-to-support gates pass | 03, 05, 09, 10 |
| Team is `$49/developer/month` and also “up to 50 seats” | Define quantity/bundle and enforcement rules | 05, 09 |
| “All current and future products” creates open-ended commercial scope | Define subscription/product-family/version rights | 05, 08, 09 |
| “Refunds revoke instantly” conflicts with offline cached validation | Publish and test a bounded revocation SLA | 08, 09 |
| BSL free commercial use for teams up to three is conflated with the product Free tier | Define legal grant versus entitlement representation | 05, 06 |
| Enterprise promises SSO, audit, air-gap, private models, and multi-repository intelligence before qualification | Mark planned/beta until security and deployment evidence exists | 05, 10 |

Legal, tax, accounting, and privacy claims require qualified professional review before GA; engineering tests cannot substitute for it.

## Ordered steps

| Step | Outcome | Blocks |
|---|---|---|
| [03](./03-versioned-cross-language-contracts.md) | Versioned contracts and one proven seam | All later shared work |
| [04](./04-core-harness-rn-integration.md) | Real Core-driven RN workflow with duplication deleted | Product architecture proof |
| [05](./05-capability-freeze-and-evidence-ledger.md) | Honest capability/plan catalog and claim evidence | GA scope and offers |
| [06](./06-secure-entitlement-boundary.md) | One fail-closed decision seam, no shipped bypass | Paid access |
| [07](./07-identity-and-trial-integrity.md) | Verified identity and server-owned trials | Trial conversion |
| [08](./08-license-lifecycle-and-cryptography.md) | Secure, recoverable license lifecycle | Paid operation |
| [09](./09-payments-subscriptions-and-reconciliation.md) | Replayable commercial ledger and correct entitlements | Revenue |
| [10](./10-admin-control-plane-foundation.md) | Authenticated, authorized, audited control plane | Operations |
| [11](./11-durable-data-and-migrations.md) | Durable history, migrations, backup and restore | Production data |
| [12](./12-privacy-telemetry-and-data-governance.md) | Proven privacy and governed observability | Customer trust |

## Sequencing and parallelism

- Step 03 starts first. Step 04 can proceed after its contract subset stabilizes.
- Step 05 may inventory surfaces in parallel with Step 03, but plan/claim enforcement waits for capability contracts.
- Steps 06 and 07 follow the relevant Step 03 schemas; Step 08 follows both.
- Step 10 foundation can begin after Step 03 while Step 09 offer/state design proceeds, but production payment mutations require Steps 08, 10, and 11 controls.
- Step 12 inventory begins immediately; enforcement and deletion drills require the Step 11 data model.

## Technical-lead review protocol

For every step, the reviewer must:

1. Trace every requirement to an owner, code path, test, operational runbook, and customer-visible behavior.
2. Review the three repositories together, including generated artifacts and deployed boundaries—not three isolated PRs.
3. Demand negative-path, concurrency, upgrade/rollback, packaged-artifact, and production-shaped evidence.
4. Independently reproduce critical evidence and inspect what the tests actually cover.
5. Reject duplicated policy, unverifiable claims, unaudited privilege, hidden production fallbacks, and “temporary” bridges without deletion dates.
6. Record residual risk, rollback criteria, observability, support ownership, and an explicit go/no-go decision.

“Best” means secure, correct, comprehensible, operable, accessible, privacy-preserving, and honest under failure—not maximum feature count.

## Completion rule

A step is complete only when every reviewer gate and required-evidence item in its document is satisfied in current code and production-shaped environments. A green narrow test does not prove a broad requirement. Uncertain or indirect evidence counts as incomplete.
