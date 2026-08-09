# REPLAY.md — CLI-App Demo Guide

This plain TypeScript CLI app (no Expo, no react-native) is the **non-Expo** demo
project for the Vectalon daily-loop video and onboarding. It exists to prove the
toolchain is not Expo-only: the full 13-phase feature workflow runs against a
bare Node project shape and produces the same end-to-end paper trail.

Everything the b-roll needs is already captured in this folder: the scaffold,
a green feature workflow (PRD → review → verification → PR → close), the
generated feature + TDD tests, and the committed paper trail. It was generated
deterministically — **no model was involved** — by replaying the workflow with a
scripted model router, so it is fast, repeatable, and CI-green.

It lives at `apps/website/demo/cli-app/` inside the Vectalon repo.

## How this demo was generated

```bash
cd packages/rn
pnpm run build                        # compile the golden replay into dist/
node scripts/generate-cli-demo.js     # scaffold + replay + publish paper trail
cd ../../apps/website/demo/cli-app
npm install && npm test               # validate (3/3 unit tests)
```

The same replay is a CI regression test (`packages/rn/__tests__/workflows/goldenFeatureWorkflow.test.ts`),
so the demo and the test can never drift apart — if a workflow regression breaks
the replay, CI fails before the demo does.

## Setup for the video team

```bash
git clone git@github.com:<org>/Vectalon.git
cd apps/website/demo/cli-app
npm ci                     # installs the pinned devDeps (jest, ts-jest, typescript)
export VECTALON_DEV_MODE=1
vt='node ../../../../packages/rn/bin/rn-vectalon.js'   # dev CLI from the repo
```

No model download is needed for any clip — the workflow capture is already in
`docs/vectalon/`. Only a re-run of `feature` needs the local model, and REPLAY
tells you not to do that on camera.

## Layout

```
apps/website/demo/cli-app/
  docs/vectalon/feature-development/add-greet-command-mslolcno/
                        <- 13 phase documents (PRD..close) + workflow-state.json (13/13 completed)
  docs/vectalon/manifest.json   <- init manifest (tooling: rn-cli, model: local qwen2.5-coder-3b)
  src/                <- scaffold CLI (index.ts) + the generated feature (screen, hook, service, TDD tests)
  .maestro/           <- generated Maestro E2E flow
  package-lock.json   <- committed so `npm ci` works
```

## Per-clip reset + re-run

### BR-1 `init` (1:00–2:30 in the script)

Reset to a virgin project, then re-run init (takes ~10s; output is the clip):

```bash
cd apps/website/demo/cli-app
rm -rf .vectalon
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js init --model local
```

Shoot: the flavor-detection line for a non-Expo project, the `.vectalon/` tree,
and the model provider line. This clip is the visual proof the tool is not
Expo-only.

### BR-2 `doctor` + `selftest` (2:30–4:00)

No reset needed — both run against the live project:

```bash
cd apps/website/demo/cli-app
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js doctor
VECTALON_DEV_MODE=1 node ../../../../packages/rn/bin/rn-vectalon.js selftest
```

### BR-3 `feature` (4:30–8:30)

The green run is **already captured** — do not re-run the 10-minute model
workflow on camera. The paper trail is the footage:

```bash
cd apps/website/demo/cli-app
ls docs/vectalon/feature-development/add-greet-command-mslolcno/
node -e "const s=JSON.parse(require('fs').readFileSync('docs/vectalon/feature-development/add-greet-command-mslolcno/workflow-state.json','utf-8')); console.log(s.status, s.phases.map(p=>p.id+':'+p.status).join(' '))"
# → completed prd:completed scope:completed ... close:completed
```

### BR-4/5/6 — bundle, profile, release

Run `bundle --static`, `profile`, and `release --plan` exactly as the login-app
shoot guide describes. The `bundle` clip shows the static budget table on a
bare project; `release --plan` shows the release plan without touching git.

## Notes

- **Why a CLI app?** The login-app demo covers Expo. This project covers
  everything else — bare React Native CLI projects and plain Node tooling — so
  the onboarding story is honest: the workflow, review gate, and paper trail
  work regardless of the Expo SDK.
- **Generated code is RN-flavored scaffold code.** The tool targets React
  Native developers, so the scripted implementation produces the standard
  screen/hook/service modules the TDD tests import. In this demo the project
  shape is a CLI app; the point is the *pipeline*, not the domain code.
  `tsconfig.json` deliberately compiles only the scaffold CLI, so the generated
  feature files never break `npm run typecheck` in this demo.
- **Never re-run the feature workflow live** — regenerate it with
  `node scripts/generate-cli-demo.js` after a build instead (seconds, no model).
- The demo's own `.gitignore` keeps `node_modules/`, `dist/`, `.vectalon/`, and
  `*.log` out of git; the workflow-state + manifest are committed under
  `docs/vectalon/` so the completion proof survives clones.
