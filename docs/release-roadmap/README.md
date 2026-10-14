# Vectalon: step-by-step product and launch plan

Goal: a sellable **React Native beta** that delivers its published capabilities to a real customer. iOS, Android, Flutter, and other language SDKs remain separate future products; do not imply they are available now. This checklist replaces the old per-step release plans. A green unit test or a merged PR is not proof of a working purchase or launch.

Core owns reusable contracts, entitlement policy, and harness primitives. Vectalon owns the RN package, adapters, website, checkout/webhook ingress, and deployed `vectalon.in/admin` routes. Admin owns canonical lifecycle/operator policy, migrations, trials, and private projections; the website executes an explicitly pinned copy of that server-only source in-process. Do not create a second writer or duplicate admin deployment.

## Current state — audited 2026-10-14

**Decision: not yet proven ready for a public paid launch.** There is substantial implemented product, but implementation, capability qualification, published artifacts, and customer evidence are different things.

- Published RN: `0.22.4`, inspected archive still bundles Core `e4a92ed`. All three local repos are on main, with reviewed local changes ahead of the remote baseline. Core main is `7762e8d`; website production was verified ready at Vectalon `c5e4196`. New local fixes are not yet published or deployed.
- Core has an unrelated local `package.json` change; Admin has an untracked `.freebuff/` directory. Preserve these. This checklist does not approve or publish them.
- Capability catalog: **4 beta, 8 experimental, 6 planned, no available capabilities**. Beta groups cover inspection, policy checks, generated-file repair, and feature workflow. Their limited fixture/scripted evidence is not proof of reliable autonomous generation. Knowledge, model generation, device workflows, upgrades, evaluation, and distribution remain experimental.
- The CLI registers 94 commands. The demo matrix is command/fixture evidence, not proof that ten fully installed native apps build, run, and pass their own tests.
- The last user-supplied local-model result failed: 94% guardrails and 37% adherence. Subsequent repair-loop source changes have not established a new passing hardware result in this audit. Do not replace missing evidence with the green deterministic smoke count.
- Follow-up navigation inference remained inconsistent: one run reached 100% adherence but only 96% guardrails; a repeat omitted a required screen and scored 0% adherence. Neither passes the unchanged gate. The full 43-scenario run was interrupted without a final report; it is incomplete evidence.
- Benchmark hardening rejects local/WASM/router fallback echoes before parsing generated files. Nine human reference scenarios omit required paths; model-backed comparisons now disclose those omissions and withhold relative scores instead of treating incomplete references as a valid denominator. References themselves still need repair and independent review.
- Verification for the fallback/reference batch: 66 affected RN suites, 671 tests passed with loopback-enabled fixtures; TypeScript build and targeted lint passed. This is regression evidence, not native-app or paid-customer acceptance.
- Corrected README fine-tuning/`train` promises and public install commands: use the published `@vectalon-dev/rn` package explicitly; the unscoped `vectalon` package returned 404. Fresh scoped npm execution printed `0.22.4`; native-app onboarding remains unverified.
- Admin README still names RN `0.19.2`/Core `0.9.1`. Check its pinned compatibility artifacts before calling those merely stale prose.
- Correction to earlier checkout diagnosis: `newGrantDecision` was not a checkout gate in committed Vectalon HEAD. The proposed gate/qualification loosening was removed. Existing checkout behavior and valid grants remain unchanged; this is not proof of launch qualification.

Source anchors: [catalog](../../packages/rn/src/capabilities/catalog.json), [CLI registration](../../packages/rn/src/cli/index.ts), [model benchmark](../../packages/rn/src/bench/modelGenerate.ts), [RN README](../../packages/rn/README.md), [product manifest](../../product-manifest.json). Admin README and architecture documents now describe the pinned in-process ownership boundary.

## What we sell, and what we do not

Brand: **Adaptive AI harness for developers.** Initial supported SDK scope: React Native/Expo. Additional languages are a roadmap, not included working SDKs.

Proposed first audience: individual RN/Expo developers and small teams with existing apps, inconsistent agent output, and project-specific conventions. The value to demonstrate is less time gathering context, fewer convention violations, and reviewable engineering output—not another model or a guarantee of correct code.

The first customer journey is: install the published CLI, inspect an existing app, load approved project context, execute one supported workflow, review changes and diagnostics, and run the app's checks. Demonstrate why Vectalon improves the same task over the same model without Vectalon. Report time, accepted changes, failures, and resource cost; do not invent improvement percentages.

Free, Individual, and Team must each have a tested value proposition. Current manifest prices are $0, $19/developer/month, and $49/developer/month respectively; these are source values, not verified Lemon Squeezy configuration. Free describes 1–3 seats, Individual one seat, Team at least two. Finalize the exact public grant and seat interpretation against runtime behavior and checkout configuration. Experimental Team knowledge features must not be sold as qualified beta benefits. If a paid tier has no qualified differentiating outcome, hold that offer or narrow it explicitly; do not silently bundle future promises.

## Project knowledge and model adaptation

### What exists today

| Mechanism | Observed implementation | Honest boundary |
|---|---|---|
| Project-aware inference | Local, WASM, and remote providers enrich system prompts with skills, memory, and ecosystem intelligence | Changes context, not model weights; prove each public workflow supplies the intended project root |
| Knowledge retrieval | `KnowledgeIndex` supports lexical ranking, optional embeddings, project/team filters, and provenance; Brain parses decisions and Git-derived expertise | Retrieval and deterministic answers are not training; filters are not a substitute for authorization |
| Dataset preparation | `dataset` scans JSONL for format, duplicates, length, balance, and heuristic PII patterns; export script creates examples from benchmark references | Missing/empty/unreadable inputs now require attention; still not a complete private-repo curation service or proof of data safety |
| LoRA readiness | `lora` checks config, dataset existence, model identity, parameters, and estimated VRAM | Does not run a trainer, calibrate hardware, produce an adapter, convert weights, or deploy a model |
| `train` | Read-only release planning across repositories | Not ML training; README options and pipeline promises corrected |

Relevant source: [providers](../../packages/rn/src/model/providers), [knowledge index](../../packages/rn/src/knowledge/KnowledgeIndex.ts), [memory](../../packages/rn/src/memory), [dataset](../../packages/rn/src/dataset/index.ts), [LoRA readiness](../../packages/rn/src/lora/index.ts), [dataset exporter](../../packages/rn/scripts/export-bench-dataset.js).

### How Vectalon should help a client product

Use context/retrieval first for changing facts: architecture decisions, approved APIs, package versions, product requirements, naming conventions, and runbooks. Use deterministic checks for enforceable rules. Consider fine-tuning only for repeated behavior that still fails after context and prompting—for example, a stable code style or structured response format. Fine-tuning is not a reliable database for changing product facts and does not guarantee rule compliance.

Do not promise **“train any model.”** Inference-provider support does not imply training support. A future training integration must name supported base models, licenses, trainer versions, hardware, adapter formats, and serving backends. Hosted models require a provider-supported training API; local adapters require compatible architectures and runtimes.

Minimum end-to-end adaptation acceptance, not a new prerequisite to sell an honestly scoped RN beta:

1. Obtain explicit project/data permission; record source revision, allowed paths, ownership, tenant, retention, and local/remote processing policy. Exclude secrets and customer data by default.
2. Build reviewable knowledge from approved docs, source, tests, and accepted changes. Attach source locations, freshness, conflicting-rule precedence, and deletion behavior. Treat repository text as untrusted data, not authority to override system rules.
3. Prove retrieval on held-out project questions, including unknown answers, stale facts, denied sources, and cross-project isolation. Show citations and context/token budgets.
4. Compare the same model with no project context, approved context, and retrieval. Preserve model version, settings, dataset hashes, failures, latency, and cost.
5. If fine-tuning is justified, curate human-approved instruction/output examples. Split by repository/task family before augmentation; deduplicate across splits. Never evaluate a trained model against the same benchmark references exported for its training.
6. Run one reproducible supported training integration with budget/cancel/resume controls, immutable data/model lineage, and artifact integrity. This trainer execution is missing from the audited RN CLI.
7. Evaluate base versus adapted model on unseen tasks, native compile/tests, policy violations, privacy leakage, and regressions. Count timeouts, empty responses, and parse errors as failures; report first attempt separately from repair-assisted results.
8. Promote a versioned compatible model/adapter only after review. Validate runtime loading, resource limits, explicit fallback, per-project selection, and rollback. Deleting a source document does not erase trained weights; retirement/retraining needs a separate policy.

**Core:** portable context/provenance, rule, evaluation, provider and artifact contracts. **Vectalon:** RN extraction, context wiring, client CLI, supported trainer integration if added, evaluation/demo reports and truthful website. **Admin:** authorized customer/project access and audit/retention controls where centrally stored; no automatic collection or training on customer repositories. Additional SDK adapters must qualify independently.

## Execution plan

This is the single execution plan and checklist. The dated audit above is the starting snapshot, not a permanent description of the product. The detailed gates below supply the coverage requirements for these steps; do not maintain a second completion ledger.

**What “best product” means:** a developer reaches a useful verified result quickly; project knowledge improves output; unsafe actions are blocked; failures are understandable and recoverable; paid benefits work as advertised. Measure these outcomes before expanding the command list. No plan can guarantee market leadership or bug-free software.

### Working rules

- Execute in the order below unless an explicit dependency permits otherwise. Each numbered step is a work package; complete its inspect, repair, and verify passes in small tested changes. Split large implementation diffs by user workflow, without creating another roadmap.
- Use the existing helpers, contracts, tests, and report formats. Before editing, identify affected callers, exports, fixtures, generated projections, configuration, and docs. Add regression coverage for discovered defects.
- Preserve unrelated local changes, existing subscriptions, and valid licenses. Inspect current `main` and working-tree differences before merging. Never rewrite production data merely to make a test pass.
- A step is complete only with evidence on the final candidate revision. Record `status`, affected repo SHAs, command/environment, result/report link, blocker, and next action under its checkbox. Use `pending`, `in-progress`, `blocked`, or `verified`; skipped is never passed.
- Finish safe independent work when a step is blocked, but do not pass its dependent release gate. Credential access, real spending, customer outreach, production data changes, and other external actions still require appropriate authorization.
- Checkpoints mean review and tests, not a package release. Batch into the release milestones below; retain the urgent security/data-loss/access outage exception.

### Phase A — Establish product truth

- [x] **Step 1 — Capture a reproducible baseline.**
  - **Do:** inventory all three repos, unfinished changes, release pins, package scripts, CI status, npm artifacts, deployment identities, and environment-variable names without reading secrets into reports. Run existing baseline checks and distinguish pre-existing failures.
  - **Repos:** Core: source/contracts/build identity. Vectalon: RN artifact, bundled Core, website deployment. Admin: compatibility and trial-operation revisions.
  - **Done when:** one baseline evidence record ties source, build, registry, and deployment together; every mismatch has an owner and next action. No dirty work is lost.
  - **Depends on:** none. **Verify:** compare source versions/hashes with packed and deployed artifacts; save baseline test outcomes.
  - **Status (2026-10-12): verified baseline, not release approval.** All three checkouts now track their fetched remote main with zero ahead/behind commits: Vectalon `c5e4196`, Core `7762e8d`, Admin `88cf692`. The initial observations below are retained as history; the follow-up supersedes their branch/dependency status. Known product failures remain open for the dependent steps, rather than being hidden by regenerating evidence.

  **Main reconciliation and verification follow-up:**

  - Vectalon fast-forwarded 19 commits; only upstream benchmark reports changed. All 13 existing tracked modifications remain preserved. Core was already current; its unrelated `package.json` edit remains preserved.
  - Admin's old `ebc498e` commit is patch-equivalent to merged PR #10 (`git cherry` confirmed). Switched to main and fast-forwarded to `88cf692`; retained the old branch and `.freebuff/`. Pruned only five stale registrations for non-existent temporary worktrees, including the deleted worktree holding main; no existing files or branches were deleted.
  - Restored Admin dependencies from `package-lock.json` using `npm ci --ignore-scripts`. Admin contracts, typecheck, lint, and production build pass. Tests: **109 pass, 0 fail, 1 skipped**; the skipped test needs a live PostgreSQL database and remains a later integration gate. The first sandbox run failed on tsx IPC permissions; the authorized rerun passed.
  - Core source build and RN bundle build pass. Website production Webpack build passes. Website Admin snapshot check passes with `VECTALON_ADMIN_SOURCE` set to the updated Admin checkout.
  - Updated Admin main contains license lifecycle, commercial ledger, and operator control-plane modules missing from the previous local branch. Step 2 must reconcile implementation and generated website snapshots with stale ownership prose; do not infer ownership solely from the Admin README.
  - No publish, deployment, production migration, credential change, or remote push occurred. Working-tree product changes remain uncommitted and unqualified. Capability evidence drift, the failed leaderboard lane, clean published-package execution, and live customer journeys remain open in their respective gates.

  **Baseline evidence, 2026-10-12:**

  | Surface | Observed identity/result | Owner and next action |
  |---|---|---|
  | Vectalon checkout | Local `main` at `bea4da42518780b0d3e73d89b57e434f35a88103`; 13 tracked modified files including this plan | Vectalon: preserve changes and reconcile remote main before integration |
  | Remote main / production | Remote main `c5e4196d7b6b99cab436f74a826958ee06eb1ea9`; Vercel production `dpl_AC82BwyPX1Gm7m2SXrWM6NVtwVvc` is READY at the same SHA, with `vectalon.in` alias | Vectalon: production identity verified, customer behavior not yet tested |
  | Published RN | npm latest `0.22.4`; downloaded archive SHA-1 `e7d273a6dbb6047ffb834e0a72b3434548a51531`; bundled Core revision `e4a92ed2f969ce68b33c5707cf66e09e1be196fb` | Vectalon/Core: published pin differs from pending local `7762e8d`; compare changes before next release |
  | Core checkout / CI | Local `main` at `7762e8d6565019e7877cfd6c640e9887e5905215`, unrelated `package.json` modification preserved; CI success for this SHA | Core: baseline **611 tests / 25 suites pass**, typecheck passes; build identity still to check |
  | Admin checkout / remote | Local `codex/step07-identity-trial-integrity` at `ebc498ea3ccfdab9029198cbeafe70c3b812cacf`; remote `Vectalon/admin` main `88cf692ae725ba5293d39a5782e566185d9af832` has successful CI; `.freebuff/` preserved | Admin: compare branch ancestry and content before returning to main; do not assume local tests describe remote main |
  | Manifest / contracts | Product consistency passes; product tests **12/12 pass**; Vectalon Core projections pass with `CORE_REPO_DIR=../core`; Admin contract snapshots pass | All repos: retain as baseline only, not customer proof |
  | RN / website focused tests | RN billing **11/11 pass**, RN typecheck passes; website checkout/grant tests **11/11 pass** | Vectalon: these test the dirty working tree, not the production deployment |
  | Capability qualification | **FAIL:** frozen inventory differs; stale inputs include `modelGenerate.ts`, `capability-availability.ts`, and `commercial-checkout.ts` | Vectalon: review ownership and source changes, then requalify through real evidence in steps 3/6/9 |
  | Admin local tests | **Not run:** `tsx` missing; local `tsc` also missing | Admin: install from the existing lockfile, rerun tests/typecheck; contract checks alone do not close this gap |
  | Recent Vectalon CI | Nightly Smoke succeeds at `c5e4196d`; recent nightly leaderboard fails at `ef6fe0f47c3083a70c58c707ad2a559b4be99245` | Vectalon: inspect failed run and scope; a successful smoke does not supersede model evidence |
  | Production configuration metadata | 17 production keys returned, including DB, operator DB, signing, webhook, Resend and Individual checkout/variant keys; no Team checkout/variant keys returned | Vectalon: verify Team offer configuration in step 10. Presence is not validity. Values were neither decrypted nor recorded |

  Network reads initially failed in the sandbox and succeeded with authorized network access. Published archive was inspected without running package scripts; a clean installed CLI run is still pending. Baseline test invocation uses `pnpm --filter <package> exec jest --runInBand ...` to avoid pnpm consuming Jest flags. No credentials, subscriptions, releases, deployments, branches, or pre-existing changes were modified during this baseline pass.

- [ ] **Step 2 — Define the supported offer and ownership.**
  - **Progress (2026-10-13):** reconciled Admin ownership/dependency/data-flow docs with the pinned in-process website implementation. Corrected RN training claims and CLI options; labelled experimental Individual/Team workflows explicitly in the manifest, generated plans, README and pricing copy. Removed the earlier uncommitted checkout-policy relaxation instead of treating Free/beta outcomes as paid Team qualification. Existing checkout semantics and valid grants are unchanged. Remaining: complete the entry-point/benefit evidence matrix and qualify a distinct outcome per paid offer.
  - **Do:** choose the beta workflows customers can rely on, supported RN/Expo environments, privacy boundaries, and Free/Individual/Team benefits. Separate existing behavior, experimental options, and future promises. Resolve the conflicting commercial ownership documents using actual service behavior.
  - **Repos:** Core: entitlement contract. Vectalon: product manifest, catalog, public copy. Admin: current authoritative trial/operational boundary.
  - **Done when:** each advertised benefit has an implementing path, a lifecycle label, a responsible repo, and a planned acceptance test. No paid benefit relies only on roadmap text.
  - **Depends on:** 1. **Verify:** trace every pricing benefit to code and evidence; record unsupported claims for removal or implementation.

- [ ] **Step 3 — Make tier and capability enforcement consistent.**
  - **Do:** build the command/entry-point/plan/capability matrix; repair differences across CLI, interactive actions, MCP, APIs, and admin grants. Review pending checkout qualification changes explicitly. Preserve grandfathered valid access.
  - **Repos:** Core: shared allow/deny rules. Vectalon: callers and checkout gates. Admin: signed trial/grant projections and compatibility tests.
  - **Done when:** table-driven tests cover each public path for Free, Individual, Team, expired/invalid licenses, seat boundaries, experimental opt-in, and scoped administrator access. Unknown paid products cannot silently grant capabilities.
  - **Depends on:** 2. **Verify:** positive and negative entitlement tests plus `product:check`, `product:test`, `contracts:check`, and `capabilities:check` in the relevant repos.

**Checkpoint A:** review steps 1–3 together. No public offer or tier claim remains untraceable. Keep sales claims narrow while outcomes remain unproven.

### Phase B — Make the core developer journey excellent

- [ ] **Step 4 — Prove fresh install and first useful result.**
  - **Progress (2026-10-13):** npm returns 404 for the documented unscoped `vectalon` package. Corrected public docs, website, CLI hints and generated onboarding/templates to `npx --package @vectalon-dev/rn vectalon`; added a regression check across those surfaces. Published `0.22.4` reports its version successfully from a fresh temporary directory with dependency lifecycle scripts disabled. This proves package resolution/startup, not native installation or a useful app workflow. Product tests: 13 pass; affected adapter/onboarding tests: 146 pass.
  - **Do:** install the packed candidate into clean and existing RN/Expo apps; test onboarding, inspection, doctor output, configuration, missing dependencies, offline startup, and actionable recovery messages.
  - **Repos:** Core: configuration/error contracts if implicated. Vectalon: package contents, CLI onboarding, quickstart. Admin: no changes unless trial activation blocks the journey.
  - **Done when:** a person unfamiliar with the implementation completes a supported deterministic workflow using only published instructions. Record time-to-first-result and every manual intervention.
  - **Depends on:** 3. **Verify:** fresh-directory packed-install test; compare instructions and actual `--help`; ensure no source-workspace dependency is required.

- [ ] **Step 5 — Prove project knowledge reaches the model safely.**
  - **Concrete fix (2026-10-13):** native `LocalProvider` discarded `request.context` while fallback/remote paths included it. Native inference now receives it, with context-present/absent boundary regressions. This fixes transport of supplied context, not retrieval authorization or completeness.
  - **Do:** trace approved source/docs/decisions through extraction, memory, retrieval, and final model context. Exercise project-root propagation, citations, stale/conflicting facts, exclusions, context limits, and local/remote processing choices.
  - **Repos:** Core: portable context/provenance boundaries. Vectalon: RN knowledge, memory, providers and call sites. Admin: access/audit only for centrally stored information.
  - **Done when:** supported workflows answer held-out project questions with traceable context; denied sources and other projects cannot leak; missing knowledge produces an honest uncertainty response.
  - **Depends on:** 4. **Verify:** focused context/retrieval tests plus an inspected prompt trace with secrets redacted. Compare identical tasks with and without approved context.

- [ ] **Step 6 — Make evaluation trustworthy before tuning models.**
  - **Inspectable source (2026-10-13):** source checkout supports `bench --json --include-generated`; each run can include final `generatedArtifacts` without exposing human reference source. Default reports still omit generated source. README/site reference mark the option unreleased; it is not in npm `0.22.4`. 195 benchmark/CLI registration tests, build and targeted lint pass. Source export is not an attempt history; first/repair separation remains open.
  - **Release consistency:** reviewed public-surface ownership, bumped changed capability evidence versions, and reran the actual fixture qualification workflows. Capability freeze/evidence checks and all 22 tamper/extension tests pass. Lifecycle counts remain 4 beta / 8 experimental / 6 planned. The first qualification attempt hit sandbox loopback `EPERM`; the permitted rerun passed. These are fixture proofs, not model or customer qualification.
  - **Further fixes (2026-10-13):** required-file omissions score zero adherence for both generated output and human references. Models receive fixtures and task requirements without reference repairs; repair selection rejects new guardrail violations. Reports identify missing files, failed rules and unscored axes. Benchmark/model/CLI tests: 308 passed; build and targeted lint passed. Remaining: disjoint evaluation sets, first-attempt versus repair-assisted reporting, complete reference validation, and live correctness.
  - **Early defect fixes (2026-10-13):** custom/model generation with no non-empty output now scores zero rather than disappearing from averages; live fixture tests cannot award correctness to an empty generation. Removed exact reference replacements from initial model context and rubric repair feedback. Added regressions; 150 benchmark/CLI tests, typecheck and targeted lint pass. Dataset evidence also no longer approves missing/empty/unreadable inputs (35 dataset/dashboard tests pass; local commit `4a71a48`). Remaining: disjoint evaluation sets, first-attempt versus repair-assisted reporting, output completeness, and a new real-model run. These fixes do not close this step or qualify a model.
  - **Do:** separate development, training, and held-out evaluation data. Remove reference-answer leakage from independent evaluation; count empty/malformed/timeout output as failure; report first-attempt and repair-assisted results separately.
  - **Repos:** Core: shared result semantics if used. Vectalon: benchmark/export/scoring/smoke reports. Admin: no implementation change expected.
  - **Done when:** deliberately broken, empty, leaked-reference, and stub responses cannot generate misleading green evidence. Reports show denominators, skips, model identity and configuration.
  - **Depends on:** 5. **Verify:** scorer regression tests and reproducible held-out baseline; preserve the existing guardrail/adherence thresholds.

**Checkpoint B:** install, project context, and evaluation evidence are trustworthy. Do not optimize against misleading scores.

- [ ] **Step 7 — Fix real-model failures and safe execution.**
  - **Repeatability blocker (2026-10-13):** a subsequent identical navigation lane with source export scored 96% guardrails / 0% adherence because `SettingsDetailScreen.tsx` was absent. Retained output also contains unresolved screen identifiers and a placeholder deep-link handler. The earlier 100% adherence sample is not repeatable proof. Source report: `/private/tmp/vectalon-navigation-source-2026-10-13.json`; no generated code executed.
  - **Filesystem boundary (2026-10-13):** custom benchmark fixture/expected/fix paths now require normalized portable relative paths. Direct live-run callers also validate fixture/generated paths before materialization; partial temp-project writes are cleaned up on failure. 175 benchmark/CLI tests pass, including traversal/absolute/Windows/control-character refusals and cleanup. The model parser already filtered unsafe paths, but custom packs and direct generators needed their own boundary. This does not isolate process execution: `bench --live`/`--install` must use reviewed inputs in a disposable credential-free environment until a verified isolation lane exists. Core/Admin runtime unchanged.
  - **Follow-up (2026-10-13):** shared implementation prompts no longer override explicit module paths with request-derived names. The deprecated-API check distinguishes React Native's removed Navigator from valid React Navigation stack components, retaining native import/alias/require regressions. Latest focused navigation run returns both required files, 100% adherence and 96% guardrails; correctness remains unscored. It still fails the 100% guardrail threshold and does not qualify other scenarios. Report: `/private/tmp/vectalon-navigation-guardrail-origin-2026-10-13.json`. Deterministic baseline comparisons retain their rubric-only scope on both sides and now label that limitation; they are not task-completeness evidence. Verification: 474 benchmark/model/workflow tests before the guardrail correction; 219 guardrail/benchmark/harness tests after it, plus build and targeted lint.
  - **Focused real-model evidence (2026-10-13):** `--model local --preset fast --suite navigation`, installed `qwen2.5-coder-1.5b`: before completeness checks, 94.44% guardrails with adherence unscored; after context/provider fixes, 92% guardrails and 0% adherence (required files absent). No `--live`, so correctness is unscored. Reference also lacks required files and now scores zero adherence. Reports retained in `/private/tmp/vectalon-navigation-{quality,context,native-context}-2026-10-13.json`; temporary local artifacts, not durable release evidence. This lane remains failed, not launch-qualified.
  - **Progress (2026-10-13):** real inference selftest passes using installed `qwen2.5-coder-1.5b` (not a stub). This is only a basic-response check. Full RN run: 293 suites passed and 18 failed under sandbox restrictions; rerunning those 18 suites with required permissions passed all 120 tests. A direct render probe reproduced `sandbox_apply: Operation not permitted`. Retain both runs; native simulator/device and full model quality remain unverified. Website suite: 132 pass, one skipped.
  - **Do:** reproduce local failures on supported hardware; classify context, provider, parsing, generation, and policy failures. Repair root causes with bounded retries and explicit fallback. Exercise adversarial repo instructions, unsafe writes, cancellation, and change review.
  - **Repos:** Core: portable safety/provider behavior. Vectalon: model routing, RN workflows, file application, reports. Admin: only relevant access controls.
  - **Done when:** each advertised model/hardware lane meets its declared gate, including 100% tested guardrails and ≥80% adherence where required, and generated changes pass applicable app checks. Unsupported lanes remain explicitly unsupported.
  - **Depends on:** 6. **Verify:** real inference with retained redacted outputs; native compile/tests for claimed workflows; verify a fallback or deterministic stub never masquerades as model success.

- [ ] **Step 8 — Build the ten-app validation laboratory.**
  - **Do:** create or complete ten runnable apps with pinned dependencies and distinct configurations: minimal Expo; Expo Router; navigation/state; forms/validation; network/cache; persistence/offline; bare RN/native modules; animation/gestures; monorepo/shared packages; upgrade/legacy compatibility. Choose concrete supported versions during setup.
  - **Repos:** Core: reusable test contracts only. Vectalon: apps, command runner, reports and demo instructions. Admin: safe entitlement fixtures, not production customer records.
  - **Done when:** each app installs and runs on its declared platform; commands are classified as applicable/not applicable with reasons. Reports organize app, command, tier, model, output/diff, duration, test/build result, and failure reproduction.
  - **Depends on:** 4 and 6; model lanes require 7. **Verify:** execute real commands, not only help. Clearly distinguish static fixtures, simulator/emulator runs, physical-device checks, and untested platforms.

- [ ] **Step 9 — Deliver and qualify each paid outcome.**
  - **Do:** demonstrate one complete useful workflow for every advertised paid differentiator, including Team knowledge/sync/policies if sold. Verify repeat use, multiple users, denied access, conflicts and recovery. Fix or remove unqualified claims.
  - **Repos:** Core: enforcement and shared semantics. Vectalon: RN workflows, catalog qualification and public benefit descriptions. Admin: matching trial/access projections.
  - **Done when:** every sold benefit has real-app evidence beyond fixture qualification; no experimental outcome is renamed beta merely to pass checkout. Regenerate evidence only from reviewed source.
  - **Depends on:** 3, 7, 8. **Verify:** compare the benefit matrix from step 2 against app reports and actual capability status.

**Checkpoint C:** RN product evidence is sufficient for the exact offer. A paid tier without a demonstrated differentiator stays off sale or has its offer narrowed transparently.

### Phase C — Make paying and operating dependable

- [ ] **Step 10 — Verify checkout through license delivery.**
  - **Do:** compare provider products/variants, currency, intervals, seats and trial configuration with the manifest. Test checkout, signed webhook, durable order, license issuance, email and activation in provider test mode.
  - **Repos:** Core: signed claims and decisions. Vectalon: commercial service, email, website and CLI activation. Admin: verified trial compatibility.
  - **Done when:** every sold variant yields exactly the intended access and a recoverable delivery outcome. Unknown products and unverified Team quantities enter manual review.
  - **Depends on:** 3; offer sign-off requires 9. **Verify:** trace a test order across all stages without logging credentials or full license keys.

- [ ] **Step 11 — Verify the entire subscription lifecycle.**
  - **Do:** test renewals, seat changes, upgrades/downgrades, cancellation, refunds, payment failures, offline/grace periods and license refresh. Inject duplicate, delayed, concurrent and out-of-order events; exercise reconciliation and retries.
  - **Repos:** Core: lifecycle policy. Vectalon: authoritative paid state/webhooks/refresh. Admin: operational projections and interventions where implemented.
  - **Done when:** no double issuance, accidental permanent access loss, cross-customer grant, or unexplained payment/license mismatch remains. Existing valid licenses retain their contractual behavior.
  - **Depends on:** 10. **Verify:** state-transition integration tests against isolated durable storage, including failure/retry scenarios.

- [ ] **Step 12 — Verify secure operator and support workflows.**
  - **Do:** test GitHub login, operator allowlisting/roles, adding/removing admins, session expiry/revocation, scoped SDK grants and audited manual-review resolution at `vectalon.in/admin`.
  - **Repos:** Core: verification contracts. Vectalon: deployed admin UI/routes. Admin: authoritative trial operations and private projections.
  - **Done when:** permitted operators can resolve a test incident; denied/revoked users cannot; all sensitive actions have attribution without a universal entitlement bypass.
  - **Depends on:** 10–11. **Verify:** permission-matrix tests and browser-level allowed/denied journeys. Do not deploy a second public admin application.

**Checkpoint D:** purchase, continued access, and support work as one system, including failure paths.

- [ ] **Step 13 — Close security and privacy launch risks.**
  - **Do:** verify credential rotation status, dependency findings, authorization, rate limits, signature validation, file/path boundaries, tenant isolation and remote-data consent. Exercise support preview/redaction, retention, export/deletion and diagnostic upload controls.
  - **Repos:** Core: trust-boundary primitives. Vectalon: CLI, APIs, provider/telemetry flows. Admin: operator/support data controls.
  - **Done when:** no unresolved critical security or data-loss issue exists; other findings have explicit severity and disposition. Unverified optional upload paths are disabled. Reports contain no secrets/private code.
  - **Depends on:** 5, 7, 12. **Verify:** threat-oriented regression tests and authorized security checks; verify data deletion behavior rather than relying only on privacy copy.

- [ ] **Step 14 — Prove recovery and operational visibility.**
  - **Do:** back up/export and restore commercial/operator records into isolation; exercise migration failures, unavailable DB/email/model providers and reconciliation. Set alerts and rehearse package/site rollback and checkout pause.
  - **Repos:** Core: compatible storage/claim contracts. Vectalon: paid-service recovery, degraded responses, monitoring. Admin: trial/operator recovery and incident operations.
  - **Done when:** restored records preserve invariants; an injected incident alerts the owner; recovery has measured time and data-loss bounds. Free-tier infrastructure is acceptable only with demonstrated recovery.
  - **Depends on:** 11–13. **Verify:** isolated restore drill, alert receipt, and rollback rehearsal without deleting real orders or weakening valid licenses.

- [ ] **Step 15 — Make all customer surfaces accurate and usable.**
  - **Do:** reconcile website, root/RN READMEs, CLI help, package metadata, pricing, setup, command reports, supported platforms, limits, model costs, cancellation/refund/support and privacy/license explanations. Remove nonexistent training flags and unsupported Enterprise offers.
  - **Repos:** Core: public contract descriptions. Vectalon: all public surfaces and docs checks. Admin: compatibility/support descriptions.
  - **Done when:** a new user can discover a supported outcome, install, use it, understand results and obtain help without unpublished instructions. Keyboard/mobile/error-state checks pass.
  - **Depends on:** 9, 12–14. **Verify:** command/help-to-doc comparison, link checks, accessibility checks and a fresh-user walkthrough. Obtain appropriate review for legal/tax claims rather than treating tests as legal approval.

**Checkpoint E:** security, recovery and customer communications match the actual product. These are required before taking paying customers, not post-launch cleanup.

### Phase D — Ship one coherent beta

- [ ] **Step 16 — Freeze and verify the release candidate.**
  - **Do:** review and integrate intended changes on main across all repos; pin reviewed Core/contracts, build in a clean environment, inspect package contents and rerun final regression/real-app lanes. Define the rollback artifacts and release owner.
  - **Repos:** Core: reproducible release artifact. Vectalon: bundled Core, RN candidate and website. Admin: compatible contracts and deployment inputs.
  - **Done when:** steps 1–15 and detailed launch coverage are satisfied for the same candidate; a new source change invalidates affected evidence and triggers rechecks.
  - **Depends on:** 15 and all preceding launch gates. **Verify:** full relevant test/typecheck/build suites, packed installation, compatibility hashes, qualification evidence and rollback rehearsal.

- [ ] **Step 17 — Publish the consolidated beta and verify delivery.**
  - **Do:** publish only the packages requiring release; deploy compatible website/operator changes; install the public npm artifact from a fresh directory and compare deployed behavior to the candidate.
  - **Repos:** Core: publish only if needed. Vectalon: RN/npm and website. Admin: compatible private operational artifacts only; no public admin redeployment by default.
  - **Done when:** registry version, Core identity, CLI behavior, production health and operator login match the reviewed candidate. Broader promotion remains paused.
  - **Depends on:** 16 and required publication authorization. **Verify:** registry installation and production smoke checks; use an authorized live purchase canary rather than assuming test-mode success proves live fulfillment.

- [ ] **Step 18 — Run a small customer canary and launch campaign.**
  - **Do:** recruit an opted-in design-partner cohort; observe install, context, useful output, verification, purchase/access and support. Record individual failures for at least the proposed 48-hour canary; fix and repeat before expanding outreach.
  - **Repos:** Core: defect fixes only as required. Vectalon: onboarding/demo, consented outcome reporting and customer fixes. Admin: incident and fulfillment monitoring.
  - **Done when:** every observed activation/purchase is accounted for, no critical issue remains, and customers demonstrate the promised outcome. Publish a truthful demo and expand appropriate RN/Expo outreach only after this evidence exists.
  - **Depends on:** 17. **Verify:** owner reviews canary evidence; pause new sales immediately for misissuance, unrecoverable fulfillment, secret exposure or data loss. Never invent testimonials or benefit percentages.

**Release milestone R1:** steps 16–18 comprise one consolidated sellable-beta rollout, not three routine package releases. Critical fixes may use the urgent-patch exception.

### Phase E — Improve from actual usage, then expand

- [ ] **Step 19 — Measure product value and fix the biggest friction.**
  - **Do:** review activation, time-to-first-result, accepted/rejected output, task completion, repeat use, latency/resource cost, support burden and refunds. Compare the same model/tasks with and without Vectalon; prioritize the highest-impact observed failure rather than adding commands.
  - **Repos:** Core: measured shared bottlenecks. Vectalon: workflow usability/performance and consented metrics. Admin: aggregate commercial/support trends.
  - **Done when:** each improvement has before/after evidence without safety regressions; unsupported quantitative marketing claims remain unpublished. Review after the first week and continue at a sustainable cadence.
  - **Depends on:** 18. **Verify:** reproducible task comparisons plus customer feedback; do not interpret tiny samples as statistically proven gains.

- [ ] **Step 20 — Qualify GA for the existing product.**
  - **Do:** review sustained reliability, repeat customer success, incident response, recovery, accessibility, performance and legal/commercial readiness. Fix recurring failures and publish supported-version/deprecation policy.
  - **Repos:** Core: stable compatible contracts. Vectalon: qualified RN experience and support policy. Admin: reliable commercial/trial operations.
  - **Done when:** the owner has defined and observed an adequate reliability window and accepted the GA evidence; no required lane is waived because its tooling is inconvenient. A calendar deadline alone cannot close this step.
  - **Depends on:** 19 and continued steps 11–16 regression coverage. **Verify:** customer outcome/reliability review and repeat recovery drill.

**Release milestone R2:** one substantial GA/quality release once evidence warrants it. Fine-tuning and new SDKs are not automatic GA requirements.

- [ ] **Step 21 — Decide whether actual fine-tuning solves a measured need.**
  - **Do:** use failed held-out tasks to compare improved context/retrieval against adaptation. Select one supported model/trainer/runtime only if residual behavior and customer demand justify it; establish data permission and cost limits.
  - **Repos:** Core: portable model/artifact contracts if necessary. Vectalon: experiment, dataset preparation and proposed UX. Admin: consent/access records only if centrally managed.
  - **Done when:** there is an explicit go/no-go with measurable success criteria, supported compatibility and data rights. If context already solves the problem, defer training and record why.
  - **Depends on:** 6 and 19; must not delay R1. **Verify:** disjoint evaluation data and base/context/adaptation comparison design before training.

- [ ] **Step 22 — Deliver one complete, qualified adaptation integration.**
  - **Do:** only after step 21 approves it, implement the minimum data-curation, training, cancellation/budget, artifact-loading, evaluation and rollback path described in the adaptation section above. Separate training, test data and customer tenants.
  - **Repos:** Core: shared lineage/provider/artifact validation. Vectalon: supported trainer integration and RN evaluation/serving. Admin: authorization/retention for centrally stored data, if any.
  - **Done when:** a real supported model is trained, loaded and improves unseen target tasks without unacceptable regression; resource costs, limitations and deletion/retraining policy are disclosed. No “train any model” claim.
  - **Depends on:** approved 21. **Verify:** reproducible training run, held-out app builds/tests, safety/privacy evaluation, artifact integrity and rollback. Complete as small vertical implementation slices, not one large unreviewed change.

- [ ] **Step 23 — Expand SDKs only through the same product contract.**
  - **Do:** choose one next SDK from demonstrated customer demand. Reuse Core contracts and implement language/platform-specific extraction, tools, guardrails and evaluation without leaking RN assumptions into Core.
  - **Repos:** Core: genuinely portable shared contracts. Vectalon: adapter package, docs/site and supported workflows. Admin: explicit product grants and compatibility projections.
  - **Done when:** the new SDK independently passes install, useful workflow, entitlement, privacy, evaluation, recovery and customer-canary checks. Do not grant or advertise it merely because a product ID exists.
  - **Depends on:** 20 and a justified demand decision; independent of optional training. **Verify:** rerun the applicable steps 2–18 for that SDK.

**Release milestone R3+:** separate substantial adaptation or SDK releases when their own evidence passes. Keep existing customer compatibility and honest product scope throughout.

### Verification commands available today

Use the current repo's pinned package manager and inspect scripts again before execution. These are baseline checks, not substitutes for native/model/payment evidence. They are listed here, not executed by this planning change.

From Vectalon:

```sh
pnpm product:check
pnpm product:test
pnpm contracts:check
pnpm capabilities:check
pnpm capabilities:test
pnpm --filter @vectalon-dev/rn typecheck
pnpm --filter @vectalon-dev/rn test -- --runInBand
pnpm --filter @vectalon-dev/rn build
pnpm --filter @vectalon-dev/website test -- --runInBand
pnpm --filter @vectalon-dev/website typecheck
pnpm --filter @vectalon-dev/website build
```

In Admin, run its `contracts:check`, `test`, `typecheck`, `lint`, and `build` scripts. In Core, inspect its current scripts and run the actual source repo's test/typecheck/build lanes; do not substitute the stale ignored wrapper source in Vectalon. Run focused tests per change and full affected suites at checkpoints. Publish/deploy commands are intentionally not automatic validation commands.

## Detailed go-to-market coverage

Bhishak owns the release decision. Each checked item needs an artifact or report with date, repository SHA, package version, environment, reviewer, and result. Mark skipped or blocked lanes explicitly; unchecked means unproven, not necessarily unimplemented.

### Gate 1 — Freeze the offer and resolve contradictions

- [ ] Review the pending tier/checkout changes against actual `requireTier`, feature, capability, and seat enforcement. Build one command-to-plan-to-lifecycle matrix from registration and runtime behavior; cover CLI, interactive actions, MCP, and direct APIs. Test denial as well as allowance.
- [ ] Define the paid beta purchase policy without weakening capability validation. Preserve valid existing grants; verify unknown variants, unsupported products, and unverified Team quantities require review.
- [ ] Align manifest, catalog, root/RN READMEs, website pricing/docs, CLI help, and admin projections. Remove unsupported training options, universal-model claims, unlimited assurances, and experimental-as-beta descriptions. Explain model/API costs and hardware requirements separately from subscription price.
- [ ] Reconcile current ownership across all three repos. Retain one authoritative writer per commercial record; no speculative service migration is required for launch.

### Gate 2 — Prove the promised engineering outcomes

- [ ] Run the packed candidate in ten reproducible, installed RN/Expo apps with deliberately different SDK versions, navigation, state, styling, native modules, and build modes. Record the supported platform/version matrix. Keep fixture smoke evidence separate.
- [ ] Exercise each advertised command meaningfully, not only `--help`. Record prerequisites, license tier, invocation, exit code, outputs, diffs, model/provider, time, and app test/build result in an organized report. Justify every skip.
- [ ] Include clean install, existing app, monorepo, paths with spaces, missing dependencies, invalid config, offline behavior, denied tier, and failed provider. Verify a stub/fallback cannot appear as successful model inference.
- [ ] Re-run real local-model evaluation on supported hardware. Preserve the existing 100% guardrails and ≥80% adherence gate, but first fix optimistic scoring: missing outputs must fail, held-out tests must stay private, and exact reference repairs must not leak into independent evaluation prompts. Report repair-assisted scores separately.
- [ ] Verify actual generated changes with TypeScript, app tests, and native builds where promised. Add adversarial repo/context instructions and unsafe-operation attempts. Guardrail scores measure the tested rules, not a security guarantee.
- [ ] Demonstrate project-context value with a before/after comparison using identical tasks and models. Show conflicting and stale knowledge handling. Do not require unfinished fine-tuning to pass an inference-only beta.

### Gate 3 — Prove purchase, fulfillment, and continued access

- [ ] Verify live Lemon Squeezy product/variant IDs, prices, currency, billing period, seats, trial behavior, and approved store state against the manifest. Record evidence without secrets; account configuration alone is not end-to-end proof.
- [ ] Exercise checkout, signature validation, durable order, correct license, email delivery, activation, refresh, offline/grace behavior, renewal, upgrade/downgrade, cancellation, failed payment, and refund. Use provider test mode first; perform an authorized live canary before public sales.
- [ ] Test duplicate, delayed, invalid-signature, out-of-order, and concurrent webhook events; retry failed delivery without double issuance. Verify reconciliation and audited manual-review resolution.
- [ ] Verify Individual/Team seat boundaries and administrator SDK grants without global bypasses. Test admin login, denied users, adding/removing operators, role boundaries, session expiry, and audit trails through `vectalon.in/admin`.

### Gate 4 — Secure and operate the product

- [ ] Verify production configuration presence and secret rotation status without printing values. Previously pasted credentials require rotation verification, not reuse as documentation.
- [ ] Verify authentication, authorization, rate limits, signature checks, dependency findings, unsafe file writes, and remote-content boundaries. Exercise failure behavior when DB/email/provider services are unavailable.
- [ ] Complete consent, upload preview/redaction, data isolation, retention, export/deletion, and support access tests. Disable unverified optional uploads. Record which inference/embedding providers receive code.
- [ ] Restore commercial and operator data into an isolated environment and verify invariants. A free-tier backup/export approach is acceptable if demonstrated; the deferred paid hosting upgrade is not a recovery exemption.
- [ ] Set an owner, alert route, and response procedure for checkout failures, webhook lag, missing delivery, license mismatches, service errors, and DB saturation. Verify one alert reaches the owner. Never log raw keys, private code, or unnecessary identity data.

### Gate 5 — Prepare acquisition and onboarding

- [ ] Publish a short truthful demo on a representative existing app: install, context, useful command, output review, app verification. Label staged fixtures and experimental features. Provide a separate limitations section.
- [ ] Align landing page, pricing, install quickstart, sample app, support contact, cancellation/refund instructions, privacy/terms and license explanations. Confirm no unsupported custom Enterprise offer remains in the payment-provider sales journey.
- [ ] Check mobile layout, keyboard navigation, form errors, checkout return/status, broken links, page performance, and recovery from failed install. Test onboarding with someone who did not build the product.
- [ ] Recruit a small opted-in RN/Expo design-partner cohort. Start with direct outreach and RN/Expo communities where promotion is allowed; do not launch a broad campaign before their results exist.
- [ ] Define activation as a fresh user completing one verified useful workflow. Track install-to-activation, time-to-first-result, accepted output, repeat use, trial-to-paid, support burden, and refunds using consented minimal data. Establish a baseline before publishing numeric benefit claims.

### Gate 6 — One consolidated release and controlled launch

- [ ] Review all three repos together; pin the reviewed Core artifact and compatible Admin contracts. Verify clean reproducible builds and package contents. Do not rebuild the tracked Core bundle from stale ignored wrapper sources.
- [ ] Run relevant unit/integration/security checks, packed-CLI workflows, website build, and production-shaped commercial tests. Retain evidence alongside the exact release identifiers; passing an earlier revision is insufficient.
- [ ] Prepare rollback: previous website deployment, prior known-good package installation instructions, checkout pause, and forward-safe DB recovery. Preserve orders and valid licenses; never delete transactions as a rollback shortcut.
- [ ] Publish only the consolidated milestone, then verify npm installation, bundled Core identity, website deployment, checkout status, and operator access. Do not claim a local version equals the registry release.
- [ ] Run an internal canary followed by a small external cohort. Proposed minimum: observe 48 hours and review every activation/purchase because low volume makes aggregate percentages misleading. Hold for unexplained failures; immediately pause new sales for license misissuance, data loss, secret exposure, or payment without recoverable fulfillment.
- [ ] Expand promotion only after canary findings are resolved and repeated successfully. Review customer outcomes after the first week. GA and supported training integrations require separate evidence, not merely more commands.

## Next action and audit boundary

Next: **Step 2**. Use the reconciled main baseline, inspect the current Admin lifecycle implementation and website snapshots, and settle the supported offer before changing tier gates. Preserve unfinished changes and record evidence and blockers here.

This planning change modifies only this document. It does not run the planned test suites, native builds, real inference, live checkout, production recovery, or registry/deployment verification. Earlier local test/build successes do not close the candidate release gates.

## Releases

- [ ] **Next consolidated release — sellable RN beta.** Batch the major-item fixes above; review all three repos together. Merge and deploy tested changes as needed, but publish a new RN/Core version only when the customer journey and release gates are green. Verify the npm artifact, live website, and rollback after publication.
- [ ] **Later GA release.** Require sustained canary evidence, demonstrated commercial recovery, governed support data, security/accessibility/performance checks, legal and tax review of claims, and an incident response/rollback drill. Enterprise features and additional SDKs need their own qualification; they are not implicit GA promises.
Urgent patch exception: release outside the batch only for a security issue, data-loss risk, broken checkout/access, or another critical customer outage, with focused regression and rollback checks.

No release per roadmap item. The `[publish-rn]` marker is reserved for the consolidated milestone or urgent patch; ordinary docs and feature PRs must not trigger package publication. Keep this single numbered execution plan current instead of creating separate per-step plans or speculative specs.
