# Visual CI Command Surface — Design

**Status:** Proposed (2026-08-13)
**Scope:** `packages/rn` — CLI surface, visual runner, baseline store, generated CI workflow.
**Design lens:** deep module over the existing `ReferenceStore` + `diffImages` seam.

## Problem

Today visual verification exists in three disconnected places:

1. The **verification phase** (`verificationPhase.ts`) boots a device, deep-links to a
   screen, captures, and diffs against the *runtime* store under
   `.vectalon/artifacts/reference/` — advisory only, run on a developer machine.
2. **MCP tools** (`visual_capture_reference`, `visual_check`) expose the same loop to
   agents on the same runtime store.
3. `vectalon ci` generates a quality workflow (lint/typecheck/test) with **no visual
   job** — nothing runs the loop on a PR.

What is missing is a *command surface* that packages the loop for PR CI:

- **PR-mode:** on a PR, use the *base branch's* baselines, diff the *head* screens,
  post the result back on the PR, and exit with a code a required check can gate on.
- **Baseline management:** baselines must be reviewable and shared across CI runs.
  `.vectalon/` is gitignored by design (runtime state), so the current store can never
  be the CI baseline source.
- **Flake handling:** screenshots are timing-sensitive (animations, fonts, simulator
  boot). Today a single capture either passes or reports; there is no retry, no
  pass-on-second-attempt story, and no way to quarantine a known-flaky screen.

## Goals

- **G1:** `vectalon visual-ci` runs the whole PR loop headlessly — screens → capture →
  diff → classify → report → PR comment → exit code. Deterministic (no model calls),
  safe to run in CI, `--json` for machine consumption.
- **G2:** Committed, reviewable baselines live under `docs/vectalon/visual-baselines/`
  (the same tracked home as workflow documents). New screens are proposed, not silently
  auto-accepted. Re-baselining an intentional change is one command + one commit.
- **G3:** Flaky screens are retried with backoff, reported honestly as flakes, and can
  be quarantined or given per-key tolerance without touching code.
- **G4:** The generated GitHub Actions workflow (`ensureCiConfigs`) gains a `visual`
  job that calls the runner, uploads artifacts, and posts the comment.

**Non-goals:** EAS/Expo visual job in v1 (no headless simulator story there yet);
Android emulator in GitHub Actions v1 (needs `reactivecircus/android-emulator-runner`;
`--platform android` works locally today); a hosted artifact store for baselines (git is
enough); learned auto-quarantine (CI state is ephemeral — see Flake handling); MCP parity
for the new commands (existing MCP tools already cover capture/check on the runtime store).

---

## Design overview

Two flat commands (matching the one-verb-per-command convention of `bundle`, `profile`,
`sync`, `impact`), plus a new deep module behind them:

```
vectalon visual-ci [directory]        # PR-mode runner
vectalon visual-baseline [directory]  # baseline management on the committed store
```

The runner is a **deep module** (`src/visualCi/runner.ts`): retries, classification,
gating policy, and report rendering behind a small options object. It reuses the two
existing utilities untouched:

- `ReferenceStore` — now constructed with a *directory* so the same class serves two
  stores: the runtime store (default `.vectalon/artifacts/reference`) and the committed
  baseline store (`docs/vectalon/visual-baselines`). **Two adapters at the same seam** —
  dev/MCP runtime store and CI baseline store — which is what makes the dir parameter a
  real seam, not indirection.
- `diffImages` / `VisualDiffResult` — in-process, deterministic, already unit-tested.
  The runner adds nothing above it except a composite renderer for PR artifacts.

### Seam map

| Seam | Existing | New |
|---|---|---|
| Baseline storage | `ReferenceStore` (fixed dir) | `ReferenceStore(root, { dir })` — runtime + committed instances |
| Diff engine | `diffImages` (in-process) | used as-is |
| Diff rendering | none | `renderDiffComposite` (pngjs, deterministic) |
| Capture | `DeviceController` | `CaptureDriver` subset — `DeviceController` satisfies it structurally; tests use a fake |
| PR comment | `GitAdapter.commentPullRequest` | `GitAdapter.upsertPullRequestComment(number, marker, body)` |
| Screen selection | `analyzeCrossPackageImpact` (`harness/impact.ts`) | reused: `affectedScreens` + `reRenderScreens` |

---

## Command surface

### `vectalon visual-ci [directory]`

| Flag | Type | Default | Meaning |
|---|---|---|---|
| `--base <ref>` | string | PR base sha from env, else `merge-base` | Ref whose baselines are used. No baselines are ever read from the head. |
| `--screens <list>` | comma list | derived from changed files | Screen keys to check. Explicit list skips impact analysis. |
| `--changed <files>` | comma list | `git diff --name-only base...HEAD` | Changed files for screen derivation. |
| `--platform <type>` | `ios\|android` | `detectDevicePlatform` | Platform to capture on. |
| `--attempts <n>` | number | 3 | Capture attempts per screen. |
| `--settle-ms <n>` | number | 2500 | Base settle wait before capture (jittered). |
| `--verdict <policy>` | `strict\|warn\|report` | `warn` | Gating policy, see Flake handling. |
| `--pr <number>` | number | — | Post the report as a PR comment (upsert by marker). |
| `--out <dir>` | path | `.vectalon/visual-ci` | Run artifacts: report.md, diffs/, pending/. |
| `--json` | flag | — | Machine-readable outcome on stdout; nothing else on stdout. |
| `--dry-run` | flag | — | Describe the plan; device calls go through `DeviceController` dry-run. |

Exit codes: **0** passed / nothing to gate, **1** a gate failed, **2** infra failure
(no device, nothing verifiable). Exit 2 is meant to be *non-blocking* in the workflow
(`continue-on-error`), distinct from a real regression.

### `vectalon visual-baseline [directory]`

| Flag | Type | Meaning |
|---|---|---|
| `--list` | flag | Table of committed baselines: key, platform, capturedAt, quarantine, missing-image flag. |
| `--capture <key> --from <png>` | string + path | Add a baseline. `--platform`, `--note`. Fails if the key exists (use `--update`). |
| `--update <key> --from <png>` | string + path | Replace a baseline image; clears quarantine; `--note` recorded. |
| `--prune [--dry-run]` | flag | Remove baselines whose key matches no screen in the project (safe: manifest-first, then files). |
| `--quarantine <key> --reason <text>` | string + string | Mark quarantined in the manifest (never gates). |
| `--unquarantine <key>` | string | Clear the flag. |
| `--json` | flag | Machine-readable result. |

Mutations write the committed store and print the changed paths (like `sync` prints
what it pushed) so the developer commits them with the PR.

---

## Baseline store

### Storage location and the dir seam

`ReferenceStore` keeps its whole contract; only the constructor changes:

```ts
new ReferenceStore(root)                       // runtime store — .vectalon/artifacts/reference
new ReferenceStore(root, { dir: 'docs/vectalon/visual-baselines' })  // committed store
```

```ts
export function visualBaselineDir(root: string): string {
  return join(root, 'docs', 'vectalon', 'visual-baselines')
}
```

Rationale: `docs/vectalon/` is already the tracked home for team-visible vectalon
outputs (workflow documents, `manifest.json`), so baselines follow the same convention —
reviewable in the PR diff, present in every CI checkout, no new infra. The two stores
share the manifest format, atomic writes, and key validation; the runtime store is
untouched for the verification phase and MCP tools.

### Manifest

`docs/vectalon/visual-baselines/baselines.json` — same shape as the runtime manifest,
with two optional per-key fields the store persists opaquely (the *store* stays dumb;
the *runner* interprets them):

```json
{
  "version": 1,
  "screens": {
    "login-screen": {
      "path": "login-screen-ios.png",
      "platform": "ios",
      "source": "captured 2026-08-10",
      "capturedAt": 1754320000000,
      "quarantine": { "reason": "carousel entrance animation", "since": 1754320000000 },
      "tolerance": { "driftThreshold": 0.05 }
    }
  }
}
```

- `quarantine`: declared, committed flake state. Travels with the baseline across CI
  runs and machines.
- `tolerance`: per-key `VisualDiffOptions` overrides (typically `driftThreshold`),
  merged over CLI defaults at run time. `ReferenceEntry` gains the optional fields.

### Baseline lifecycle

1. **New screen** (no baseline): the runner captures anyway, saves the shot to
   `.vectalon/visual-ci/pending/<key>-<platform>.png`, and the PR comment says
   "no baseline — approve with `vectalon visual-baseline --capture <key> --from
   .vectalon/visual-ci/pending/...`". Never auto-baselined: a broken render must not
   become the expectation silently. (An `--auto-baseline <policy>` follow-up is noted
   below.)
2. **Intentional change** (diff fails): developer verifies, re-baselines with
   `--update`, commits `docs/vectalon/visual-baselines/` in the PR. Merge to main
   carries the baseline; nothing extra runs.
3. **Broken render**: the PR gates (verdict `warn` → exit 1), developer fixes.
4. **Deleted screen**: `visual-baseline --prune` (manual or on main) drops orphan keys.
5. **Follow-ups (explicitly out of v1):** `--auto-baseline pr|main` (runner writes
   proposed baselines into the PR branch / a main-branch reconcile job), prune-on-merge
   in the workflow.

---

## The runner (deep module)

`src/visualCi/runner.ts` — one entry, a small options object, everything else hidden:

```ts
export interface VisualCiOptions {
  store: ReferenceStore                 // committed baseline store
  device: CaptureDriver                 // boot / openUrl / screenshot
  changedFiles: string[]                // screen derivation input
  screens?: string[]                    // explicit override
  platform: DevicePlatform
  attempts: number                      // default 3
  settleMs: number                      // default 2500
  verdict: 'strict' | 'warn' | 'report' // default 'warn'
  outDir: string
  pr?: number
  commenter?: (number: number, body: string) => Promise<void>
}

export type ScreenVerdict =
  | 'pass' | 'flake' | 'fail' | 'quarantined' | 'unverified' | 'no-baseline'

export interface ScreenRun {
  key: string
  verdict: ScreenVerdict
  attempts: Array<{ ok: boolean; diff?: VisualDiffResult; error?: string }>
  diff?: VisualDiffResult              // last attempt's diff
  screenshot?: string                  // last candidate path
  composite?: string                   // rendered diff composite path
}

export interface VisualCiOutcome {
  passed: boolean                      // gating verdict applied
  exitCode: 0 | 1 | 2
  runs: ScreenRun[]
  report: string                       // markdown report
  comment: string                      // PR comment body
}

export async function runVisualCi(options: VisualCiOptions): Promise<VisualCiOutcome>
```

### CaptureDriver seam

```ts
export interface CaptureDriver {
  platform: DevicePlatform
  listDevices(): Promise<DeviceActionResult>
  boot(): Promise<DeviceActionResult>
  openUrl(url: string): Promise<DeviceActionResult>
  screenshot(path: string): Promise<DeviceActionResult>
  defaultScreenshotPath(): string
}
```

`DeviceController` implements all of these already — it satisfies the seam
structurally, no wrapper. Tests inject a fake (canned screenshots / failures), which is
the second adapter that makes this a real seam. Deep-link building reuses
`detectUrlScheme` + `buildDeepLink` from the verification phase.

### Run loop (per screen)

```
resolve keys: explicit --screens, else impact(changedFiles).affectedScreens
              + reRenderScreens, kebab-cased to store keys
for each key:
  baseline = store.get(key)
  if no baseline -> capture once, verdict 'no-baseline', pending shot, never gate
  if baseline.quarantine -> run once, verdict 'quarantined', report info, never gate
  for attempt in 1..attempts:
    openUrl(deepLink); settle(settleMs + jitter(15%))
    screenshot -> outDir/shots/<key>-<n>.png
    diff = diffImages(baseline.path, shot, merge(baseline.tolerance, defaults))
    capture/decode failure -> record infra attempt, backoff, continue
    diff has no error findings -> PASS on this attempt; break
    else record findings; backoff(attempt * 750ms + jitter); retry
  classify from the attempt log (see Flake handling)
```

The candidate is always the **last captured** screenshot; the verdict comes from the
attempt *history*.

---

## Flake handling

Screenshot flakes have three real causes the runner must separate: device timing
(boot/animations mid-state), transient capture failures, and genuine regressions.

1. **Retries with backoff.** Up to `--attempts` captures per screen, each with a
   jittered settle (base `--settle-ms`) so animations land; infra failures get an
   extra backoff (`attempt * 750ms`). A pass on any attempt is a pass — but *recorded
   as flaky* when it took more than one, and surfaced in the comment, never hidden.
2. **Consistency rule.** A *regression* requires the error findings to be stable across
   the failed attempts (same rules, overlapping regions). Varying findings → `flake`,
   reported as warning, not gated under the default policy.
3. **Verdicts.** `pass` | `flake` | `fail` | `quarantined` | `no-baseline` |
   `unverified` (device unavailable, all attempts infra-failed, decode failure).
4. **Gating policy** (`--verdict`):
   - `strict`: fail *and* flake gate; unverified gates.
   - `warn` (default): fail gates; flake and unverified report only.
   - `report`: nothing gates (always exit 0; comment still posted).
   - `quarantined` and `no-baseline` never gate under any policy.
5. **Quarantine.** Declared in the committed manifest (`--quarantine <key> --reason`).
   Quarantined screens still run and report (the diff stays visible so drift doesn't rot
   silently) but never gate. `--update` clears it. No learned auto-quarantine in v1:
   CI state is ephemeral, and a runner cannot write back to `main`; the PR comment
   *suggests* quarantine when a screen fails consistently across runs
   ("failed 3 consecutive runs — consider `vectalon visual-baseline --quarantine` or
   `--update`"), which is the honest mechanism.
6. **Per-key tolerance.** `tolerance` in the manifest raises the bar for known-noisy
   screens (live content, timers) without weakening every screen.

---

## PR packaging

### Report and artifacts

`--out .vectalon/visual-ci` (gitignored, uploaded by the workflow):

```
report.md            # full markdown: per-screen table + findings + actions
diffs/<key>.png      # composite: reference | diff-map | candidate + region boxes
pending/<key>.png    # captured candidates awaiting baseline approval
shots/<key>-<n>.png  # raw captures (kept for debugging)
outcome.json         # VisualCiOutcome (stable for CI tooling)
```

### Diff composite renderer

New `src/utils/visualDiffRender.ts`:

```ts
export function renderDiffComposite(
  referencePath: string,
  candidatePath: string,
  result: VisualDiffResult,
  outPath: string
): string | null   // null on decode failure; never throws
```

pngjs-composed side-by-side (reference, diff map, candidate) with the finding regions
boxed on the candidate. Deterministic and unit-testable with the same tiny-PNG helpers
as `visualDiff.test.ts`.

### PR comment (upsert)

`GitAdapter` gains `upsertPullRequestComment(number, marker, body)`. `LocalGitAdapter`
finds the existing comment containing `<!-- <marker> -->` (issues/comments API, edit via
PATCH) and otherwise POSTs — so repeated pushes update one comment instead of spamming
the thread. `gh` fallback: fresh comment per run when no token (documented limitation).
Console adapter logs; failure is a warning, never a run failure (fork PRs have a
read-only `GITHUB_TOKEN`).

Comment shape:

```
### 🖼 Visual regression — 2 changed · 1 failed · 1 flaky
<!-- vectalon-visual-ci -->
| Screen | Verdict | Diff | Details |
|---|---|---|---|
| login-screen | ❌ fail | 9.1% | visual-drift error; region (20,20,60×60); consistent across 3 attempts |
| settings-screen | ⚠️ flake | 2.4% | passed on attempt 3/3 |
| profile-screen | 🆕 no baseline | — | approve: vectalon visual-baseline --capture profile-screen --from .vectalon/visual-ci/pending/... |

Diff images: workflow artifact `visual-ci` (.vectalon/visual-ci/diffs/).
```

### Generated workflow

`ensureCiConfigs` (GitHub Actions, bare RN CLI) gains a `visual` job; `vectalon ci`
regeneration picks it up. `--base` needs a full checkout (`fetch-depth: 0`):

```yaml
  visual:
    name: Visual regression (iOS)
    runs-on: macos-latest
    needs: quality
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      # setup-node / corepack / install as in the quality job
      - run: npx vectalon@latest visual-ci --pr ${{ github.event.pull_request.number }} --base ${{ github.event.pull_request.base.sha }} --platform ios
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        with:
          name: visual-ci
          path: .vectalon/visual-ci/
        if: always()
    continue-on-error: true
```

`continue-on-error: true` ships the job **advisory-first**: a fresh project has no
baselines and must not block every PR. The runner still exits by its verdict policy, so
teams flip the job to a required check once baselines are adopted. This mirrors the
existing philosophy (Maestro E2E, the verification phase: report, don't gate until
proven).

---

## Alternatives considered

**A. Single flat command with mode flags** (`visual-ci --pr … --baseline capture …`).
Matches `release --submit/--monitor`. Rejected: it mixes two verbs into one flag soup —
the baseline actions (`--baseline capture --key X --from Y`) lose depth, and a CI
runner that can also mutate baselines invites accidental writes in CI.

**B. Subcommand tree** (`visual-ci run|baseline|report`). Clean, but introduces the
first nested subcommands in the CLI, and the baseline verbs are reusable outside the CI
runner anyway. Kept as a fallback if the surface grows.

**C. Two flat commands** (chosen). Each interface stays small; baseline management is
reachable from a laptop or a maintenance workflow without the runner's device/PR
baggage; consistent with every existing command.

---

## Error handling

- The runner never throws past its top-level catch; every screen ends with a verdict.
- Device boot failure → all screens `unverified`, exit 2, report explains how to run
  locally (`--dry-run` always works; `--platform android` works where an emulator
  exists).
- Comment failure (fork, no token, API error) → warn, run outcome unchanged.
- Decode/decode-failure findings from `diffImages` are per-screen `unverified`.
- Baseline mutations keep `ReferenceStore`'s atomic manifest write; `--prune` removes
  manifest entries first, then files whose basename still matches the key (existing
  `remove` semantics).
- No network and no model calls anywhere in the runner — deterministic, CI-safe,
  offline-testable.

## Testing strategy

- **Runner** (`__tests__/visualCi/runner.test.ts`): fake `CaptureDriver` + tiny pngjs
  baselines exercising every verdict — pass, flake-then-pass, consistent fail, varying
  fail (flake), quarantined, no-baseline, infra-fail; each `--verdict` policy's gating;
  tolerance merge; comment body; exit codes; `--dry-run`.
- **Composite renderer** (`__tests__/utils/visualDiffRender.test.ts`): identical →
  no-op composite; regions boxed (assert pixel rows differ from the plain side-by-side);
  decode failure → null.
- **Store seam** (`__tests__/utils/referenceStore.test.ts` extend): committed-dir
  instance reads/writes the same manifest; quarantine + tolerance persist opaquely.
- **Git upsert** (`__tests__/adapters/git.test.ts` extend): mocked fetch — edit when the
  marker comment exists, create otherwise; gh fallback; console.
- **CLI**: flag parsing, `--json` stdout purity, exit codes.
- Full validation: `pnpm typecheck`, `pnpm lint`, `pnpm test` in `packages/rn`.

## Effort

| Workstream | Scope | Est. |
|---|---|---|
| Store seam | `referenceStore.ts` dir param + optional fields | ~30 lines |
| Composite renderer | `visualDiffRender.ts` (new) | ~120 lines |
| Runner | `visualCi/runner.ts` + types (new, deep core) | ~250 lines |
| Commands | `visualCi.ts`, `visualBaseline.ts` (new) | ~150 lines each |
| Git upsert | `git.ts` + `types.ts` | ~80 lines |
| Workflow | `ciTemplates.ts` visual job | ~40 lines |
| Tests | runner, renderer, store, git, CLI | ~350 lines |

## Files touched (expected)

- `src/utils/referenceStore.ts` (dir seam, manifest fields)
- `src/utils/visualDiffRender.ts` (new)
- `src/visualCi/runner.ts`, `src/visualCi/types.ts` (new)
- `src/cli/commands/visualCi.ts`, `src/cli/commands/visualBaseline.ts` (new)
- `src/cli/index.ts` (register both)
- `src/adapters/types.ts`, `src/adapters/git.ts` (upsertPullRequestComment)
- `src/adapters/ciTemplates.ts` (visual job)
- `__tests__/visualCi/runner.test.ts`, `__tests__/utils/visualDiffRender.test.ts` (new);
  `__tests__/utils/referenceStore.test.ts`, `__tests__/adapters/git.test.ts` (extend)

Unchanged by design: `visualDiff.ts`, the verification phase, the MCP tools — they keep
using the runtime store, and the runner adds a second adapter at the same seam rather
than touching them.
