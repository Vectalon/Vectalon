# B-Roll Shot List — "Vectalon: Your Daily Loop"

Production companion to [`VIDEO_SCRIPT.md`](VIDEO_SCRIPT.md). Each clip below
is a **pre-captured screen recording** used in the video; nothing in this list
should be recorded live during narration.

**Capture conventions (apply to every clip):**

- **Canvas:** 1920×1080; record at the terminal's full window width so command
  text stays legible when cropped for a chyron.
- **Terminal:** dark theme, 18pt+ monospace font, visible cursor, no
  scrollback clutter — `clear` between commands, run each command in a fresh
  pane where noted.
- **Time:** run every command with `time` or your editor's timer and log the
  wall-clock duration in the clip's notes; the editor uses those numbers to
  pick the speed-up factor.
- **Naming:** `broll/01-init.mp4`, `broll/02-selftest.mp4`, etc.

---

## Clip 1 — `init` (video section 3, 1:00–2:30)

| Field | Value |
|---|---|
| Shot ID | **BR-1** |
| Clip length | ~2 min real, ~45 s in cut |
| Location | Scratch Expo project (or bare RN CLI) with `package.json` visible |

### Commands (in order, one pane)

```bash
npm install -D @vectalon-dev/rn
npx vectalon init
```

> Optional second take for the "choose a provider" beat:
> `npx vectalon init --model openai`

### Expected output (annotate the beats)

```
⠋ Scanning project...
✔ Detected: Expo SDK 53 (managed)
⠋ Building context snapshot...
✔ Wrote .vectalon/snapshot.json
✔ Wrote .vectalon/context.md
✔ Wrote .vectalon/memory.json
✔ Wrote .vectalon/rn-vectalon.json (flavor: expo)
⠋ Enabling ecosystem items...
✔ Enabled expo-mcp, expo-router, expo-ui, expo-doctor
✔ Added .vectalon/ to .gitignore
✔ Project initialized in <dir>
```

**Capture notes**

1. Open the file explorer beside the terminal (split screen): highlight
   `.vectalon/` and expand `snapshot.json`, `context.md`, `memory.json`.
2. Then switch to the project's `.gitignore` and point at the `.vectalon/`
   entry (this is the "auto-gitignored" beat).
3. Keep the `npm install` line on screen long enough for a chyron read.
4. **Region:** full terminal window + explorer sidebar (60/40 split).

**Must-show beats:** flavor detection line, the `.vectalon/` file tree, the
`.gitignore` entry.

---

## Clip 2 — `doctor` + `selftest` (video section 4, 2:30–4:00)

| Field | Value |
|---|---|
| Shot ID | **BR-2** |
| Clip length | ~3 min real (doctor ~30 s, selftest ~2 min), ~60 s in cut |
| Location | Same project as Clip 1 |

### Commands (left pane: doctor; right pane: selftest)

```bash
npx vectalon doctor
npx vectalon doctor --fix      # (optional beat: a MISSING check flips to OK)
```

```bash
npx vectalon selftest          # right pane — let it run to completion
npx vectalon selftest --list   # (optional beat: show the check inventory)
```

### Expected output — doctor

```
✔ Ecosystem: 6/6 items OK
✔ Node >= 20.12.0 (v22.x)            OK
✔ JDK 17+                            OK
✔ Android SDK (ANDROID_HOME)         OK
✔ Xcode + CocoaPods (macOS)          OK
✔ Metro port 8081                    OK
⚠ OPENAI_API_KEY not set — remote providers unavailable
✔ Nightly leaderboard prerequisites  OK
```

### Expected output — selftest

Live progress lines stream as checks finish (clack-style spinner in TTY, then
final statuses):

```
⠋ selftest: running 42 checks (cli, sdlc, guardrails, knowledge, harness, model, mcp, workflows, ecosystem, bench, adapters, memory, upgrade, perf, sandbox, render, diagnostics)
✔ cli-commands              cli                      512ms
✔ sdlc-release-planner      sdlc                     98ms
✔ guardrails-rules          guardrails               41ms
✔ model-inference           model                    1.2s   (real inference)
...
✔ 42/42 checks passed — report: .vectalon/selftest/report.html
```

**Capture notes**

1. Record `doctor` first; for the `--fix` beat, pre-break one check (e.g. stop
   a helper tool) so the flip is real, then restore it.
2. Record `selftest` in the right pane **without narration** — it's the
   longest clip; keep the final summary + `report.html` on screen for 5 s.
3. Open the HTML dashboard (`npx vectalon selftest --open`) as a separate
   quick clip: per-check cards, green statuses, expandable activity traces.
4. **Region:** split screen (doctor left / selftest right), then full-screen
   dashboard for the last 5 s.

**Must-show beats:** a status line flipping `⚠` → `✔` (doctor --fix), the live
stream of check results, the final `42/42` summary, the HTML dashboard.

---

## Clip 3 — `feature` workflow (video section 6, 4:30–8:30)

| Field | Value |
|---|---|
| Shot ID | **BR-3** |
| Clip length | 10–15 min real (fast-forwarded to ~2 min), or stitched from phase clips |
| Location | Scratch app with `.vectalon/` initialized; clean git branch |

### Command

```bash
npx vectalon feature "create a login screen with email + password and hook it to the auth API" --heal-interactive
```

> Optional beats: re-run with `--dry-run` for the preview beat, and
> `--ticket MOB-123 --push` for the ticket-to-PR beat (in a repo with a
> configured PM adapter or the deterministic stub).

### Expected output (annotate the phase markers)

```
Detected intent: add-feature (LLM, confidence 0.93)
[prd]            Writing PRD → docs/vectalon/feature-development/<run>/prd.md
[scope]          Writing scope.md
[design]         Writing design.md
[architecture]   Writing architecture.md
[tasks]          Writing tasks.md
[tdd-tests]      Writing tests.md
[implementation] Streaming live diff: src/screens/LoginScreen.tsx (+126)
⠋ Guardrails: 25 rules × 1 file
✔ no-console-log           pass
✔ accessibility-labels     pass
✔ platform-aware-code      pass
[code-review]    Reviewing implementation...
  ⚠ finding [warning] src/screens/LoginScreen.tsx:88 — inline styles — Fixing…
  ✔ re-review clean (round 2/3)
[verification]   Running: npm run typecheck, npm run lint, npm test
[readiness]      All gates green
[pr]             Branch feature/login-screen created (push with --push)
[documentation]  Writing documentation.md
[close]          Workflow complete — docs/vectalon/feature-development/<run>/
```

**Capture notes**

1. **Do not** record this live with narration — it runs 10–15 min. Record the
   real run, then speed it up; the editor inserts narration over it.
2. Keep the **live diff** on screen for one beat (the `+126` login screen);
   this is the "streaming diffs" moment.
3. Freeze on the guardrail finding + auto-fix (the `inline styles` →
   `Fixing…` → `re-review clean` sequence) — that's the review deep-dive
   anchor too.
4. Separate quick clips: the `docs/vectalon/feature-development/<run>/`
   folder tree in the explorer, and the `--dry-run` plan output.
5. **Region:** full-width terminal; explorer sidebar for the docs-tree beat.

**Must-show beats:** intent detection, the 13 phase markers scrolling, a live
diff, a guardrail finding being fixed, the docs tree.

---

## Clip 4 — `bundle` (video section 7, ~8:45–9:30)

| Field | Value |
|---|---|
| Shot ID | **BR-4** |
| Clip length | ~30 s real, ~20 s in cut |
| Location | Same project (needs a `react-native` Metro config to be realistic) |

### Command

```bash
npx vectalon bundle --static
```

### Expected output

```
⠋ Bundle budget analysis (static)…
⚠ Large library: lodash +312 KB (threshold 100 KB)
⚠ Missing sideEffects:false: package-x
✔ Image audit: 0 unoptimized (>200 KB)
✔ Budget summary: 2 warnings, 0 errors
```

> Optional beat — the knowledge-base snapshot delta (requires a prior real
> `npx vectalon bundle` build):
> `Bundle grew +80 KB vs previous snapshot (platform: ios)`

**Capture notes**

1. Two takes: one clean (`--static` warnings only) and one with the snapshot
   delta line if a prior build exists.
2. Zoom the `⚠ Large library` line — it's the chyron anchor.
3. **Region:** full terminal, generous top margin so the findings don't clip
   under the video's chyron zone.

**Must-show beats:** the large-library warning, the budget summary line.

---

## Clip 5 — `profile` (video section 7, ~9:30–10:00)

| Field | Value |
|---|---|
| Shot ID | **BR-5** |
| Clip length | ~30 s real, ~20 s in cut |
| Location | Same project + a Hermes `.cpuprofile` export (`app.cpuprofile`) |

### Command

```bash
npx vectalon profile --profile app.cpuprofile
```

### Expected output

```
⠋ Analyzing app.cpuprofile (Hermes)…
✔ JS-thread blocking events: 2
⚠ Blocking event: 500 ms in LoginScreen.useEffect (src/screens/LoginScreen.tsx:88)
  → suggestion: move heavy work to a worklet
✔ Hot functions: loginSubmit (312 ms), renderList (154 ms)
✔ Baseline: none stored — pass --save-baseline to track regressions
```

> Optional beat: `npx vectalon profile --profile app.cpuprofile --save-baseline`
> then re-run to show `✔ No regression vs baseline`.

**Capture notes**

1. Pre-generate `app.cpuprofile` from a dev-session capture; don't record the
   capture itself.
2. Zoom the blocking-event line — pair it with Clip 3's guardrail finding in
   the cut (same file, same line = storytelling win).
3. **Region:** full terminal.

**Must-show beats:** the blocking event line with the worklet suggestion, the
"no baseline" hint (or the regression comparison).

---

## Clip 6 — `release` (video section 8, 10:30–12:30)

| Field | Value |
|---|---|
| Shot ID | **BR-6** |
| Clip length | ~2 min real (3 commands), ~50 s in cut |
| Location | Same project, a few commits ahead of the last tag |

### Commands (in order)

```bash
npx vectalon release                       # plan: bump + changelog
npx vectalon release --submit              # write the release workflow
npx vectalon release --monitor --telemetry telemetry/   # crash-rate monitor
```

### Expected output — plan

```
Detected bump: minor (2 feat commits since v1.4.0) → v1.5.0
Changelog:
  ## v1.5.0
  - feat: login screen (a1b2c3d)
  - feat: offline queue (e4f5g6h)
  - fix: keyboard avoidance (i9j8k7l)
```

### Expected output — submit

```
✔ Wrote .eas/workflows/vectalon-release.yml (quality → E2E → store → monitor)
```

### Expected output — monitor

```
⠋ Ingesting telemetry/ (Sentry exports)…
✔ 14 crash events ingested (24h window)
✔ Baseline: mean 0.9 / 1k sessions, σ 0.4
✔ Latest hour: 1.1 / 1k sessions — within 3σ — OK
```

> Optional dramatic beat — an anomaly:
> `⚠ ANOMALY hour 03:00 rate 3.2 / 1k (baseline +3σ) — incident filed — rollback suggested`

**Capture notes**

1. Run the three commands as three separate short clips so the editor can
   order them independently.
2. Record the anomaly beat as a **fourth take** with fake-but-plausible
   telemetry files (Sentry JSON with timestamps) in `telemetry/` — it's the
   emotional payoff of the section.
3. **Region:** full terminal; freeze 4 s on the workflow-file path line.

**Must-show beats:** the bump + changelog, the workflow file path, the z-score
status line (and optionally the anomaly).

---

## Assembly reference

| Video section | Clips used |
|---|---|
| 3 (init) | BR-1 |
| 4 (doctor + selftest) | BR-2 |
| 6 (feature workflow) | BR-3 |
| 7 (review) | BR-4, BR-5 |
| 8 (release) | BR-6 |

**Total b-roll:** 6 clips (~10 min raw → ~4.5 min cut). Budget: **~60 minutes**
of capture time including retakes.

---

## Pre-flight checklist

1. All 6 scratch projects/clips use the **same app** so the story is
   continuous (a login feature everywhere).
2. Commands pre-typed in a snippet file; `clear` between each.
3. Wall-clock durations logged per clip (clip notes → editor speed factors).
4. Chyron-safe margins: keep the top 15% of the terminal clear of critical
   output, or capture taller and crop.
