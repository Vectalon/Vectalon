#!/usr/bin/env bash
# nightly-smoke.sh <project-dir> <vectalon-bin>
#
# P1-13: smoke test vectalon against a real project template. Runs
# `vectalon init`, `vectalon doctor`, `vectalon selftest`, and a real
# `vectalon serve` boot (polling the HTTP /health endpoint) inside the given
# project directory. Exits non-zero when any step crashes or fails, so the
# nightly CI job fails loudly when a release breaks the toolchain against a
# fresh template (ecosystem drift) before users hit it.
#
# Usage (from inside the template project):
#   bash <repo>/packages/rn/scripts/nightly-smoke.sh . <repo>/packages/rn/bin/rn-vectalon.js
set -u

PROJECT_DIR="$1"
BIN="$2"
LOG="${VECTALON_SMOKE_LOG:-/tmp/vectalon-nightly-smoke.log}"
PORT="${VECTALON_SMOKE_PORT:-8877}"
: > "$LOG"
FAILURES=0

cd "$PROJECT_DIR" || { echo "✘ cannot cd into $PROJECT_DIR"; exit 1; }

echo "== vectalon nightly smoke: $(pwd) =="

# 1. init — must complete (transactional; idempotent on re-runs).
if node "$BIN" init . --model wasm >> "$LOG" 2>&1; then
  echo "✔ init"
else
  echo "✘ init — see $LOG"
  FAILURES=$((FAILURES + 1))
fi

# 2. doctor — a fresh template legitimately reports missing ecosystem items
#    (exit 1 = "report produced, issues found"); that is a report, not a crash.
#    Any other exit code means doctor itself broke.
node "$BIN" doctor . >> "$LOG" 2>&1
DOCTOR_EXIT=$?
if [ "$DOCTOR_EXIT" -eq 0 ] || [ "$DOCTOR_EXIT" -eq 1 ]; then
  echo "✔ doctor (report produced, exit $DOCTOR_EXIT)"
  # Surface the summary line so a "everything failed" report is not blind.
  grep -E "check\(s\)" "$LOG" | tail -1
else
  echo "✘ doctor crashed (exit $DOCTOR_EXIT) — see $LOG"
  FAILURES=$((FAILURES + 1))
fi

# 3. selftest — every feature check passes in the sandbox.
if node "$BIN" selftest . --no-html >> "$LOG" 2>&1; then
  echo "✔ selftest"
else
  echo "✘ selftest — see $LOG"
  FAILURES=$((FAILURES + 1))
fi

# 4. serve — boot the real MCP HTTP server and hit /health.
node "$BIN" serve --protocol http --port "$PORT" >> "$LOG" 2>&1 &
SERVER_PID=$!
HEALTHY=0
for _ in $(seq 1 45); do
  if curl -sf "http://127.0.0.1:$PORT/health" > /tmp/vectalon-health.json 2>/dev/null; then
    HEALTHY=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done
if [ "$HEALTHY" -eq 1 ]; then
  echo "✔ serve (health: $(head -c 120 /tmp/vectalon-health.json))"
else
  echo "✘ serve never became healthy — see $LOG"
  FAILURES=$((FAILURES + 1))
fi
# Guard against signaling a recycled PID before the final kill.
if kill -0 "$SERVER_PID" 2>/dev/null; then
  kill "$SERVER_PID" 2>/dev/null || true
fi
wait "$SERVER_PID" 2>/dev/null || true

if [ "$FAILURES" -gt 0 ]; then
  echo "== SMOKE FAILED: $FAILURES step(s) — tail of log =="
  tail -40 "$LOG"
  exit 1
fi
echo "== SMOKE PASSED =="
