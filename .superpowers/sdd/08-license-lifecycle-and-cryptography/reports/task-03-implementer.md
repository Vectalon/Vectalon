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
