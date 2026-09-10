# Task 03 — Vectalon implementation report

## Summary

- Adopted reviewed Core runtime `98aee264a9d9139c058fd11d3e312b384deb2e40` into the private bundled Core build and pinned the release workflow to that reviewed SHA.
- Added a Core-backed RN lifecycle adapter: versioned atomic storage, safe legacy-file migration, recoverable prior-record reads, rejection of unverified replacements, explicit active/grace/stale/revoked UX, and no credential values in status output.
- Extended `vectalon auth` with explicit `--status`, `--recover`, and `--refresh` surfaces while retaining license activation, trial, and logout behavior. `--recover` uses durable local recovery/migration. Online credential forwarding remains intentionally disabled pending explicit approval for transmitting a stored customer credential to a production gateway.
- Added public Admin lifecycle response-contract fixtures and a thin website consumer parser. It does not import or duplicate Admin lifecycle policy.
- Added packed-RN provenance: Core source SHA and the allowed public key ID/algorithm/status/public-key digest, verified in tests and release workflow before publication.

## Files

- `packages/rn/src/auth/licenseLifecycle.ts`
- `packages/rn/src/cli/commands/auth.ts`, `packages/rn/src/cli/index.ts`
- `packages/rn/scripts/bundle-core.js`, `packages/rn/PUBLISHING.md`, `packages/rn/README.md`
- `packages/rn/__tests__/auth/licenseLifecycle.test.ts`, `packages/rn/__tests__/contracts/productDefinition.test.ts`
- `packages/core/dist/**`, `packages/core/core-source-revision.txt`
- `apps/website/lib/lifecycle-contract.ts`, `apps/website/contracts/admin/**`, `apps/website/__tests__/lifecycle-contract.test.ts`
- `.github/workflows/publish.yml`

## Verification

| Check | Outcome |
| --- | --- |
| RN lifecycle + packed artifact tests | 8 passing tests |
| RN typecheck | passed |
| RN lint | 0 errors; 4 existing unused-symbol warnings |
| Website typecheck | passed |
| Website tests | 16 suites, 88 tests passed |
| Website production build | `next build` Turbopack blocked by host port binding; `pnpm exec next build --webpack` passed |
| RN package smoke | `npm pack --dry-run --ignore-scripts` passed; 2,582 files, 2.1 MB tarball |
| Full RN suite | 2,797 passed; 57 failed across 18 suites because this host disallows local server port binds and `sandbox-exec`, plus resulting timeout failures. No lifecycle/provenance failure was reported. |
| Secret scan | No credential material added. Existing matches were negative-test markers and a test-only generated private key. |
| Staged diff | `git diff --cached --check` passed |

## Commit

`8ddebf215be4db4aadd53a0aaa801b9f4f0dddfc` — `feat(auth): add RN license lifecycle adapter`

## Risks and follow-up

- Online refresh/recovery must be completed only after explicit authority to transmit the stored license credential to a named production gateway; do not work around that approval with an arbitrary URL or query parameter.
- The website currently consumes the reviewed public Admin response contract but does not host Admin policy or a private signer. Wire its activation/refresh route to the authenticated Admin gateway after the credential-forwarding decision.
- Re-run the host-restricted RN integration suites in CI or a developer environment that permits loopback ports and `sandbox-exec`.

---

## Reviewer-remediation addendum

- V2 credentials are recognized before policy evaluation. A recognized V2 token cannot fall back to `LicenseValidator` after a lifecycle, issuer, audience, product, offline-lease, key-state, or algorithm failure.
- `currentCustomerLicense()` is now the single product-facing evaluator and backs plan tier resolution, status, doctor, diagnostics alerts, auth recovery, and logout. Legacy files remain migration-only input.
- Recovery independently verifies `license-v2.json.previous` when a structurally valid current record is policy-incompatible, while retaining Core rollback detection. Logout clears both durable lifecycle revisions.
- Release packaging generates a public keyset manifest from the reviewed Core checkout, validates each key digest and non-private PEM, copies it with the packed Core runtime, and consumes it at runtime. The manifest supports active overlap plus retired and compromised keys.
- Added real-RS256 V2 activation/policy/recovery tests, a packed CLI logout test, packed manifest/key-digest checks, and an Admin-shaped success-response fixture replay. Online refresh remains explicitly non-forwarding and never logs credentials.

### Remediation verification

| Check | Outcome |
| --- | --- |
| RN lifecycle + packed artifact tests | 20 passing |
| RN typecheck / build | passed |
| RN lint | 0 errors; 4 pre-existing warnings |
| Website lifecycle fixture test / typecheck | passed |
| Website production build | Turbopack remains host-port blocked; webpack production build passed |
| Pack dry run | passed; 2,583 files, 2,065,997-byte tarball |
| Secret scan + diff check | passed; no private key or credential material in scoped runtime/package files |
| Full RN suite | host-unrelated `featureDevelopment` timeout (local command simulation); lifecycle/provenance focused suites passed |

---

## Online refresh authorization completion

The explicitly authorized online lifecycle path is now enabled.

- RN has one strict customer gateway: its production origin is exactly `https://vectalon.in`; non-production overrides require both an explicit opt-in and an HTTPS origin. It sends the stored credential only in the `Authorization` header to `/api/v1/license/refresh`, has a ten-second bounded timeout, blocks every redirect, and returns finite typed failures without logging a credential or response body.
- `vectalon auth --refresh` loads the durable current/recovered record, refreshes it through that gateway, verifies the candidate before committing it through Core's atomic store, and leaves the current/previous revision untouched when the candidate is rejected. `--recover` retains its local rollback behavior and then attempts the same refresh when a usable local record exists; offline recovery remains usable.
- The website now exposes the authenticated server route `POST /api/v1/license/refresh`. It rejects credentials in request bodies, consumes the approved Admin v1 response parser, and delegates credential validity to the existing durable Admin registry. It does not mint, sign, or expose key material.
- Regression coverage adds gateway allowlist, explicit secure override, header-only forwarding, redirect, timeout, offline, contract/error mapping, redaction, activation/refresh route, durable registry, corrupt/atomic rollback, and revoked/superseded cases.

### Fresh verification

| Check | Outcome |
| --- | --- |
| Focused RN lifecycle/gateway tests | 2 suites, 25 tests passed |
| Website suite | 17 suites, 94 tests passed (`--no-watchman`) |
| RN typecheck and build | passed; reviewed Core bundled |
| RN lint | 0 errors; four pre-existing warnings |
| Website typecheck and webpack production build | passed; route included as dynamic `/api/v1/license/refresh` |
| RN package dry run | passed with isolated cache; 2,587 files, 2.1 MB package / 9.5 MB unpacked |
| Scoped source/package secret and log scan | no new private-key or live-secret match; no gateway credential/body logging path |
| Diff check | passed |

### Residual deployment condition

The website route deliberately uses the configured durable registry that is already deployed with vectalon.in. It does not relay the credential to an arbitrary secondary Admin URL, because the authorization is limited to vectalon.in. Production lifecycle state and signing-key deployment remain owned by the Admin service and its separate deployment controls.

---

## Reviewer-remediation follow-up: local refresh durability

- Added a dedicated online replacement write path. It verifies the replacement against the selected record's trusted clock while supplying the newly observed online time, so a stale offline lease cannot reject a successful refresh. Core's signature, claim, current-time, clock-rollback, and atomic revision checks remain in force before the record is published.
- `--recover` now promotes the verified selected fallback through Core's atomic revision protocol and refreshes that exact record. It no longer reloads and forwards a structurally valid but policy-invalid current credential.
- Regression coverage reproduces stale-lease replacement, preserved clock-rollback rejection, policy-invalid-current recovery, exact credential forwarding, and safe fallback promotion.

### Follow-up verification

| Check | Outcome |
| --- | --- |
| Focused RN lifecycle tests | 25 passing |
| RN typecheck / build | passed |
| RN lint | 0 errors; 4 existing warnings |
| RN package | packed successfully to an isolated temporary directory |
| Diff / scoped secret scan | passed; no private key or credential material added |
| Full RN suite | one unrelated host-sensitive timeout in `__tests__/workflows/featureDevelopment.test.ts`; focused lifecycle tests pass |

### Remaining production adapter blocker

The website's existing configured adapter still projects its legacy `AdminStore` validation/usage APIs and cannot perform the approved Admin lifecycle command. This checkout has no same-process Admin lifecycle service, durable revision/audit repository, or Admin signer authority to invoke. A correct fix requires an explicitly authorized, fixed Admin command boundary; it must not send an operator secret to an arbitrary environment-configured origin or recreate lifecycle policy in the website.

---

## In-process Admin lifecycle adapter completion

- Replaced the legacy `AdminStore` refresh projection with a server-only, pinned Admin lifecycle runtime snapshot. The snapshot is sourced from reviewed Admin commit `79bcfcad1ae323eab0669812d8186a140385e3a9` and contains only the lifecycle domain/service, durable repository, signer/key helpers, and public V1 response schema needed by the website route.
- Added a reproducible sync and drift checker with per-file SHA-256 provenance, plus a CI snapshot workflow. Full source verification rejects any non-approved Admin revision, source/provenance mismatch, or generated-file drift; CI independently verifies the checked-in snapshot digests.
- `POST /api/v1/license/refresh` now reaches the reviewed lifecycle service directly in the website deployment via `DATABASE_URL`, a TLS-verified runtime pool, and deployment-only signing configuration. It does not use an operator secret, perform Admin network egress, or retain the legacy policy projection.
- The customer bearer is cryptographically verified before a durable record lookup. Actor identity, expected revision, idempotency key, and audit fields are derived server-side; the public response remains the approved V1 envelope and strips internal lifecycle material before returning it to the client.

### Adapter verification

| Check | Outcome |
| --- | --- |
| Website tests | 20 suites, 100 tests passed (`--no-watchman`) |
| Website typecheck | passed |
| Admin source + snapshot drift checks | passed against approved Admin SHA |
| Website webpack production build | passed; route included as dynamic `/api/v1/license/refresh` |
| RN typecheck / lint / build | passed; lint has four existing warnings |
| RN package dry run | passed with isolated cache; 2,587 files, 2.1 MB package / 9.5 MB unpacked |
| Secret/client-boundary scan | passed; no private key or operator secret in browser assets or route response path |
| Full RN suite | one unrelated `featureDevelopment` test exceeded its 5-second timeout; no lifecycle adapter test failed |

### Deployment condition

The website deployment must provide `DATABASE_URL`, `VECTALON_LICENSE_PRIVATE_KEY`, `VECTALON_KEY_ID`, and (for non-local PostgreSQL) `VECTALON_LICENSE_DATABASE_SSL_CA`. Key material remains server-only and is neither serialized nor logged.

---

## Final-review blocker remediation

### Final-review follow-up (2026-09-10)

- Core's supported package root now exports `createTrustedClaims`; RN no longer deep-imports a second Core module instance. The packed-artifact regression creates an ephemeral signed RS256 V2 credential and runs a paid gate from an isolated tarball extraction, with no Jest mapping or workspace-Core fallback.
- The public website refresh contract preserves an authenticated, non-retryable terminal lifecycle state. RN accepts only the finite terminal state set, atomically publishes a token-free quarantine marker, then removes current and previous credentials. Every paid gate checks that marker before recovery; retryable transport and service failures continue to retain the bounded offline lease.
- Core verification retains signed, schema-valid lifecycle metadata on a fail-closed result. RN maps it to explicit blocked `auth --status`, `status`, and doctor output for signed suspended/canceled/refunded/revoked/superseded credentials and for expired/stale reasons; no unverified payload is used for status or entitlement.

### Follow-up verification

| Check | Outcome |
| --- | --- |
| RN build/typecheck and focused lifecycle/gateway/gate/package tests | passed, 4 suites / 45 tests |
| Isolated packed V2 gate | passed with an ephemeral RS256 team credential and no Jest mapping/workspace Core resolution |
| Website typecheck and signed-token/production-envelope regressions | passed, 3 suites / 13 tests (`--watchman=false`) |
| RN lint | 0 errors; 4 pre-existing warnings |
| Website Admin snapshot drift check | not run: this isolated checkout lacks the required Admin source input |
| Scoped diff/package secret scan | no private PEM or assigned signing-secret value found |


- Replaced every RN command import of Core's legacy `requireTier()` with the V2-store-backed gate in `licenseLifecycle.ts`. The gate first selects/migrates the atomic V2 record, adapts only a Core-verified claim into Core's entitlement evaluator, and leaves the legacy file as a bounded migration input.
- Introduced one canonical issuer policy at `packages/rn/src/license-policy.json`. Both the website signer default and RN verifier import that same policy; the existing shipped `.dev` issuer remains the default compatibility value.
- Customer refresh idempotency now fingerprints the immutable server-derived bearer/action key before a live optimistic revision can change. The original committed envelope is replayed on a lost-response retry; a distinct action gets a distinct key and is not replayed as refresh.
- The website bearer boundary now calls Core's V2 verifier with the canonical issuer, `vectalon-cli` audience, `rn` product, bounded lease/time policy, and a public-only status-aware key registry. `overlap` keys are verification-active; retired and compromised keys remain terminal Core rejections. Durable `jti`/subject/audience identity and the server-owned revision are checked before a new mutation.
- Both publish jobs install and build the exact frozen private Core checkout before generating key provenance and invoking the RN bundle. The bundler resolves `CORE_REPO_DIR` from the workspace root, preventing package-script cwd drift.

### Final-review verification

| Check | Outcome |
| --- | --- |
| Website tests | 20 suites, 101 tests passed (`--runInBand --watchman=false`) |
| Website typecheck and webpack production build | passed |
| RN lifecycle/gate/release workflow regressions | 27 tests passed; paid V2 gate, refresh replay, canonical issuer/key policy, and frozen-Core build order covered |
| Representative paid CLI command tests | CI and bundle command suites passed against the unified gate seam |
| RN typecheck / build | passed; bundled reviewed Core with `CORE_REPO_DIR=packages/core` |
| RN lint | 0 errors; 4 pre-existing unused-symbol warnings |
| RN package | packed with isolated npm cache: 2,588 files, 2.1 MB / 9.5 MB unpacked |
| Secret scan | source and extracted package: no PEM private-key marker or assigned `VECTALON_LICENSE_PRIVATE_KEY` value |
| Broad selected RN suites | 62 passed; 4 `sandbox`/`render` assertions remain host-blocked because this environment denies `sandbox-exec` (`exit 71`) |
| Diff check | passed |
