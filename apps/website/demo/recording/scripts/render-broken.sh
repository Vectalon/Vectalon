#!/usr/bin/env bash
# Reproduce the pre-fix `render --file` comma-list bug against the current dist.
#
# The fix (commit 3d95b3d) had two hunks:
#   1. src/cli/index.ts   — commander `--file` gained a comma-splitting processor
#   2. src/cli/commands/render.ts — the path list gained normalizeRenderFiles()
#
# Without them, commander delivers the comma string as one plain value and the
# render command spreads it into characters -> `File not found: .../s`.
#
# This script backs up dist, reverts both hunks in the compiled output, runs the
# render so the failure shows, then ALWAYS restores dist (trap). Used by
# tapes/05-render-sandbox.tape to film the broken state; the tape's "after" beat
# runs the untouched fixed bin for the same command.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# <repo>/apps/website/demo/recording/scripts -> 5 levels up is the repo root
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
RN_DIR="$REPO_ROOT/packages/rn"
cd "$REPO_ROOT/apps/website/demo/cli-app"
export VECTALON_DEV_MODE=1

RENDER_JS="$RN_DIR/dist/cli/commands/render.js"
CLI_JS="$RN_DIR/dist/cli/index.js"
BAK_RENDER="$(mktemp)"
BAK_CLI="$(mktemp)"

restore() {
  cp "$BAK_RENDER" "$RENDER_JS" 2>/dev/null || true
  cp "$BAK_CLI" "$CLI_JS" 2>/dev/null || true
  rm -f "$BAK_RENDER" "$BAK_CLI"
}
trap restore EXIT

cp "$RENDER_JS" "$BAK_RENDER"
cp "$CLI_JS" "$BAK_CLI"

python3 - "$CLI_JS" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = ".option('--file <file>', 'Extra file to compile (repeatable / comma-separated)', (val, prev = []) => prev.concat(val.split(',').map(s => s.trim()).filter(Boolean)), [])"
new = ".option('--file <file>', 'Extra file to compile (repeatable / comma-separated)')"
assert old in s, 'commander processor hunk not found in ' + p
open(p, 'w').write(s.replace(old, new))
PY

python3 - "$RENDER_JS" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "const paths = [entry, ...normalizeRenderFiles(options.file)].map(p => (0, path_1.resolve)(root, p));"
new = "const paths = [entry, ...(options.file || [])].map(p => (0, path_1.resolve)(root, p));"
assert old in s, 'normalizeRenderFiles hunk not found in ' + p
open(p, 'w').write(s.replace(old, new))
PY

node "$RN_DIR/bin/rn-vectalon.js" render \
  --entry src/demo-entry.tsx \
  --file src/screens/AddGreetCommandScreen.tsx,src/hooks/useAddGreetCommand.ts,src/services/AddGreetCommandApi.ts \
  || true
