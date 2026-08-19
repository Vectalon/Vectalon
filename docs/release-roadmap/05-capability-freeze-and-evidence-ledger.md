# Step 05 — Freeze Breadth and Build a Capability Evidence Ledger

## Outcome

Stop feature expansion and classify every advertised capability as production-qualified, beta, experimental, planned, or removed. Public claims, CLI help, pricing, demos, and Admin reporting must use the same status.

## Product view

Vectalon already has broad surface area. Release quality now comes from trustworthy depth: customer-shaped workflows, predictable failure modes, supportability, and evidence—not additional commands.

## Planned repository changes

### Core

- Define capability identifiers, lifecycle states, dependency metadata, and minimum qualification evidence.
- Keep entitlement independent from capability availability.
- Provide validation for incompatible or impossible capability declarations.

### Vectalon

- Inventory all commands, MCP tools, website claims, benchmarks, and docs against the capability catalog.
- Assign an owner, status, tests, support tier, performance budget, and evidence link to each public capability.
- Hide or label unqualified surfaces and freeze new capability additions until GA.

### Admin

- Display capability versions/statuses relevant to licenses, support cases, and customer installations.
- Prevent operators from granting capabilities that a product version does not implement.
- Track support incidents against canonical capability identifiers.

## Deliverables

- Capability ledger, qualification rubric, claim-to-evidence matrix, removal/deprecation list, and freeze policy.

## Reviewer gate

- Every public claim resolves to executable evidence.
- No pricing or license grants imply unavailable functionality.
- Experimental features are opt-in, isolated, and excluded from GA promises.

## Risks and dependencies

- Depends on Step 03 capability contracts.
- Commercial pressure must not silently relabel planned work as available.

## Implementation sequence

1. **Generate the inventory.** Vectalon enumerates CLI commands, MCP tools, extension commands, website claims, plan features, demos, benchmark scenarios, APIs, and platform pages from source—not hand-maintained counts.
2. **Define qualification states.** Core defines `planned`, `experimental`, `beta`, `release-candidate`, `available`, `deprecated`, and `removed`, including legal transitions and minimum evidence for each.
3. **Create the evidence ledger.** Every capability gets a stable ID, owner, repository, user outcome, supported plan/platform, dependencies, failure modes, support tier, performance budget, tests, docs, and evidence URLs/digests.
4. **Reconcile monetisation.** Map Free, Individual, Team, and Enterprise promises to capability IDs. Resolve whether Team is unlimited per-seat, capped at 50, or sold in bundles; define what “all current and future products” legally and technically means before retaining it.
5. **Apply the freeze.** Add a PR gate that rejects unregistered public capabilities and status promotion without evidence. New ideas enter a post-GA discovery backlog unless they close a release blocker.
6. **Correct every projection.** Generate public counts and plan feature lists from the ledger/manifest. Label or remove unsupported claims, particularly SSO/SAML, air-gapped deployment, cloud sync, cross-project intelligence, instant revocation, and future-platform coverage until their gates pass.
7. **Establish deprecation mechanics.** Define notice, telemetry-independent discovery, CLI warnings, migration guides, removal releases, and license effects.

## Monetisation review gate

- Add an explicit Free plan with zero price and its actual entitlement set.
- Distinguish the BSL commercial-use grant for teams of three or fewer from a hosted-product Free plan; they are related but not interchangeable.
- Paid plan descriptions promise only `available` capabilities. Beta access is separately labelled and never required for the purchased core outcome.
- Enterprise “custom” has a sales qualification checklist and does not advertise security controls that have not been built and independently tested.

## Required evidence

- Machine-generated inventory with zero orphan public surfaces.
- Claim-to-test and plan-to-capability matrices with no missing references.
- Snapshot tests across manifest, website, CLI help, README, commercial license, checkout metadata, and Admin displays.
- Reviewer samples every paid claim, follows it to customer-shaped evidence, and rejects vanity counts that do not represent supported outcomes.

## Exit and rollback

Exit requires every public surface to be generated from or validated against the ledger. A disputed capability moves backward in lifecycle state; evidence is never fabricated or waived to preserve marketing copy.

## Non-goals

- Adding capabilities to make a tier appear fuller.
- Treating unit-test count as proof of customer value.
