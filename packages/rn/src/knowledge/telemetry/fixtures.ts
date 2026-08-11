import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Sample telemetry exports for `vectalon telemetry --fixtures` (and the
 * interactive menu's "Generate sample exports"). Writes one realistic export
 * per supported format into `.vectalon/telemetry/` so the full pipeline —
 * parse → store → crash/incident/KPI analysis — can be demonstrated without
 * touching a real Sentry / Crashlytics / Firebase account.
 *
 * The JSON files are intentionally pretty-printed: that exercises the
 * whole-document-array/object parsing path (the case auto-detection used to
 * misread as JSONL).
 */

const SENTRY_CRASH = {
  event_id: 'demo-sentry-1',
  timestamp: 1786450000,
  message: "TypeError: Cannot read property 'items' of undefined",
  culprit: 'app/src/screens/HomeScreen in render',
  platform: 'javascript',
  release: '1.0.0 (1)',
  environment: 'production',
  fingerprint: ['demo-home-crash'],
  tags: { 'app.screen': 'Home' },
  user: { id: 'demo-user-1', email: 'demo@vectalon.in' },
  exception: {
    values: [
      {
        type: 'TypeError',
        value: "Cannot read property 'items' of undefined",
        stacktrace: {
          frames: [
            { filename: 'app/src/screens/HomeScreen.tsx', function: 'render', lineno: 42, in_app: true },
            { filename: 'app/src/navigation/AppNavigator.tsx', function: 'HomeScreen', lineno: 18, in_app: true },
            { filename: 'node_modules/react-native/Libraries/Renderer/ReactNativeRenderer.js', function: 'renderRoot', lineno: 1103, in_app: false },
          ],
        },
      },
    ],
  },
}

const SENTRY_TRANSACTION = {
  type: 'transaction',
  transaction: 'Home Load',
  op: 'ui.load',
  start_timestamp: 1786450000,
  timestamp: 1786450001.4,
  spans: [
    { op: 'http', description: 'GET /api/home', start_timestamp: 1786450000.1, timestamp: 1786450000.9 },
    { op: 'db', description: 'SELECT items', start_timestamp: 1786450000.2, timestamp: 1786450000.6 },
  ],
  release: '1.0.0 (1)',
  platform: 'javascript',
}

const CRASHLYTICS_REPORT = {
  app_info: { app_id: '1:1234567890:android:demo', app_name: 'Demo App', app_version: '2.4.0', build_version: '81' },
  device_info: { device_name: 'Pixel 8', os_version: '14', os: 'ANDROID' },
  event: { id: 'demo-crashlytics-1', type: 'crash', timestamp: 1786450000123456, process_state: 'FOREGROUND' },
  metadata: { issue_id: 'demo-issue-77' },
  user_info: { user_id: 'demo-user-1' },
  exception: {
    reason: 'Fatal Exception: java.lang.NullPointerException: Attempt to invoke virtual method on null object reference',
    type: 'java.lang.NullPointerException',
    stackTrace: [
      { file: 'MainActivity.kt', symbol: 'com.app.MainActivity.onCreate', lineNumber: 34 },
      { file: 'Activity.java', symbol: 'android.app.Activity.performCreate', lineNumber: 7954 },
    ],
  },
}

const ANALYTICS_LINES = [
  { event_date: '20260811', event_timestamp: 1786450000123000, event_name: 'session_start', user_pseudo_id: 'pseudo-1', platform: 'ANDROID', event_params: [{ key: 'source', value: { string_value: 'deeplink' } }] },
  { event_date: '20260811', event_timestamp: 1786450002000000, event_name: 'screen_view', user_pseudo_id: 'pseudo-1', platform: 'ANDROID', event_params: [{ key: 'screen_name', value: { string_value: 'Home' } }] },
  { event_date: '20260811', event_timestamp: 1786450003500000, event_name: 'purchase', user_pseudo_id: 'pseudo-1', platform: 'ANDROID', event_params: [{ key: 'currency', value: { string_value: 'USD' } }, { key: 'value', value: { double_value: 19.99 } }] },
]

/** The fixture file names (basenames) written into `.vectalon/telemetry/`. */
export const TELEMETRY_FIXTURE_FILES = ['sentry-crash.json', 'sentry-transaction.json', 'crashlytics-report.json', 'analytics.jsonl'] as const

/**
 * Write the sample exports into `<root>/.vectalon/telemetry/` and return the
 * written file paths. Idempotent — fixed event ids + content checksums make a
 * second run dedupe to zero new artifacts.
 */
export function writeTelemetryFixtures(root: string): string[] {
  const dir = join(root, '.vectalon', 'telemetry')
  mkdirSync(dir, { recursive: true })
  const files: Array<[string, string]> = [
    ['sentry-crash.json', JSON.stringify(SENTRY_CRASH, null, 2)],
    ['sentry-transaction.json', JSON.stringify(SENTRY_TRANSACTION, null, 2)],
    ['crashlytics-report.json', JSON.stringify(CRASHLYTICS_REPORT, null, 2)],
    ['analytics.jsonl', `${ANALYTICS_LINES.map(l => JSON.stringify(l)).join('\n')}\n`],
  ]
  for (const [name, content] of files) {
    writeFileSync(join(dir, name), content)
  }
  return files.map(([name]) => join(dir, name))
}
