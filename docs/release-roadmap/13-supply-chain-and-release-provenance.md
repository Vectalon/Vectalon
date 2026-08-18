# Step 13 — Secure the Supply Chain and Release Provenance

## Outcome

Make every release reproducible, attributable, dependency-audited, and resistant to secret or artifact substitution across private Core, public Vectalon, npm, the VS Code Marketplace, website deployment, and Admin deployment.

## Product view

The customer installs a composite artifact built from multiple repositories. Release trust requires recording exactly which source, workflow, dependencies, contracts, and tests produced it.

## Planned repository changes

### Core

- Pin and verify build inputs, eliminate generated/source drift, scan dependencies and secrets, and produce immutable revision metadata.
- Define the supported Core-to-product compatibility matrix.
- Protect signing and release branches with required review and CI.

### Vectalon

- Extend release provenance with Core commit, manifest digest, lockfile digest, artifact checksums, SBOM, test evidence, and package-content assertions.
- Use least-privilege trusted publishing where supported; protect tags and prevent version reuse.
- Verify npm, extension, website, and GitHub release surfaces after publication.

### Admin

- Separate deployment identities and secrets by environment, pin dependencies, scan images/builds, and record deploy provenance.
- Restrict production migrations and privileged jobs to reviewed workflows.
- Track deployed contract and policy versions for incident diagnosis.

## Deliverables

- Threat model, provenance format, SBOM policy, secret-rotation plan, protected-environment design, and release verification checklist.

## Reviewer gate

- A release can be traced from registry artifact back to exact commits and checks.
- Public artifacts contain no private keys, development bypasses, test credentials, or unintended source.
- Compromise and rollback drills identify who can act and how quickly.

## Risks and dependencies

- Depends on Steps 02, 03, and 08.
- Private Core checkout credentials are a critical release-chain asset.
