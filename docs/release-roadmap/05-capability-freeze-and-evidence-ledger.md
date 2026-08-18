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
