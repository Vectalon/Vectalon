/**
 * The telemetry formats `vectalon telemetry` accepts, and how to export each
 * one from its host platform. Shown by `vectalon telemetry --formats` and the
 * interactive menu's "Supported formats" option; the canonical per-format
 * schema reference lives in docs/TELEMETRY.md.
 */

export const TELEMETRY_FORMATS = ['sentry', 'crashlytics', 'performance', 'analytics'] as const
export type CliTelemetryFormat = (typeof TELEMETRY_FORMATS)[number]

export function isTelemetryFormat(value: string): value is CliTelemetryFormat {
  return (TELEMETRY_FORMATS as readonly string[]).includes(value)
}

/** Render the supported-formats guide for the terminal. */
export function telemetryFormatsGuide(): string {
  return [
    'Telemetry formats accepted by `vectalon telemetry`',
    '',
    '1. sentry      — Sentry event/transaction exports (JSON). Export from the',
    '                 Sentry UI (issue → "Export") or API. A crash must carry an',
    '                 `exception` object; transactions carry `type: "transaction"`.',
    '2. crashlytics — Firebase Crashlytics BigQuery-style reports (JSON/JSONL).',
    '                 Each row has `app_info`, `event.type` (crash/error/ndk-crash/',
    '                 anr), and an `exception` with reason/type/stackTrace.',
    '3. performance — Performance traces (JSON): Sentry transactions, Firebase',
    '                 trace exports, or generic `{ name, durationMs }` objects.',
    '4. analytics   — Analytics event streams (JSON/JSONL): Firebase BigQuery rows',
    '                 (`event_name` + `event_params`), or generic',
    '                 `{ event, properties }` objects.',
    '',
    'Files: .json / .jsonl / .ndjson in .vectalon/telemetry/ or telemetry/.',
    'Formats auto-detect per record; force one with: --format <sentry|crashlytics|performance|analytics>.',
    'Not sure what a valid export looks like? Run: --fixtures (writes + ingests samples).',
    '',
  ].join('\n')
}
