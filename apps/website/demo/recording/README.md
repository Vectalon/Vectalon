# Terminal Demo Recording

A scripted terminal recording of every feature in the `rn-vectalon` CLI, rendered
with [VHS](https://github.com/charmbracelet/vhs) (charmbracelet).

## Watch it

- **`clips/full-demo.mp4`** — the complete ~1.5 min walkthrough (all 8 clips concatenated). A copy ships with the website (`apps/website/public/demo/full-demo.mp4`, embedded on the homepage under “Watch it run”) — keep the two in sync when re-rendering.
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
| 01 | `01-init.tape` | `init` on a virgin project — flavor detection, `.vectalon/` tree |
| 02 | `02-status-doctor.tape` | `status` health screen + `doctor` probe report |
| 03 | `03-selftest.tape` | `selftest` — live spinner/progress, per-check pass/fail stream |
| 04 | `04-feature.tape` | `feature` — the 13-phase workflow + paper trail |
| 05 | `05-render-sandbox.tape` | `sandbox` isolated exec + `render` Metro compile-and-render as a before/after of the `--file` comma-list fix (broken → fixed) |
| 06 | `06-profile-bundle-release.tape` | `profile` Hermes analysis, `bundle --static` budgets, `release` plan |
| 07 | `07-ecosystem-models-upgrade.tape` | `ecosystem`, `models`, `upgrade` (catalog-based migration) |

Tape 05's "before" beat is driven by `scripts/render-broken.sh`: it backs up
`packages/rn/dist`, reverts the two fix hunks (commander `--file` processor +
`normalizeRenderFiles`), runs the render so the char-spread failure shows, then
restores dist via `trap`. Re-rendering the tape is safe — dist always comes back
intact (verify with `grep -c normalizeRenderFiles dist/cli/commands/render.js`).

## Regenerate

All tapes are deterministic scripts — no human typing, no model downloads. They
drive the real CLI (`packages/rn/bin/rn-vectalon.js`) inside
`apps/website/demo/cli-app` with `VECTALON_DEV_MODE=1`.

Prerequisites:

```bash
brew install vhs ffmpeg        # vhs pulls ffmpeg, but be explicit
```

Render every clip (about 3 min):

```bash
cd apps/website/demo/recording
for t in tapes/*.tape; do vhs "$t"; done
```

Concatenate into `clips/full-demo.mp4`:

```bash
ls clips/*.mp4 | grep -v full-demo | sort | xargs -n1 basename | sed 's/^/file /' > clips/concat.txt
ffmpeg -y -f concat -safe 0 -i clips/concat.txt -c copy clips/full-demo.mp4
```

Notes:

- Tapes run from `recording/` and `cd ../cli-app` — the committed `clips/` are
  canonical; re-rendering produces near-identical output.
- The `05` before/after assumes `dist/` is the current fixed build; if a future
  change rewrites the two hunks the script reverts, update
  `scripts/render-broken.sh` to match.
- Some tapes end with a `Sleep` so the final frame holds before the encoder cuts.
- VHS v0.11 syntax: space-separated commands (`Output "path"`), no `Set Prompt` /
  `Pause`, and single-quoted `Type '...'` strings keep inner double quotes intact
  (do not backslash-escape them).
- The `render --file` clip needs `apps/website/demo/cli-app/src/demo-entry.tsx`
  (the shim renders the default export).
