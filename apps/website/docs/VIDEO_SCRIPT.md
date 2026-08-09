# Video Script — "Vectalon: Your Daily Loop"

A 13-minute onboarding video walking a junior engineer through the daily loop:
`init`, `selftest`, the feature workflow, review, and release — with exact
timings per section, narration written verbatim, and production notes.

> Pair this with the [`ONBOARDING.md`](ONBOARDING.md) written guide and the
> [`VIDEO_BROLL.md`](VIDEO_BROLL.md) shot list (exact commands, expected
> outputs, and capture regions for each clip).

---

## Production specs

| Item | Spec |
|---|---|
| Total runtime | **13:00** |
| Format | 1920×1080, 16:9, 30 or 60 fps |
| Tool | Screen recording (macOS built-in / OBS), dark terminal theme, 18pt+ font, cursor visible |
| Audio | Voiceover + quiet tech bed; no music during narration-heavy sections |
| Captions | Chyron text for every command shown |

## Timing table (section map)

| # | Section | Timecode | Duration |
|---|---|---|---|
| 1 | Cold open | 0:00–0:40 | 0:40 |
| 2 | What you'll see today | 0:40–1:00 | 0:20 |
| 3 | Setup — `init` | 1:00–2:30 | 1:30 |
| 4 | Verification — `doctor` + `selftest` | 2:30–4:00 | 1:30 |
| 5 | The daily loop intro | 4:00–4:30 | 0:30 |
| 6 | Feature workflow | 4:30–8:30 | 4:00 |
| 7 | Review deep-dive | 8:30–10:30 | 2:00 |
| 8 | Release | 10:30–12:30 | 2:00 |
| 9 | Outro | 12:30–13:00 | 0:30 |

---

## Section 1 — Cold open (0:00–0:40)

**Visual:** Split screen — left: empty terminal; right: slow zoom on a skeleton app (login screen UI). On the first beat, the terminal fills with typed commands at speed.

**Chyron:** `vectalon feature "create a login screen"`

**Narration:**
> "Meet Vectalon — an AI harness built for React Native and Expo. It plans the feature, writes the code, reviews its own work, runs your tests, opens the pull request, and watches the crash rate after you ship. In the next thirteen minutes, you'll learn the daily loop that makes all of that one command. No magic. Every step is deterministic, guardrailed, and testable."

**Transition:** speed-ramp terminal, hard cut to black, fade in on a clean project window.

---

## Section 2 — What you'll see today (0:40–1:00)

**Visual:** Static title card with five icons appearing one at a time: Init → Selftest → Feature → Review → Release.

**Narration:**
> "Here's the roadmap: first, we initialize a project — about ninety seconds. Then we verify the whole package actually works with doctor and selftest. Then the core of the loop: a feature workflow that takes a sentence and produces a PR. We'll look at how review catches problems and fixes them. And finally, we release — with crash-rate monitoring watching our back."

**Transition:** icons wipe into a live terminal.

---

## Section 3 — Setup: `init` (1:00–2:30)

**Visual:** Terminal in an empty RN/Expo project. Commands appear as typed.

**Chyron (on each command):** `npm install -D @vectalon-dev/rn` → `npx vectalon init`

**Narration:**
> "Everything starts with one install and one command. `npm install --save-dev @vectalon-dev/rn` — then `npx vectalon init`. Vectalon scans the project and builds a `.vectalon` workspace: it detects whether you're on Expo or bare React Native CLI, snapshots your codebase into a context file, and picks a model provider. If you want to choose the provider up front, pass it: `npx vectalon init --model openai` for a remote model, or `--model local` to run fully offline."

**Visual:** Zoom on `.vectalon/` tree in the file explorer: `snapshot.json`, `context.md`, `memory.json`, `rn-vectalon.json`.

**Narration:**
> "Note the workspace is auto-gitignored — it's per-machine runtime state, not something you commit. In about ninety seconds, the project knows itself: structure, patterns, tooling, and which model answers questions."

**Transition:** cut to a split terminal running two commands.

---

## Section 4 — Verification: `doctor` + `selftest` (2:30–4:00)

**Visual:** Left pane runs `npx vectalon doctor`. Right pane waits.

**Chyron:** `npx vectalon doctor`

**Narration:**
> "Before we trust the harness, we verify it. `vectalon doctor` checks the toolchain — Node, JDK, Android SDK, Xcode, Metro — plus every ecosystem item the project enabled. If something's missing, it tells you exactly how to fix it, and `--fix` auto-installs what it safely can."

**Visual:** Run `npx vectalon doctor --fix`, show a missing check flipping to OK.

**Chyron:** `npx vectalon selftest`

**Narration:**
> "Then the big one: `vectalon selftest`. This runs a real check against every feature of the package — CLI commands, the SDLC modules, guardrails, the knowledge base, the MCP server, workflows, even the sandbox. Results stream live, and when it finishes you get a dashboard showing every check by category. If selftest passes, the package works on your machine. Period. You can run a single check with `--only`, or list them all with `--list`."

**Visual:** Show the selftest HTML dashboard briefly (per-check cards, green).

**Transition:** title card: "The Daily Loop".

---

## Section 5 — The daily loop intro (4:00–4:30)

**Visual:** Simple diagram animating: sentence → workflow (13 dots) → tests → review → PR → release → monitor (loop arrow).

**Narration:**
> "Here's the loop you'll live in. One sentence in. A pull request out. And after you ship, a monitor that watches for regressions. Let's watch it happen for real."

**Transition:** diagram morphs into terminal.

---

## Section 6 — Feature workflow (4:30–8:30)

**Visual:** Terminal, fresh prompt.

**Chyron:** `npx vectalon feature "create a login screen with email + password and hook it to the auth API"`

**Narration:**
> "This is the whole product in one line: `npx vectalon feature`, followed by the feature you want. Behind it runs a thirteen-phase pipeline — product requirements, scope, design, architecture, task breakdown, tests written first, implementation, review, verification, readiness, pull request, documentation, and close."

**Visual:** Show `docs/vectalon/feature-development/<run>/` with phase files appearing.

**Narration:**
> "Each phase writes a document to `docs/vectalon`, so the thinking is visible and versioned — your whole team can read why a decision was made. Before writing any code, Vectalon applies guardrails: thirty-five rules covering console logs, inline styles, accessibility labels, New Architecture patterns, React 19 rules. Bad code gets blocked before it hits disk."

**Visual:** Zoom on a guardrail finding with a fix.

**Chyron:** `--dry-run` / `--heal-interactive`

**Narration:**
> "Two flags to know early. `--dry-run` previews the whole plan without touching files — use it the first time on any repo. And `--heal-interactive` pauses before each self-healing fix, so you approve the changes to your code as they happen. This is the review loop you'll see next."

**Visual:** Fast-forward through implementation; freeze on the review phase.

**Chyron:** `--ticket MOB-123 --push`

**Narration:**
> "And if you work from a tracker: `vectalon feature --ticket MOB-123 --push` reads the ticket, runs the whole workflow from its title and description, and opens a real pull request with the code review posted as a comment. Ticket to PR, hands-free."

**Transition:** cut to review close-up.

---

## Section 7 — Review deep-dive (8:30–10:30)

**Visual:** The self-healing loop: review → finding → fix → re-review. Show 1 real finding in the code.

**Narration:**
> "Here's where Vectalon earns its keep. After implementation, it reviews its own code — static rules plus measured evidence. It finds issues, fixes them, and re-reviews, up to three rounds by default. You can push it to five with `--heal-attempts 5`, or control severity with `--heal-severity`."

**Visual:** Run `npx vectalon bundle --static` — show a large-library warning.

**Chyron:** `npx vectalon bundle --static`

**Narration:**
> "Review isn't just linting. `vectalon bundle` enforces performance budgets — libraries over a hundred kilobytes, missing tree-shaking flags, oversized images. It snapshots each build, so you see growth over time."

**Visual:** Run `npx vectalon profile --profile app.cpuprofile` — show a JS-thread blocking event.

**Chyron:** `npx vectalon profile --profile app.cpuprofile`

**Narration:**
> "And `vectalon profile` brings measured runtime data into the review: JS-thread blocking times, retained heap, leak candidates — the difference between 'this looks fine' and 'this effect blocks the JS thread for five hundred milliseconds, move it to a worklet.'"

**Visual:** MCP-style tool card: `check_guardrails` returning pass/fail per rule.

**Narration:**
> "If you work inside an AI coding agent — Claude Code, Cursor, Windsurf — the same review is available as MCP tools: `check_guardrails`, `review_code`, `analyze_error`. Fifty-eight project-aware tools behind `vectalon serve`, so your agent reviews with the same standards."

**Transition:** terminal clears; release sequence.

---

## Section 8 — Release (10:30–12:30)

**Visual:** Terminal, `git` state on screen.

**Chyron:** `npx vectalon release`

**Narration:**
> "When the PR lands, shipping is one command. `vectalon release` reads your git history, detects the semantic version bump — breaking changes mean a major, features a minor, fixes a patch — and writes the changelog with the same categorizer your release notes use."

**Visual:** Show the generated changelog scrolling.

**Chyron:** `npx vectalon release --submit`

**Narration:**
> "`--submit` generates the full release workflow: quality checks, Maestro E2E flows on a device farm when you have them, store submission to App Store Connect or Play Console. The workflow is written to your repo — idempotent, never overwrites."

**Visual:** Chart of hourly crash rate; a spike crossing the threshold line; incident card + rollback button.

**Chyron:** `npx vectalon release --monitor`

**Narration:**
> "And the part that saves your weekend: `--monitor`. It ingests Sentry or Crashlytics exports, buckets crashes hourly, and builds a statistical baseline. If a window crosses baseline plus three standard deviations, it files an incident and suggests a rollback — automatically. Healthy windows teach the baseline, so the gate only gets smarter."

**Transition:** title card recap.

---

## Section 9 — Outro (12:30–13:00)

**Visual:** The five icons from the intro return, now with a checkmark on each.

**Narration:**
> "That's the loop: initialize, verify, build, review, release. One command each, every result visible, every step guardrailed. When something feels off, remember the golden rule — run `vectalon doctor --fix`, then `vectalon selftest --only` on the feature that's acting up. You now know the tool your team is shipping with. Go build something."

**End card:** vectalon.in · `npx vectalon init` · "Start your 14-day trial: `vectalon auth --github`"

---

## Recording checklist (before you press record)

1. Pre-type all commands into a snippet file so on-screen typing is clean (1 take each).
2. Pre-create the sample login feature in a scratch project — do NOT run a real 4-minute workflow live while narrating; record the narration over a pre-captured fast-forward.
3. Capture the selftest dashboard + bundle warning + profile blocking event as separate b-roll clips first (0:40 total of b-roll per the map).
4. Record per section, 1:00–2:30 each. Budget: **~90 minutes total** for a 13-minute video with 1–2 retakes per section.
5. Shoot each demo clip per the [`VIDEO_BROLL.md`](VIDEO_BROLL.md) shot list — pre-capture all 6 clips (BR-1…BR-6) before recording any narration.
