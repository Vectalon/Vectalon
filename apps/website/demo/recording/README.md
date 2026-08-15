# Terminal Demo Recording

A scripted terminal recording of the `rn-vectalon` CLI driving a real Expo app
end-to-end, rendered with [VHS](https://github.com/charmbracelet/vhs)
(charmbracelet).

## The demo project

Every tape runs inside **`apps/website/demo/login-app`** — a real Expo 53 /
React Native 0.79 app with **19 screens** (auth flow, catalog, cart, checkout,
orders, profile, security, billing, activity, support), each with its own hook,
service, and test, wired through `@react-navigation/native-stack`. The CLI
commands (`init`, `arch`, `sec`, `feature`, `bench`, `archive`, `selftest`)
read the project's actual source, so the recording shows the tool working on
the same codebase a visitor would clone.

## Watch it

- **`clips/full-demo.mp4`** — the complete ~1.5 min walkthrough (all 9 clips concatenated). A copy ships with the website (`apps/website/public/demo/full-demo.mp4`, embedded on the homepage under “Watch it run”) — keep the two in sync when re-rendering.
- **`clips/NN-*.mp4`** — individual clips per feature section.
- **Play a tape live** (no video file needed):

  ```bash
  cd apps/website/demo/recording
  vhs play tapes/00-intro.tape
  ```

## What each clip shows

| # | Tape | Command demoed |
|---|------|----------------|
| 00 | `00-intro.tape` | banner + `--version`, `--help` command tour |
| 01 | `01-init.tape` | `init` on the 19-screen Expo app — `.vectalon/` tree |
| 02 | `02-status-doctor.tape` | `status` health screen + `doctor` probe report |
| 03 | `03-arch.tape` | `arch` — the module graph of the 19-screen app (screens, hooks, services) |
| 04 | `04-sec.tape` | `sec` — security review + dependency audit |
| 05 | `05-feature.tape` | `feature` — the captured login-screen paper trail (14-phase workflow) |
| 06 | `06-bench.tape` | `bench` — deterministic baseline, 6 RN scenarios |
| 07 | `07-archive.tape` | `archive --dry-run` — the Expo build plan (zero side effects) |
| 08 | `08-selftest.tape` | `selftest` — live spinner/progress, per-check pass/fail stream |

## Regenerate

All tapes are deterministic scripts — no human typing, no model downloads. They
drive the real CLI (`packages/rn/bin/rn-vectalon.js`) inside
`apps/website/demo/login-app` with `VECTALON_DEV_MODE=1`.

Prerequisites:

```bash
brew install vhs ffmpeg        # vhs pulls ffmpeg, but be explicit
```

Render every clip (about 3 min):

```bash
cd apps/website/demo/recording
for t in tapes/*.tape; do vhs "$t"; done
```

Concatenate into `clips/full-demo.mp4`, then re-encode the web copy + poster:

```bash
cd clips
ls *.mp4 | grep -v full-demo | sort | xargs -n1 basename | sed 's/^/file /' > concat.txt
ffmpeg -y -f concat -safe 0 -i concat.txt -c copy full-demo.mp4
ffmpeg -y -i full-demo.mp4 -vf "scale=1440:900" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart -an full-demo-web.mp4
cp full-demo-web.mp4 ../../public/demo/full-demo.mp4
ffmpeg -y -ss 27 -i full-demo-web.mp4 -frames:v 1 -vf "scale=1100:688" -q:v 9 ../../public/demo/full-demo-poster.jpg
```

Notes:

- Tapes run from `recording/` and `cd ../login-app` — the committed `clips/` are
  canonical; re-rendering produces near-identical output.
- The `05-feature` clip reads the committed golden paper trail
  (`docs/vectalon/feature-development/create-a-login-screen-with-email-passwor-mslv1jnj/`)
  and never re-runs the model — it shows the captured workflow, not a live run.
- `06-bench` runs the deterministic baseline (no model) — the composite is the
  scaffold's score, not a model leaderboard.
- Some tapes end with a `Sleep` so the final frame holds before the encoder cuts.
- VHS v0.11 syntax: space-separated commands (`Output "path"`), no `Set Prompt` /
  `Pause`, and single-quoted `Type '...'` strings keep inner double quotes intact
  (do not backslash-escape them).
