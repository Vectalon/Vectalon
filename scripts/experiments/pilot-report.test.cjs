const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatPilotReport, serializePilotReport } = require('./pilot-report.cjs');
const evidence = require('../../docs/release-roadmap/evidence/cart-3b-paired-pilot-2026-10-20.json');

test('requires independent opt-in for raw responses and generated diagnostics at every depth', () => {
  const report = { runs: [{ status: 'failed', rawResponses: [{ index: 1, kind: 'initial', content: 'RAW_SECRET' }],
    result: { generatedArtifacts: [{ content: 'SOURCE_SECRET' }] },
    checks: { tests: { ok: false, stdout: 'OUT_SECRET', stderr: 'ERR_SECRET' } } }] };
  assert.ok(!serializePilotReport(report).includes('SECRET'));
  const sourceOnly = serializePilotReport(report, { includeGenerated: true });
  assert.ok(sourceOnly.includes('SOURCE_SECRET'));
  assert.ok(!sourceOnly.includes('RAW_SECRET'));
  const rawOnly = serializePilotReport(report, { includeRawResponse: true });
  assert.ok(rawOnly.includes('RAW_SECRET'));
  assert.ok(!rawOnly.includes('SOURCE_SECRET'));
  assert.ok(!rawOnly.includes('OUT_SECRET'));
  const full = JSON.parse(serializePilotReport(report, { includeGenerated: true, includeRawResponse: true }));
  assert.deepEqual(full, report);
  assert.ok(!formatPilotReport(report).includes('SECRET'));
  assert.equal(JSON.parse(serializePilotReport(report)).runs[0].status, 'failed');
});

test('retains the observed negative comparison without claiming improvement', () => {
  const text = formatPilotReport(evidence);
  assert.ok(text.includes('| task-only | 3 | 0 | 3 | 0 | 3/3 | 0/3 |'));
  assert.ok(text.includes('| vectalon | 3 | 0 | 3 | 0 | 0/3 | 0/3 |'));
  assert.ok(text.includes('not model qualification'));
});

test('does not turn missing checks, identity mismatch or partial runs into passes', () => {
  const text = formatPilotReport({ runs: [
    { condition: 'vectalon', repetition: 1, status: 'passed', identityMatched: false,
      checks: { typecheck: { ok: true }, tests: { ok: true } } },
    { condition: 'vectalon', repetition: 2, status: 'timeout' },
    { condition: 'vectalon', repetition: 3, status: 'not-run' },
  ] });
  assert.ok(text.includes('| vectalon | 3 | 0 | 2 | 1 | 1/1 | 1/1 |'));
  assert.ok(text.includes('unrecorded'));
  assert.ok(text.includes('timeout'));
  assert.ok(text.includes('mismatch'));
});

test('separates initial and repair verification and omits raw artifacts', () => {
  const text = formatPilotReport({ model: 'model|name\n<script>', runs: [{ condition: 'vectalon-verified-repair',
    repetition: 1, status: 'passed', identityMatched: true,
    checks: { typecheck: { ok: true, stdout: 'SECRET' }, tests: { ok: true } },
    result: { generatedArtifacts: [{ content: 'SECRET' }], attempts: [
      { kind: 'initial', status: 'parsed', verification: { status: 'failed' }, durationMs: 10 },
      { kind: 'repair', status: 'parsed', verification: { status: 'passed' }, durationMs: 20 },
    ] } }] });
  assert.ok(text.includes('initial: parsed / failed; repair: parsed / passed'));
  assert.ok(text.includes('| 30 |'));
  assert.ok(!text.includes('SECRET'));
  assert.ok(!text.includes('<script>'));
});

test('keeps positive and zero outcomes as counts, not qualification', () => {
  const passed = { condition: 'task-only', status: 'passed', identityMatched: true,
    checks: { typecheck: { ok: true }, tests: { ok: true } } };
  const text = formatPilotReport({ runs: [passed, { ...passed, condition: 'vectalon' }] });
  assert.ok(text.includes('| task-only | 1 | 1 | 0 | 0 | 1/1 | 1/1 |'));
  assert.ok(text.includes('| vectalon | 1 | 1 | 0 | 0 | 1/1 | 1/1 |'));
  assert.ok(formatPilotReport({ runs: [] }).includes('No runs recorded'));
});

test('does not count skipped checks or missing durations as measured', () => {
  const text = formatPilotReport({ runs: [{ condition: 'vectalon', status: 'passed', identityMatched: true,
    checks: { typecheck: { ok: true, skipped: true }, tests: { ok: true } },
    result: { attempts: [{ kind: 'initial', status: 'parsed' }] } }] });
  assert.ok(text.includes('| vectalon | 1 | 0 | 1 | 0 | 0/0 | 1/1 |'));
  assert.ok(text.includes('incomplete evidence'));
  assert.ok(text.includes('| skipped | passed | initial: parsed / unrecorded | unrecorded |'));
});

test('identifies frozen review task semantics and records whole-run time independently', () => {
  const text = formatPilotReport({ task: { id: 'order-copy-review', kind: 'review' }, appRevision: 'frozen-app',
    runs: [{ condition: 'task-only', status: 'passed', identityMatched: true, durationMs: 70,
      checks: { typecheck: { ok: true }, tests: { ok: true } },
      result: { attempts: [{ kind: 'initial', status: 'parsed', durationMs: 20 }] } }] });
  assert.ok(text.includes('workflow: review'));
  assert.ok(text.includes('app revision: frozen-app'));
  assert.ok(text.includes('a compile/runtime error is not detection'));
  assert.ok(text.includes('| 20 | 70 |'));
});

test('does not present passing app tests as guardrail or native qualification', () => {
  const text = formatPilotReport({ runs: [{ condition: 'task-only', status: 'passed', identityMatched: true,
    checks: { typecheck: { ok: true }, tests: { ok: true } },
    result: { axes: { guardrails: 17 / 18, adherence: null } } }] });
  assert.ok(text.includes('App-check passes'));
  assert.ok(text.includes('does not meet the release'));
  assert.ok(text.includes('| 94.4 | unscored | not-run |'));
});

test('shows edit acceptance separately from app verification without exposing proposed source', () => {
  const text = formatPilotReport({ settings: { toolEnvelope: true }, runs: [{ condition: 'vectalon-edits', status: 'failed',
    result: { attempts: [{ kind: 'initial', status: 'parsed', editApplication: 'applied', content: 'PRIVATE_SOURCE' }] } }] });
  assert.ok(text.includes('local tool envelope'));
  assert.ok(text.includes('Edit application'));
  assert.ok(text.includes('not-run | applied |'));
  assert.ok(text.includes('| vectalon-edits | 1 | 0 |'));
  assert.ok(!text.includes('PRIVATE_SOURCE'));
});
