# Step 19 — Enforce the Release-Candidate Entry Gate

## Outcome

Cut an immutable, production-shaped release candidate only when architecture, security, commercial lifecycle, customer journeys, performance, privacy, and operations evidence all meet explicit thresholds.

## Product view

An RC is a candidate for GA, not a test build carrying known release blockers. Scope is frozen; only blocker fixes with regression evidence may enter the candidate line.

## Planned repository changes

### Core

- Tag the compatible Core revision and publish its contract/policy/test evidence.
- Freeze public interfaces and document all supported migrations and known limitations.
- Run cryptographic, entitlement, profile, and compatibility qualification from a clean checkout.

### Vectalon

- Build RN and extension artifacts from the tagged inputs with provenance; deploy the production-shaped website/API candidate.
- Run the complete package-install, customer-journey, benchmark, security, accessibility, and performance matrices.
- Publish release notes, upgrade/rollback instructions, known limitations, and support evidence.

### Admin

- Deploy the candidate control plane and migrations to staging with production topology and sanitized production-shaped data.
- Run webhook replay, reconciliation, restore, key rotation, auth/RBAC, and incident drills.
- Validate operator training and access reviews.

## Deliverables

- Signed RC evidence bundle, blocker list, compatibility matrix, release notes, rollback artifacts, and go/no-go record.

## Reviewer gate

- All P0/P1 issues are closed; accepted lower-severity issues have owners and customer impact statements.
- Artifacts tested are byte-for-byte those proposed for promotion.
- Rollback and forward-fix paths are timed and rehearsed.

## Risks and dependencies

- Depends on Steps 02–18.
- No new feature work is admitted after RC entry.
