# Step 12 — Privacy, Telemetry, and Data Governance

## Outcome

Make telemetry demonstrably privacy-preserving, consent-aware, schema-controlled, and operationally useful. Customer source, prompts, secrets, file contents, and raw paths must never enter generic telemetry.

## Product view

Trust is part of Vectalon's local/private value proposition. Observability must prove product health without undermining that promise.

## Planned repository changes

### Core

- Own a minimal telemetry event contract, redaction/classification rules, consent policy, queue limits, and failure behavior.
- Make telemetry opt-in/opt-out state inspectable and ensure telemetry can never block product execution.
- Add adversarial redaction tests for secrets, source fragments, paths, prompts, and identifiers.

### Vectalon

- Inventory every emitted event and map it to a documented purpose and retention period.
- Provide CLI transparency, export/delete controls, endpoint pinning/configuration, bounded offline queues, and safe support-bundle separation.
- Ensure website analytics and RN telemetry use distinct consent and data classifications.

### Admin

- Enforce least-privilege access, retention/deletion jobs, aggregation thresholds, and audit for telemetry access.
- Display operational aggregates rather than raw customer activity wherever possible.
- Implement data-subject export/deletion workflows spanning identity, commercial, and telemetry stores.

## Deliverables

- Data inventory, classification matrix, privacy threat model, retention schedule, consent UX spec, and deletion runbook.

## Reviewer gate

- Automated tests demonstrate prohibited data cannot pass the telemetry seam.
- Privacy documentation matches actual payloads and defaults.
- Deletion and consent changes propagate across all stores within a defined SLA.

## Risks and dependencies

- Depends on Steps 03 and 11.
- Support diagnostics must not become an ungoverned telemetry backdoor.

## Implementation sequence

1. **Inventory every data flow.** Enumerate CLI/RN telemetry, website analytics, Admin audit, payment webhooks, OAuth, support bundles, logs, traces, crash reports, backups, and third-party processors. Record fields, purpose, owner, consent/legal basis, region, retention, access, and deletion behavior.
2. **Classify and minimise.** Define public, operational, customer-confidential, personal, authentication, financial, source-code, and secret classes. Generic telemetry rejects source, prompts, file contents, raw paths, tokens, emails, stable device fingerprints, and arbitrary exception payloads.
3. **Define separate contracts.** Core owns a bounded product-telemetry envelope and redaction rules. Website analytics, Admin audit, payment events, and opt-in support bundles remain distinct schemas/policies; they cannot be tunneled through a generic event field.
4. **Implement consent and transparency.** Vectalon defaults match public promises, provides inspectable status, explicit opt-in/out, local queue visibility, export/delete controls, endpoint documentation, and no dark patterns. Consent changes affect future collection immediately.
5. **Enforce at collection and ingestion.** Allowlisted fields, size/cardinality budgets, secret scanners, path/source detectors, bounded queues, TLS, authentication, tenant isolation, and fail-open-for-product/fail-closed-for-collection behavior apply at both ends.
6. **Govern Admin access and retention.** Least-privilege aggregate views, audited raw access exceptions, automated retention/deletion, data-subject export/delete orchestration, backup tombstone strategy, and processor inventory are production requirements.
7. **Red-team support diagnostics.** Treat bundles as deliberate customer uploads with preview, explicit scope, one-time authorization, short retention, malware/secret scanning, and a separate access trail.

## Promise reconciliation

- Public copy currently says “telemetry is opt-in and errors-only”; retain it only if payload inventory and default behavior prove both claims across shipped packages.
- “Your source never leaves your machine” must cover model providers, telemetry, support, logs, crash reporting, and future cloud sync, with clearly disclosed opt-in exceptions.
- Define measurable deletion and consent-propagation SLAs before publishing them; legal/privacy review is required for global launch.

## Required evidence

- Machine-readable data inventory and field allowlists tied to schemas and retention jobs.
- Adversarial property/fuzz tests with secrets, code fragments, paths, prompts, PII, oversized payloads, nested objects, and encoding tricks.
- Network-capture tests of a clean install, opted-in session, opted-out session, crash, and support upload.
- End-to-end export/deletion drill across primary stores, telemetry, support, and backups, with audited exceptions.
- Reviewer compares actual packets/storage/access logs against privacy copy and rejects any undocumented field or processor.

## Exit and rollback

Exit requires demonstrated data minimisation and deletion/consent propagation. If a prohibited-data path is found, collection is remotely disabled or ingestion rejected while the product remains functional.

## Non-goals

- Capturing raw customer activity for speculative analytics.
- Treating security audit events as optional telemetry.
