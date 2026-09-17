# Step 12 slice — safe optional usage telemetry

RN0.22.1 is merged and publicly available. Recovery operations remain owner-deferred, not complete. This slice addresses Core's legacy UsageReporter; it does not claim raw RN diagnostics, support uploads, retention or deletion are governed.

Choose strict purpose allowlisting over free-text redaction (cannot reliably identify secrets/source) or disabling every optional operational count (unnecessary). The existing RN caller emits telemetry_ingest for product rn with filesScanned, eventsIngested, crashes, traces and analytics counts. Only that event/product and finite integer counts from0 through1000000000 are permitted. Unknown events/products/features are not collected. Unknown metadata fields are omitted; arbitrary strings/objects never reach storage or network.

Core owns this projection and immediately effective legacy consent: every track/flush rechecks explicit opt-in. No hostname/username-derived fingerprint; keep the legacy event shape with deviceId=redacted and a random reporter-session identifier, never a machine identifier. Re-project old queued events before network upload without silently deleting the queue on opt-out. Queue is bounded to50, persists the triggering event before an automatic flush, and all configuration/filesystem/network failures are nonblocking. Existing public methods/types and cross-language contract schemas remain compatible.

Vectalon consumes the reviewed Core release later and verifies the real RN ingestion seam; raw error/heartbeat minimisation is a following slice, not covered by this Core-only patch. Admin has no implementation change in this slice; audited retention/export/deletion remains open. Existing licenses/subscriptions/customer data are unchanged; no production writes or paid upgrades.

Tests use real isolated temporary config/queue files and mock only fetch. Prove runtime opt-out after construction, malicious metadata and poisoned legacy queues, nonidentifying fields, bounds, triggering-event preservation, malformed files and failed writes/fetch. Review and merge Core before updating/releasing its RN consumer.
