# Step 10 — Build the Admin Control-Plane Foundation

## Outcome

Replace the static prototype with a secure internal application architecture before adding operational power. Authentication, authorization, audit, error handling, and environment isolation become platform features for every admin workflow.

## Product view

Admin is a privileged operational system, not a second marketing dashboard. Its first responsibility is safe control; visual polish and broad analytics follow only after authorization and audit are trustworthy.

## Planned repository changes

### Core

- Expose provider-neutral domain contracts and policy results required by Admin.
- Keep UI, database, OAuth, and payment-provider concerns outside Core.
- Provide signed fixtures and policy conformance tests for Admin adapters.

### Vectalon

- Remove or clearly separate duplicate embedded admin surfaces once the private control plane is authoritative.
- Retain only public/customer APIs and narrowly scoped internal integration endpoints.
- Document deployment trust zones and service-to-service authentication.

### Admin

- Establish environment configuration validation, admin SSO/OAuth, allowlisting, RBAC, session security, CSRF protection, and immutable audit middleware.
- Create deep modules for customers, licenses, trials, subscriptions, support, and operations behind small interfaces.
- Add error envelopes, loading/empty/degraded states, secure headers, and test infrastructure.

## Deliverables

- Admin architecture ADR, role matrix, threat model, navigation model, deployment topology, and test strategy.

## Reviewer gate

- No mutation is reachable without explicit authorization and audit.
- Production cannot fall back to development storage or permissive auth.
- Domain modules can be tested without rendering pages or using the production database.

## Risks and dependencies

- Depends on Steps 02–03.
- Avoid porting the website's embedded admin implementation wholesale without ownership review.
