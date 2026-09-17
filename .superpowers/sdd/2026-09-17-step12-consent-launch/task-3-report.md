# Task 3 — verified RN 0.22.1 launch patch preparation

Status: DONE_WITH_CONCERNS — verified preparation only; Step 12 launch slice, not completion of all privacy governance. No push, PR, merge, publish, real email, or production customer/license mutation performed.

## Scope and release history

- Bumped only RN package/product manifest to 0.22.1; Core remains 0.11.0 and Admin remains 0.9.0. Core bundled/source revision is d5a380fc1efa68672cbff8cc98e38c89442d6519; the publish workflow independently fetches and freezes Core.
- Updated the RN changelog, public catalog assertion, five marked RN release facts, generated capability inventory/source/extension projections, and three stale telemetry opt-out comments.
- Compared source-closure evidence against freshly fetched origin/main. All 12 implemented closures changed through shared consent/config imports, so bumped their capability patch versions (1.0.2→1.0.3; commercial information 1.2.3→1.2.4). Lifecycle labels are unchanged; no new dependencies, public commands, GA promotions, dropped historical references, or weakened gates.
- New-customer license email, trial activation, React Native SDK bootstrap, TypePrompt default and homepage FAQ use the published scoped package. Docs install/init now explicitly installs @vectalon-dev/rn first, preserving subsequent project-local npx vectalon commands. Existing installed-project/historical examples remain intact.
- A byte comparison against fetched origin/main verified all 224 released passed-evidence references, their catalog metadata and evidence bytes remain identical; every capability lifecycle remains unchanged. Exact agent-created preliminary 0.22.1 evidence files at old capability versions were removed before staging; no released evidence file was deleted or rewritten.

## TDD

Using the test-first skill, added a regression through exported sendLicenseEmail with fetch mocked only at the email-transport boundary. License data is issued to an isolated temporary test store; no real email or customer activation occurs. Changing production back to unscoped npx vectalon would fail the delivered HTML assertion.

`pnpm --filter @vectalon-dev/website test -- --runInBand __tests__/lemon-squeezy.test.ts`

- RED exit 1: 1 failed, 14 passed (expected scoped invocation absent; received unscoped npx vectalon auth).
- GREEN exit 0: 15 passed, 1 suite; 3.349 s.
- Skill reference writing-good-tests.md was unavailable at its specified local relative path; applied the fully read main skill's real-boundary/TDD rules directly.

## Exact final verification commands/results

Working directory is /private/tmp/step09-payments unless stated. Heavy qualification/tests ran with approved local server/macOS native sandbox permissions. Git fallback PATH was used wherever history is required.

`PATH=/private/tmp/vectalon-git-bin:$PATH git fetch origin main:refs/remotes/origin/main`

Exit 0. Actual origin/main resolved to 9d045948ff314de860f6242f9de1f3829372ddfa. Task baseline/HEAD before this commit: 0cee633dc7d27af2fbcff2e8a85a09989d1feb9f.

`pnpm product:generate`

Exit 0, generated product projections. Marked textual facts required five minimal source updates, then product check passed.

`pnpm contracts:generate`

Exit 0, generated pinned Core contract projections (no tracked contract changes required).

`PATH=/private/tmp/vectalon-git-bin:$PATH pnpm capabilities:qualify`

Exit 0 after capability patch bumps and final comments/source changes. Existing qualifiers retain fixture limitations, no lifecycle promotion. Exact workflow commands stored in generated evidence:

- `pnpm --filter @vectalon-dev/rn test -- --runInBand __tests__/cli/index.test.ts __tests__/cli/doctor.test.ts __tests__/diagnostics/health.test.ts`: 3 suites, 42 passed, 2.961 s.
- `pnpm --filter @vectalon-dev/rn test -- --runInBand __tests__/cli/policy.test.ts __tests__/workflows/implementationHarness.test.ts`: 2 suites, 6 passed, 1.692 s.
- `pnpm --filter @vectalon-dev/rn test -- --runInBand __tests__/workflows/implementationHarness.test.ts`: 1 suite, 3 passed, 1.567 s.
- `pnpm --filter @vectalon-dev/rn test -- --runInBand __tests__/cli/feature.test.ts`: 1 suite, 12 passed, 2.204 s.

Final rerun after remaining website bootstrap text changes exit 0 and reused unchanged immutable passed records, refreshed source inventory/projections.

`pnpm --filter @vectalon-dev/rn build`

Exit 0 after final qualification/projections. Bundled Core into RN dist. Build completed before full coverage and packed CLI/provenance checks.

`PATH=/private/tmp/vectalon-git-bin:$PATH pnpm product:check`

Exit 0, product manifest consistent (initial pre-fact-update run failed with five stale marked facts, all fixed).

`pnpm contracts:check`

Exit 0, pinned Core projections current.

`PATH=/private/tmp/vectalon-git-bin:$PATH node scripts/capability-catalog.mjs check . --base origin/main`

Exit 0, capability freeze and evidence verified against actual fetched main. Public registration counts unchanged: CLI 94, MCP 73, API 356, extension 14 and handlers 15; qualified default counts unchanged.

`pnpm product:test`

Exit 0: 12 passed, 0 failed, 251.074 ms (product/contract tests).

`PATH=/private/tmp/vectalon-git-bin:$PATH pnpm capabilities:test`

Exit 0: 22 passed, 0 failed, 53.614 s. Includes registration/ownership/evidence/promotion tamper rejection and packaged extension fail-closed behavior.

From packages/rn:

`PATH=/private/tmp/vectalon-git-bin:$PATH npm run test:coverage -- --runInBand > /private/tmp/step09-payments/.superpowers/sdd/2026-09-17-step12-consent-launch/task-3-rn-coverage-final.log 2>&1`

Exit 0: 311 suites passed, 2906 tests passed, 1 skipped, 0 failed; 210.087 s. Coverage gates met: statements 85.33% (threshold 84), branches 72.39% (71), functions 89.81% (87), lines 87.88% (85). No threshold or existing test weakened.

`VECTALON_ADMIN_SOURCE=/private/tmp/admin-step10 PATH=/private/tmp/vectalon-git-bin:$PATH pnpm --filter @vectalon-dev/website test -- --runInBand > .superpowers/sdd/2026-09-17-step12-consent-launch/task-3-website.log 2>&1`

Exit 0: 31 suites, 131 passed, 0 failed; 14.364 s, pinned Admin source used.

`pnpm --filter @vectalon-dev/rn typecheck && pnpm --filter @vectalon-dev/rn lint && pnpm --filter @vectalon-dev/website typecheck`

Exit 0 for all three. RN lint 0 errors, 4 preexisting unused-variable warnings in ghApp tests, salesDemo and fixBench runner; no task-owned warning. Both type checks clean.

`PATH=/private/tmp/vectalon-git-bin:$PATH pnpm --filter @vectalon-dev/rn test -- --runInBand __tests__/contracts/productDefinition.test.ts __tests__/capabilities/availability.test.ts __tests__/diagnostics/consent.test.ts __tests__/knowledge/telemetry > .superpowers/sdd/2026-09-17-step12-consent-launch/task-3-packed-focused.log 2>&1`

Exit 0: 7 suites, 55 passed; 16.161 s. Includes actual npm-pack/extract isolated consumer, bundled Core/public key provenance, future-major fail-closed contract, logout safety, final catalog version, telemetry consent and unchanged local crash-export ingestion.

From packages/rn, dry-run package content safety check:

```sh
npm_config_cache=/private/tmp/vectalon-step12-pack-cache node -e 'const cp=require("child_process"),fs=require("fs");const p=JSON.parse(cp.execFileSync("npm",["pack","--dry-run","--json","--ignore-scripts"],{encoding:"utf8"}))[0];const blocked=p.files.filter(f=>/(^|\/)(\.env(?:\.|$)|\.vectalon(?:\/|$)|\.superpowers(?:\/|$)|coverage(?:\/|$)|node_modules\/\.cache(?:\/|$))|private[-_]?key/i.test(f.path)||(/\.(pem|key)$/.test(f.path)&&fs.readFileSync(f.path,"utf8").includes("PRIVATE KEY")));if(p.name!=="@vectalon-dev/rn"||p.version!=="0.22.1"||blocked.length)throw Error(JSON.stringify({name:p.name,version:p.version,blocked})); console.log(JSON.stringify({name:p.name,version:p.version,fileCount:p.files.length,size:p.size,bundled:p.bundled,blocked:blocked.length}));'
```

Exit 0: @vectalon-dev/rn 0.22.1, 2594 files, 2084722 bytes, blocked files 0. RN vendor Core is independently verified by the existing packed regression.

`node packages/rn/bin/rn-vectalon.js --version`

Exit 0, 0.22.1.

`PATH=/private/tmp/vectalon-git-bin:$PATH git diff --check`

Exit 0.

## Non-product execution failures / limitations

- Initial `pnpm --filter @vectalon-dev/rn test:coverage -- --runInBand` forwarded an extra -- to Jest, matched no tests and exited 1. Corrected to the existing npm coverage script with proper forwarding; no coverage threshold/test weakening.
- First package dry-run failed because default npm cache is outside write scope; used isolated /private/tmp/vectalon-step12-pack-cache without changing cache ownership. First candidate safety regex erroneously matched shipped production coverage command filenames; corrected directory boundary matching and reran, without changing package contents.
- Test fixture warning/error output intentionally exercises failure paths; no claim of native production toolchain qualification or provider quality. No live activation/registry publishing performed; controller must review, run release CI and verify published npm 0.22.1.
- This is consent/launch preparation, not payload sanitization, retention/deletion/DSAR, certification, or whole-roadmap Step 12 completion. Core/Admin implementation and customer state unchanged.

## Self-review

Inspected all hand-written changes and generated catalog/history diffs. Email test asserts actual delivered command through the public seam and cleans mock/store in finally; production email remains the existing transport and does not alter signing/issuance. New-customer bootstraps do not depend on unavailable unscoped npm resolution. Local npx examples only follow explicit package installation in the changed docs. Historical 0.22.0/older facts/evidence/changelog retained. Source closures have final consent code/comments before qualification; all final evidence hashes pass the executable gate, without weakening release checks.

Implementation commit: 12dc1fec9a554d2d9347c370b51c7f340c63fd8d (`fix(release): prepare verified RN 0.22.1 consent launch patch`). The report is committed separately so it can include the immutable implementation SHA.
