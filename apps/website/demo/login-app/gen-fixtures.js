// Generate demo fixtures: app.cpuprofile (BR-5) + telemetry/ Sentry exports (BR-6).
const fs = require('fs');
const path = require('path');

const APP = '/tmp/vectalon-demo/login-app';
const TELEMETRY = path.join(APP, 'telemetry');

// --- 1. app.cpuprofile: Hermes/Chrome-format CPU profile with a 500ms
// blocking event in LoginScreen.useEffect + hot functions. ---
const cpuprofile = {
  startTime: 1754230000000,
  endTime: 1754230006000,
  nodes: [
    { id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: 0, columnNumber: 0 }, hitCount: 0, children: [2, 3] },
    { id: 2, callFrame: { functionName: 'LoginScreen', url: 'src/screens/LoginScreen.tsx', lineNumber: 21, columnNumber: 2 }, hitCount: 120, children: [4] },
    { id: 3, callFrame: { functionName: 'FlatList.renderItem', url: 'src/screens/LoginScreen.tsx', lineNumber: 64, columnNumber: 4 }, hitCount: 40, children: [] },
    { id: 4, callFrame: { functionName: 'useEffect', url: 'src/screens/LoginScreen.tsx', lineNumber: 88, columnNumber: 2 }, hitCount: 300, children: [5] },
    { id: 5, callFrame: { functionName: 'heavySyncWork', url: 'src/utils/perf.ts', lineNumber: 12, columnNumber: 2 }, hitCount: 300, children: [] },
  ],
  samples: [],
  timeDeltas: [],
  endTime: 1754230006000,
};
// 500ms blocking event: sample index 0..249 at 2ms intervals inside
// heavySyncWork, then normal frames.
const sampleIds = [];
const deltas = [];
for (let i = 0; i < 250; i++) {
  sampleIds.push(5); // heavySyncWork — JS thread stuck here
  deltas.push(2);    // 2ms each = 500ms contiguous
}
for (let i = 0; i < 250; i++) {
  sampleIds.push(i % 2 === 0 ? 2 : 3); // normal UI frames
  deltas.push(2);
}
cpuprofile.samples = sampleIds;
cpuprofile.timeDeltas = deltas;
fs.writeFileSync(path.join(APP, 'app.cpuprofile'), JSON.stringify(cpuprofile, null, 2));
console.log('wrote app.cpuprofile (' + (JSON.stringify(cpuprofile).length / 1024).toFixed(1) + ' KB)');

// --- 2. telemetry/: Sentry-export-style crash events over 24h, with a
// spike hour at 03:00 (3.2 / 1k sessions, baseline ~0.9) for the anomaly
// beat, plus the healthy surrounding hours. ---
fs.mkdirSync(TELEMETRY, { recursive: true });
const now = 1754230000000; // ~2025-08-03
const HOUR = 3600 * 1000;
const events = [];
// Baseline: ~1-2 crashes/hour across 23 hours (24h window).
for (let h = 0; h < 23; h++) {
  const hourStart = now - (23 - h) * HOUR;
  const count = h === 19 ? 8 : 1 + (Math.random() < 0.4 ? 1 : 0); // spike at h=19 (03:00)
  for (let i = 0; i < count; i++) {
    events.push({
      event_id: 'sentry-' + h + '-' + i,
      timestamp: new Date(hourStart + i * 300000).toISOString(),
      level: 'error',
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Attempted to use an object of type View as an RCTView',
            stacktrace: { frames: [{ filename: 'src/screens/LoginScreen.tsx', lineno: 88 }] },
          },
        ],
      },
      release: '1.0.0',
      contexts: { os: { name: 'iOS' }, session: { started: new Date(hourStart).toISOString() } },
    });
  }
}
fs.writeFileSync(path.join(TELEMETRY, 'sentry-events.json'), JSON.stringify(events, null, 2));
console.log('wrote telemetry/sentry-events.json (' + events.length + ' events)');

// --- 3. A handful of Crashlytics-style events for the second ingest path. ---
const crashlytics = [];
for (let h = 0; h < 6; h++) {
  crashlytics.push({
    crash_id: 'cr-' + h,
    occurred_at: new Date(now - h * HOUR).toISOString(),
    platform: 'Android',
    exception: 'TypeError: Cannot read property "email" of undefined',
    session: { app_version: '1.0.0' },
  });
}
fs.writeFileSync(path.join(TELEMETRY, 'crashlytics.json'), JSON.stringify(crashlytics, null, 2));
console.log('wrote telemetry/crashlytics.json (' + crashlytics.length + ' events)');

console.log('fixtures done');
