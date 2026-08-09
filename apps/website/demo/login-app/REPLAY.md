# REPLAY.md — Login-App Demo Shoot Guide

This scratch Expo app is the demo project for the Vectalon daily-loop video.
Everything the b-roll needs is already captured in this folder: init output, a
green feature workflow (PRD → review → verification → PR), the Hermes profile
fixture, and the telemetry fixtures. This file tells you how to reset and
re-record each clip without re-running the 10-minute model workflow.

It lives at `apps/website/demo/login-app/` inside the Vectalon repo so the video
team can clone one repository and shoot.

## Setup for the video team

```bash
git clone git@github.com:<org>/Vectalon.git
cd apps/website/demo/login-app
npm ci            # installs the exact pinned deps (includes jest + jest-expo)
export VECTALON_DEV_MODE=1
vt='node ../../../../packages/rn/bin/rn-vectalon.js'   # dev CLI from the repo
```

No model download is needed for most clips — the workflow capture is already in
`docs/vectalon/`. Only a re-run of `feature` needs the local model, and REPLAY
tells you not to do that on camera.

## Layout

```
apps/website/demo/login-app/
  docs/vectalon/feature-development/create-a-login-screen-with-email-passwor-msllrl4s/
                        <- 11 phase documents (PRD..close) + workflow-state.json (13/13 completed)
  docs/vectalon/manifest.json   <- init manifest (model: local qwen2.5-coder-3b)
  src/                <- the generated feature (screen, hook, service, TDD tests)
  .maestro/           <- generated Maestro E2E flow
  app.cpuprofile      <- synthetic Hermes profile (500ms JS-thread block)
  telemetry/          <- crashlytics.json + sentry-events.json (anomaly spike)
  gen-fixtures.js     <- regenerates app.cpuprofile + telemetry/
```

## Environment

All vectalon commands run in dev mode so tier checks are bypassed:

```bash
export VECTALON_DEV_MODE=1
vt='node ../../../../packages/rn/bin/rn-vectalon.js'
```

The project manifest uses the local `qwen2.5-coder-3b` preset (see
`docs/vectalon/manifest.json` — `"modelName": "qwen2.5-coder-3b"`). The 1.5B
default hallucinates review findings; the 3B is reliable. A fresh clone has no
downloaded model; `vectalon pull qwen2.5-coder-3b` fetches it (~2.1 GB) only if
you need to re-run generation.

## Per-clip reset + re-run

### BR-1 `init` (1:00–2:30 in the script)

Reset to a virgin project, then re-run init (takes ~10s; output is the clip):

```bash
cd apps/website/demo/login-app
rm -rf .vectalon
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js init --model local
```

Shoot: flavor detection line ("Expo SDK 53 detected"), `.vectalon/` tree, model
provider line. `--model local` is what the video narrator types.

### BR-2 `doctor` + `selftest` (2:30–4:00)

No reset needed — both run against the live project:

```bash
cd apps/website/demo/login-app
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js doctor
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js selftest
```

Shoot: the live check-stream (spinner + progress), the `⚠ → ✔` fixes, and the
HTML dashboard file it writes.

### BR-3 `feature` (4:30–8:30)

The green run is **already captured** — do not re-run the 10-minute model
workflow on camera. The paper trail is the footage:

```bash
cd apps/website/demo/login-app
ls docs/vectalon/feature-development/create-a-login-screen-with-email-passwor-msllrl4s/
# 11 phase docs + workflow-state.json
node -e "const s=JSON.parse(require('fs').readFileSync('docs/vectalon/feature-development/create-a-login-screen-with-email-passwor-msllrl4s/workflow-state.json','utf-8')); console.log(s.status, s.phases.map(p=>p.id+':'+p.status).join(' '))"
# → completed prd:completed scope:completed ... close:completed
```

The healing-loop b-roll (the `+126` diff beat) comes from the same workflow's
self-healing section in `docs/vectalon/.../code-review.md`.

If you must regenerate (e.g. to re-shoot the fast-forward from scratch), pull
the 3B model first and re-run the full workflow with strongest healing:

```bash
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js pull qwen2.5-coder-3b
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js feature "create a login screen with email password" --heal-attempts 5 --heal-severity warning
```

### BR-4 `bundle --static` (bundle budget clip)

```bash
cd apps/website/demo/login-app
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js bundle --static
```

Shoot: the budget summary table and the large-library warning zoom.

### BR-5 `profile` (Hermes profiling clip)

```bash
cd apps/website/demo/login-app
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js profile app.cpuprofile
```

`app.cpuprofile` is the synthetic fixture with a 500ms JS-thread blocking event
in the login screen. Regenerate it with `node gen-fixtures.js`.

### BR-6 `release` (three takes)

```bash
cd apps/website/demo/login-app
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js release --plan        # take 1: plan
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js release              # take 2: submit
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js release --monitor     # take 3: monitor
```

The anomaly-payoff beat uses `telemetry/sentry-events.json` (contains the crash
spike) — see `docs/vectalon/.../readiness.md` and the incident artifact.

## Notes

- **Timing:** each clip records in 1–2 takes of 1:00–2:30. Total shoot budget
  ~90 minutes for the 13-minute video.
- **Never re-run the feature workflow live** — it is the slow clip (10+ min
  with the local 3B model). The capture in `docs/vectalon/` is the footage.
- The `.maestro/` flow is generated but not executed (no simulator on the dev
  machine); the verification report documents it as skipped with install notes.
- The demo's own `.gitignore` keeps `node_modules/`, `.expo/`, `.vectalon/`,
  and `*.log` out of git; the workflow-state + manifest are committed under
  `docs/vectalon/` so the completion proof survives clones.
