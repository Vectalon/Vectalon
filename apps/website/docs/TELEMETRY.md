# Telemetry ingestion — formats & schema reference

`vectalon telemetry` ingests runtime telemetry exports (crashes, performance
traces, analytics events) into the project knowledge base as `telemetry`
artifacts, then runs data-driven crash / incident / KPI analysis over the
ingested window.

This page is the per-format schema reference. For the command options, see
[`CLI_REFERENCE.md` → `telemetry`](./CLI_REFERENCE.md#telemetry).

## Quick start

```bash
# Ingest whatever is in .vectalon/telemetry/ or telemetry/
npx vectalon telemetry

# Point at an export file or directory
npx vectalon telemetry --path ./exports

# Don't have exports yet? Write samples and ingest them end-to-end
npx vectalon telemetry --fixtures

# See the accepted formats
npx vectalon telemetry --formats

# Watch for new exports — ingest them as they land (Ctrl-C to stop)
npx vectalon telemetry --watch
```

Accepted file extensions: `.json`, `.jsonl`, `.ndjson`. Exports may be a single
JSON object, a JSON array, or JSONL (one object per line) — including
pretty-printed files. Duplicates are skipped by event id (within a batch) and
content checksum (across the store).

## Watching for new exports

`vectalon telemetry --watch` polls the telemetry directory (default
`.vectalon/telemetry/`) and ingests new or changed files as they land,
printing the delta crash/incident/KPI analysis for every batch:

```bash
npx vectalon telemetry --watch                # poll every 10 s
npx vectalon telemetry --watch --interval 5000  # poll every 5 s
npx vectalon telemetry --watch --path ./exports
```

How it works:

- Files are deduped by **mtime + size** against a per-file scan state
  (`.vectalon/telemetry-watch-state.json`, kept *outside* the watched
directory so it is never ingested), so unchanged files are not re-parsed.
- The knowledge base's content-checksum dedupe is a second layer — even a lost
  state file can never double-store an event.
- The watcher re-resolves the directory each pass: start it before any
  exports exist and it will pick them up when they appear.
- Deleted files are forgotten, so a re-created export re-ingests.

### The daemon can watch for you

`vectalon daemon --telemetry-watch` enables the same loop inside the live
daemon — new crash/analytics exports surface in the daemon log the moment they
land, with a compact one-line-per-batch summary (top exception, slowest trace,
analytics counts):

```bash
npx vectalon daemon --telemetry-watch
```

The daemon polls every 30 s (it is not latency-critical) and stores every
ingested event in the knowledge base exactly like a manual run.

## Forcing a format

Format auto-detects per record. If an export's shape is unusual and detection
misses it, force one format for the whole run:

```bash
npx vectalon telemetry --format crashlytics --path ./exports
```

Valid formats: `sentry` · `crashlytics` · `performance` · `analytics`.

---

## 1. Sentry (`format: sentry`)

Sentry event / transaction exports as JSON. Export from the Sentry UI (issue →
"Export") or the Sentry API.

### Crash event

A **crash** must carry an `exception` object — bare log/message events are
ignored so they don't pollute crash counts.

| Field | Type | Notes |
|---|---|---|
| `event_id` | string | Dedupe key |
| `timestamp` | number | Unix seconds |
| `platform` | string | e.g. `javascript`, `react-native` |
| `release` | string | e.g. `1.2.3 (42)` |
| `environment` | string | e.g. `production` |
| `culprit` | string | Where it was blamed |
| `fingerprint` | string[] | Crash grouping |
| `tags` | object | String values |
| `user.id` / `user.email` / `user.ip_address` | string | Affected user |
| `exception.values[]` | array | First entry used |
| `exception.values[0].type` | string | Exception class, e.g. `TypeError` |
| `exception.values[0].value` | string | Exception message |
| `exception.values[0].stacktrace.frames[]` | array | `filename`, `function`, `lineno`, `in_app` |

Sentry envelope payloads (a `payload` wrapper object) are supported.

### Transaction (performance)

| Field | Type | Notes |
|---|---|---|
| `type` | string | `"transaction"` (or presence of `transaction` + `spans`) |
| `transaction` | string | Trace name |
| `op` | string | e.g. `ui.load` |
| `start_timestamp` / `timestamp` | number | Unix seconds → duration |
| `spans[]` | array | `op`, `description`, `start_timestamp`, `timestamp` |
| `release` | string | |

## 2. Firebase Crashlytics (`format: crashlytics`)

Firebase Crashlytics **BigQuery-style exports** as JSON/JSONL. Event types:
`crash`, `error`, `ndk-crash`, `anr`, `background-anr` (other types ignored).

| Field | Type | Notes |
|---|---|---|
| `event.id` | string | Dedupe key |
| `event.type` | string | Crash kind |
| `event.timestamp` | number | **microseconds** |
| `app_info.app_version` / `app_info.build_version` | string | → `release` |
| `device_info.os` / `device_info.platform` | string | → `platform` (lowercased) |
| `metadata.issue_id` | string | → `fingerprint` |
| `user_info.user_id` | string | |
| `exception.reason` / `exception.issueDetails` | string | → message |
| `exception.type` | string | Exception class |
| `exception.stackTrace` | string **or** array | String = line-per-frame; array = `{file, symbol, lineNumber}` |

## 3. Performance traces (`format: performance`)

Sentry transactions (see above), Firebase trace exports, or generic objects:

| Field | Type | Notes |
|---|---|---|
| `name` / `trace` / `metric_name` / `title` | string | Trace name (required) |
| `durationMs` / `duration_ms` / `duration` | number | Required |
| `op` | string | |
| `startTimestamp` / `start_timestamp` | number | |
| `spans[]` | array | `op`, `description`, `durationMs` |
| `platform` / `release` | string | |
| `source` | string | `sentry` \| `firebase` \| `generic` |

## 4. Analytics events (`format: analytics`)

Firebase BigQuery export rows or generic event objects.

### Firebase row

| Field | Type | Notes |
|---|---|---|
| `event_name` / `event` / `name` | string | Event name (required) |
| `event_timestamp` | number | **microseconds** |
| `event_params[]` | array | `{key, value: {string_value \| int_value \| double_value \| float_value \| bool_value}}` |
| `user_pseudo_id` | string | → `userId` |
| `platform` | string | Lowercased |

### Generic event

| Field | Type |
|---|---|
| `event` | string (name) |
| `properties` / `params` | object of string/number/bool |
| `timestamp` | number (seconds) |

---

## What happens after ingestion

- Crashes → root-cause analysis (`analyze_crash`), incident summary
  (`analyze_incident`), linked per-crash analysis artifacts
- All events → KPI analysis (`analyze_kpis`): crash counts, crash-free session
  rate, affected users, average trace durations
- Artifacts are stored with `kind` / `source` / `eventId` / `release` metadata
  for `search_knowledge` and the team brain

## Sample exports

Run `npx vectalon telemetry --fixtures` to write one realistic export per
format into `.vectalon/telemetry/` and ingest them — a self-contained
demonstration of the whole pipeline.
