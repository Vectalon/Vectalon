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

## Implementation sequence

1. **Write the deployment/threat model.** Identify administrators, support agents, service identities, attackers, trust zones, environments, secrets, data classes, and privileged operations. Choose an explicit production deployment and identity provider.
2. **Establish secure configuration.** Validate all environment variables at startup, separate dev/staging/prod, prohibit production fallback stores/auth, centralize secret references, and expose non-sensitive health/readiness checks.
3. **Implement authentication and sessions.** Use provider-backed admin identity, allowlisting/group membership, secure cookies, rotation, idle/absolute expiry, CSRF protection, logout/revocation, and reauthentication for high-risk actions.
4. **Implement authorization as policy.** Define roles such as viewer, support, billing, license operator, security admin, and platform admin. Enforce permissions in server/domain commands, not only pages; default deny and test every mutation.
5. **Make audit unavoidable.** A command bus/middleware records actor, role, action, target, request correlation, reason, before/after references, result, timestamp, and policy version. Audit writes are append-only and cannot be bypassed by UI/API routes.
6. **Build domain modules.** Customers, identities, trials, subscriptions, licenses, support, and operations expose small command/query interfaces independent of Next.js pages and database implementation.
7. **Create the operator shell.** Accessible navigation, search, pagination, confirmation/reason capture, loading/empty/error/degraded states, correlation IDs, and safe redaction precede dashboard ornamentation.
8. **Move one authoritative workflow.** Migrate a bounded operation (for example read-only license lookup, then audited revocation) from Vectalon’s embedded admin surface. Delete the duplicate only after parity/security tests pass.

## Repository acceptance

- **Core:** only provider-neutral contracts/decisions; no Admin database, OAuth, or UI concerns.
- **Vectalon:** public gateway uses service authentication and contains no Admin session logic or operational write model; duplicate embedded admin routes have a migration/deletion ledger.
- **Admin:** all routes and commands are authenticated, authorized, audited, rate-limited where needed, and environment-safe.

## Required evidence

- Threat model, role-permission matrix, architecture ADR, route/command inventory, and deployment topology.
- Automated anonymous, wrong-role, CSRF, session-expiry, audit-failure, secret-missing, and production-fallback tests.
- Accessibility and keyboard review of critical workflows; dependency/security scan; production build from a clean checkout.
- Reviewer attempts direct API calls and domain-command invocation for every role, verifies audit atomicity, and confirms no sensitive fields appear in logs/errors.

## Exit and rollback

Exit requires one safely migrated authoritative workflow and proof that no mutation bypasses policy/audit. Rollback disables the new mutation path and preserves append-only evidence; it must not reactivate an unauthenticated Vectalon admin route.

## Non-goals

- Broad analytics, polished executive dashboards, or bulk destructive operations.
- Copying current website admin code without threat-model review.
