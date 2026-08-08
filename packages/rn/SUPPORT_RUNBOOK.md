# Vectalon Support Runbook (P2-20)

How to support a Vectalon customer ("it's broken") in under 10 minutes. Keep this
next to the triage flow: **ask for `status` first, `doctor --json` second, and a
`support --upload` bundle third** — each command narrows the space.

---

## 1. The three commands to ask a customer to run

Run these in the customer's project root (where `.vectalon/` lives):

```bash
vectalon status
vectalon doctor --json
vectalon support --upload
```

| Command | What it answers | Output you want back |
|---|---|---|
| `vectalon status` | Daemon running? MCP reachable + tool count? Model ready/degraded? Last refresh? License days? `.vectalon/` disk usage? | The whole screen, verbatim |
| `vectalon doctor --json` | Every enabled ecosystem item + toolchain component installed/reachable? | The JSON blob (or `doctor --selftest` if doctor itself crashes) |
| `vectalon support --upload` | Sanitized bundle: last logs, error queue, crash report, `package.json`, `.vectalon/` state | The support **token** (starts with `vtk-…`) |

`support --upload` POSTs the sanitized bundle to the telemetry endpoint
(`/v1/support`), which routes it to the support inbox. The customer pastes the
token into the ticket — that token is the key to the bundle. Local copy:
`.vectalon/support-bundle.json`. Secrets (API keys, tokens, credentials) are
redacted before upload.

If the customer can't run any of these (crash on startup), ask for:

```bash
vectalon --diagnostics support  # writes .vectalon/diagnostics-bundle.json before anything else
```

`--diagnostics` works on **every** command: it sets debug-level logging and writes
`.vectalon/diagnostics-bundle.json` (Node/OS/RN versions, model provider, last
5000 log lines, `.vectalon/` state, full stack trace on error).

---

## 2. Reading `.vectalon/logs/`

Every log line (`info`/`warn`/`error`/`debug`) mirrors to
`.vectalon/logs/vectalon.log` with ISO timestamps. Rotating: 5 files × 10 MB
(`vectalon.log`, `.1`, … `.4`); oldest rolled off first.

```
2026-08-08T10:23:41.123Z [info]  Model: openai (gpt-4o)
2026-08-08T10:23:41.456Z [warn]  No API key found for openai. Set OPENAI_API_KEY …
2026-08-08T10:23:41.789Z [error] guardrails: could not parse file src/broken.tsx
```

Triage order:
1. **Errors first** — `grep '\[error\]' .vectalon/logs/vectalon.log | tail -20`.
2. **Last lines** — the final `[error]`/crash frame before silence is usually the
   root cause.
3. **Debug mode** — re-run the failing command with `--diagnostics` (debug lines
   are only captured then, to keep default logs small).

Related state files (all in `.vectalon/`):

| File | Meaning |
|---|---|
| `daemon.json` | Daemon pid/port/startedAt. **Stale** (pid dead) = daemon crashed; next start wipes it automatically. |
| `heartbeat.json` | Last successful liveness ping (serve/daemon). Older than 30 min + active license = alert fires. |
| `telemetry-queue.json` | Errors queued for upload (opt-out, errors only). |
| `alerts-state.json` | User-config dir: last admin-alert time per error signature (dedupe). |
| `support-bundle.json` | Last support bundle written locally. |
| `diagnostics-bundle.json` | Written when a command runs with `--diagnostics`. |
| `.init-state.json` | Init transaction record. Present after an interrupted init → `init --resume` or `--clean-restart`. |

---

## 3. What the exit codes and signals mean

| Code | Meaning |
|---|---|
| `0` | Success (or `doctor` on a project with missing optional ecosystem items — a *report*, not a crash) |
| `1` | Command failed / uncaught exception (telemetry queued, then exit) |
| `130` | SIGINT (Ctrl-C) — graceful close ran |
| `143` | SIGTERM — graceful close ran |
| `2` | Commander usage error (bad flag) |

Graceful shutdown (P2-16): on uncaught exception serve/daemon close their HTTP
server, remove `daemon.json`, and exit 1 — a crash must never leave the port
bound or a phantom state file. If a customer's port stays bound anyway, kill the
process and delete `.vectalon/daemon.json`, then restart.

---

## 4. Alert webhook (what wakes you up)

When `VECTALON_ALERT_WEBHOOK` is set on a monitored machine:
- **Error cluster**: ≥5 errors with the same stack signature within 1 hour →
  `🚨 Vectalon error cluster` with fingerprint, affected versions, OS counts,
  commands. This is your "14 Windows users can't init" signal.
- **Heartbeat stale**: a serve/daemon with an active license goes silent for
  >30 min → `⚠️ Vectalon heartbeat silent` (version + last ping).

Alerting is off by default (no webhook URL) and best-effort. Keep the webhook
secret; the payload is public-ish (no customer data, just counts + fingerprints).

---

## 5. The 3 most common root causes + fixes

**1. Model provider degraded — missing API key or nothing downloaded.**
`vectalon status` shows `Model: openai … degraded — missing API key`.
Fix: export the key (`OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY`, `GROQ_API_KEY`,
etc. — `status` prints the exact env var), or for `local` run `vectalon pull`.
Ollama/vLLM are keyless: check the server is running and `endpoint` is right.

**2. Stale daemon state after a crash.**
`vectalon status` shows `Daemon: not running — stale pid file` and the port
stays bound. Fix: kill the leftover process (`lsof -i :<port>`), delete
`.vectalon/daemon.json` (or just run `vectalon daemon` — it auto-wipes stale
state now), then restart.

**3. Optional native module fails to load (`better-sqlite3`, `node-llama-cpp`).**
`doctor --selftest` fails on its own probes, or init crashes on the SQLite
engine. Fix: `npm rebuild better-sqlite3` / reinstall the package (Node version
mismatch is the usual cause); Vectalon degrades to the JSON store and the
deterministic WASM stub automatically, so a failed native dep is a warning, not
a hard stop — but it does change behavior. Ask for `node -v` + `vectalon
--diagnostics doctor` to confirm.

---

## 6. If you still can't find it

1. `gh run view <run>` / CI logs for release-time regressions (releases are
   gated by the bench regression check — composite < 0.95 or guardrail
   regressions block publish).
2. Nightly smoke (`nightly-smoke.yml`) runs init/doctor/selftest/serve on
   Expo SDK 51, RN CLI 0.74, and RN 0.72 — a red nightly is ecosystem drift
   (Metro changes, SDK moves), not a single customer.
3. Escalate with the support token + `.vectalon/logs/` + `vectalon
   --diagnostics <failing command>` output. One structured bundle beats ten
   screenshots.
