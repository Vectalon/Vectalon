# Step 17 — Qualify Enterprise Security and Governance

## Outcome

Turn enterprise claims—private models, self-hosting, SSO, audit, organization policy, multi-repository intelligence, and air-gapped operation—into scoped, testable offerings or explicitly defer them from GA.

## Product view

Enterprise language creates security and procurement obligations. Each claim needs architecture, operating ownership, deployment evidence, and contractual clarity.

## Planned repository changes

### Core

- Define organization-policy composition, tenant context, audit-event contracts, and model/provider isolation interfaces.
- Add policy provenance, conflict resolution, and signed policy-bundle validation.
- Document cryptographic, network, and data-flow assumptions for private/air-gapped modes.

### Vectalon

- Prove deployment modes enforce data egress constraints rather than merely label them.
- Add organization-policy UX, policy provenance in findings, and safe multi-repository scoping.
- Publish a supported enterprise capability matrix and deployment prerequisites.

### Admin

- Plan SSO/SAML, SCIM if justified, tenant-aware RBAC, enterprise license allocation, policy distribution, audit export, and private deployment operations.
- Add tenant isolation tests and enterprise support/escalation workflows.
- Separate control-plane metadata from customer source and model traffic.

## Deliverables

- Enterprise threat model, capability matrix, deployment reference architectures, control mapping, and defer/ship decisions.

## Reviewer gate

- Every retained enterprise claim has executable evidence and an operating owner.
- Tenant isolation and policy authenticity are tested at every seam.
- Deferred claims are removed from checkout promises and clearly labeled publicly.

## Risks and dependencies

- Depends on Steps 04, 06, 10–13.
- Compliance language requires legal/security review and must not overstate certification.
