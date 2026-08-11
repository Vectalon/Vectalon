# MCP catalog health + actionable suggestions — design

Date: 2026-08-11
Scope: `packages/rn` only (the `vectalon` CLI / MCP server package).

## Problem

Three user-visible issues, reported from a real `vectalon serve` run:

1. **Broken sub-MCP catalog entries.** Enabled MCP servers are spawned via
   hardcoded `npx <package>` install strings in `src/ecosystem/catalog.ts`.
   Several entries historically pointed at wrong package names
   (`@steve228uk/metro-mcp`, `@mrnitro360/react-native-mcp`,
   `@patrickkabwe/react-native-upgrader-mcp`), so `npx` fails at serve time
   with a wall of npm 404 output piped through `logger.dim` line-by-line.
   Nothing validates that catalog entries exist on the npm registry, and
   `vectalon ecosystem enable` never checks — the failure only appears when
   serve tries to spawn.
2. **Serve UI noise.** Each failed sub-MCP dumps ~12 npm error lines; the
   "35 improvement suggestion(s) available" background-refresh line points at
   nothing.
3. **Invisible suggestions.** `KnowledgeRefreshService` persists improvement
   suggestions to `.vectalon/knowledge/refresh/suggestions.json` (library,
   current→latest, severity, title, description), but the only surface is a
   count printed during serve's hourly background refresh. There is no command
   to list, view, or act on them.

Verified: all four MCP packages exist on npm today (`metro-mcp`,
`@mrnitro360/react-native-mcp-guide`, `react-native-upgrader-mcp` (unscoped),
`@ohah/react-native-mcp-server` — which has a working `rc` dist-tag). The 404s
reported came from a stale installed version with the old names. The fix is
therefore validation + graceful failure + hygiene, not a one-off data edit.

## Decisions (approved)

- Fail-fast `ecosystem enable` validation: **in scope** (with `--force` bypass).
- Serve keeps the full tool list: **yes** — do not collapse behind `--verbose`.
- `suggestions --apply`: runs the direct `npm install <pkg>@^<latest>` with
  confirmation. **Not** routed through the `upgrade` copilot.

## Workstream 1 — MCP catalog health

### 1a. Catalog data hygiene (`src/ecosystem/catalog.ts`)

- `react-native-mcp` (ohah): change `install` from
  `npx @ohah/react-native-mcp-server@rc` to `npx @ohah/react-native-mcp-server`
  (the `rc` dist-tag equals `latest` today and could vanish; npx defaults to
  `latest`). Keep `packageName: '@ohah/react-native-mcp-server'`.
- Other MCP entries verified correct; leave untouched.

### 1b. Registry validation (`src/ecosystem/registry.ts`, new)

- `interface RegistryCheck { exists: boolean; verified: boolean; latestVersion?: string; checkedAt: number }`.
- `checkPackageOnRegistry(name, { cache, maxAgeMs })`: `GET
  https://registry.npmjs.org/<name>/latest` (scoped names `%2F`-encoded), 3s
  timeout, never throws. Confirmed-404 → `{ exists: false, verified: true }`;
  network error → `{ exists: true, verified: false }` so callers treat it as
  "unknown, proceed" rather than blocking offline.
- Disk cache `.vectalon/ecosystem/registry-cache.json` (TTL 24h) so doctor and
  enable are fast and CI-quiet. Same shape as the bundle `signals.json` cache.
- `checkCatalogPackagesOnRegistry(packageNames, { root })`: batched, parallel,
  cache-first, offline-tolerant; returns `Record<string, RegistryCheck>`.
- Extract the fetch helper from `src/utils/npmSignals.ts` into a shared
  `src/utils/http.ts` (`fetchJson` + timeout) and reuse it here (small, no
  behavior change; npmSignals tests mock global fetch so they keep passing).

### 1c. Fail-fast enable (`src/ecosystem/config.ts` + `src/cli/commands/ecosystem.ts`)

- `vectalon ecosystem --enable <id>` for an MCP item with a `packageName`:
  check the registry first. Confirmed 404 → refuse to enable, print a clear
  error ("catalog entry <id> points at <pkg> which does not exist on npm") plus
  the corrected install command when known. Network error → warn and proceed
  (offline must not block). `--force` skips the check entirely.
- Non-MCP items unchanged (skills/tools/hooks have no npm resolution here).

### 1d. Doctor catalog-health check

- New check group (id `catalog-<itemId>`, category `ecosystem`, flavor `both`)
  for every **enabled MCP item**: resolves the item's `packageName` against the
  registry (cache-backed). Broken entry → `warning` with the corrected
  command; resolvable → `ok` with the latest version.
- Implementation: `checkEcosystemCatalogHealth(root, registryStatus)` is pure +
  sync; the CLI `doctor` command precomputes `registryStatus` via
  `checkCatalogPackagesOnRegistry` (async, best-effort) and passes it into
  `runDoctor(..., { catalogRegistry })`. Offline/unknown → check skipped
  (reported `ok` with "offline — not verified").

### 1e. Quiet sub-MCP spawn (`src/protocol/subMcp.ts` + `src/cli/commands/serve.ts`)

- `startEnabledMcpClients` buffers each server's stderr (cap ~5 lines) instead
  of streaming. On failure the warn line becomes one compact line:
  `Could not start sub-MCP <name> (<id>): <reason>` where `<reason>` is
  extracted from the buffer (npm `E404`/`ETARGET` codes, `command not found`)
  falling back to the error message. Full buffered stderr goes to debug
  (`VECTALON_DEBUG=1`). The existing "Install with:" hint line stays.
- `serve.ts` stops passing the line-by-line `logger.dim` stderr passthrough.
- `StartMcpClientsOptions.stderr` stays (tests inject it).

### 1f. Catalog integrity tests

- `__tests__/ecosystem/catalog.test.ts` (always run): unique ids; every MCP
  item with a `packageName` has a valid npm name; `parseMcpCommand(install)`
  yields a spawnable command for every item.
- Network-gated block (`RUN_CATALOG_NETWORK=1`): fetch `npm view <pkg> version`
  for every MCP `packageName` and fail on 404 — the drift tripwire for future
  edits. Skipped by default so CI stays hermetic.

## Workstream 2 — serve/CLI UI cleanup

- Remove the npx stderr spam (1e).
- Background-refresh line becomes actionable:
  `Background refresh: N suggestion(s) — run \`vectalon suggestions\``
  (`serve.ts`; same for the `feature` workflow's suggestion line).
- `vectalon status` gains a line: `N improvement suggestion(s) — run
  \`vectalon suggestions\`` (reads `KnowledgeRefreshService.getSuggestions()`,
  read-only, no network).
- The serve tool list stays exactly as-is.

## Workstream 3 — actionable suggestions surface

### 3a. `vectalon suggestions [directory]` (`src/cli/commands/suggestions.ts`, new)

- Default: severity-grouped list (`❌ error / ⚠️ warning / ℹ️ info`) of the
  persisted suggestions — title, `current → latest`, and the install command
  (`npm install <library>@^<latest>`). Footer: totals + hint to run
  `vectalon refresh --force` to regenerate.
- `--json`: raw store to stdout (CI/agents).
- `--limit <n>`: cap displayed rows.
- `--apply <id>`: prints the exact install command; executes it only with
  `--yes` or an interactive confirm (mutates package.json — deliberate gate).
  Non-TTY without `--yes` → print command only. The interactive confirm uses
  `@clack/prompts` `confirm` via `dynamicImport` (same pattern as the menu).
  Runs `npm install` via the existing `runCommand` adapter (injectable in
  tests).
- `--open`: writes a self-contained HTML dashboard
  (`.vectalon/suggestions/report.html`) and opens it — severity cards with
  current→latest, install command, npm link. Same pattern as the bundle
  dashboard.
- No `.vectalon/` → error + exit 1 (mirrors `refresh`).

### 3b. Shared HTML helper

- Extract `escapeHtml` into `src/utils/html.ts`; `bundleVisualizer.ts` and the
  new suggestions report both use it (no behavior change).

### 3c. Surfaces

- `cli/index.ts`: register the command; interactive menu gains
  `View suggestions (N)` (count read from the persisted store at menu build —
  no network, no `.vectalon/` side effects).
- `serve.ts` / `feature.ts` refresh messages link to the command (2 above).
- `status.ts` count line (2 above).

## Error handling

- Registry fetches never throw; offline degrades to "unknown → proceed" for
  enable, and "skipped (offline)" for doctor.
- Confirmed-404 (`verified` + `!exists`) is the only blocking state (enable
  refuses; doctor warns). Unverified (offline) never blocks.
- Suggestion reads are read-only and swallow corrupt JSON (existing
  `KnowledgeRefreshService` behavior).
- `--apply` never runs without `--yes` or an interactive confirm.

## Testing

- `__tests__/ecosystem/registry.test.ts` — fetch (mock), 404 vs network-error
  distinction, cache read/write + TTL, scoped-name encoding.
- `__tests__/ecosystem/catalog.test.ts` — 1f.
- `__tests__/ecosystem/doctor.test.ts` — extend: catalog-health check ok/warn/
  skipped (offline).
- `__tests__/protocol/subMcp.test.ts` — extend: stderr buffered, compact
  failure reason extracted.
- `__tests__/cli/ecosystem.test.ts` — enable refuses a confirmed-404, proceeds
  offline, `--force` bypasses.
- `__tests__/cli/suggestions.test.ts` — list formatting, `--json`, `--apply`
  prints vs runs (with mocked runner), empty store.
- `__tests__/utils/suggestionsReport.test.ts` — HTML contains/escapes data.
- Full gate: `pnpm typecheck`, `pnpm lint`, `pnpm test` for `@vectalon-dev/rn`.

## Non-goals

- No remote catalog manifest (no network config at runtime).
- No version pinning of MCP packages (validation + doctor catch drift instead).
- No change to the serve tool list layout.
- No routing `--apply` through the `upgrade` copilot.
- No changes to the knowledge-refresh generation logic itself.
