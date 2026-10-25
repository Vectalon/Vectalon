const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatPilotReport, serializePilotReport } = require('./pilot-report.cjs');
const evidence = require('../../docs/release-roadmap/evidence/cart-3b-paired-pilot-2026-10-20.json');

test('structured repair separates valid envelopes and higher rubric scores from failed app verification', () => {
  const report = require('../../docs/release-roadmap/evidence/structured-repair-2026-10-25.json');
  assert.equal(report.kind, 'bounded-structured-repair-diagnostic');
  assert.equal(report.settings.outputFormat, 'files-json');
  assert.equal(report.runs.filter(row => row.status === 'not-run').length, 2);
  const row = report.runs[0];
  assert.equal(row.status, 'failed');
  assert.equal(row.identityMatched, true);
  assert.equal(row.nativeCalls.length, 2);
  assert.deepEqual(row.result.attempts.map(a => [a.kind, a.status, a.verification.status, a.selected]),
    [['initial', 'parsed', 'failed', true], ['repair', 'parsed', 'failed', false]]);
  assert.ok(row.result.attempts[1].guardrails > row.result.attempts[0].guardrails);
  for (const call of row.nativeCalls) {
    assert.equal(call.grammarSchemaSha256, report.resourceProtocol.grammarSchemaSha256);
    assert.equal(call.artifact.sha256, report.expectedArtifactSha256);
    assert.equal(call.stopReason, 'stopGenerationTrigger');
  }
  for (const audit of report.outputAudits) {
    assert.equal(audit.strictJson, true);
    assert.equal(audit.fileEnvelopeValid, true);
    assert.equal(audit.parsedExactlyMatchesStrict, true);
    assert.equal(audit.strictFilesSha256, audit.parsedFilesSha256);
  }
  assert.ok(row.verifications.every(v => !v.checks.typecheck.ok && !v.checks.tests.ok));
  for (const key of ['generatedArtifacts', 'rawResponses', 'stdout', 'stderr']) assert.ok(!JSON.stringify(report).includes(`"${key}"`));
});

test('guarded repair retains failed initial, rejected invalid repair and actual call observations', () => {
  const report = require('../../docs/release-roadmap/evidence/guided-repair-2026-10-24.json');
  assert.equal(report.kind, 'bounded-guided-repair-diagnostic');
  assert.equal(report.resourceProtocol.rowLimit, 1);
  assert.equal(report.runs.filter(row => row.status === 'not-run').length, 2);
  const row = report.runs[0];
  assert.equal(row.status, 'failed');
  assert.equal(row.identityMatched, true);
  assert.equal(row.resources.timeoutMs, 360000);
  assert.ok(row.durationMs < 360000);
  const [initial, repair] = row.result.attempts;
  assert.equal(initial.kind, 'initial');
  assert.equal(initial.verification.status, 'failed');
  assert.equal(initial.selected, true);
  assert.equal(repair.kind, 'repair');
  assert.equal(repair.status, 'invalid');
  assert.equal(repair.selected, false);
  assert.equal(repair.verification, undefined);
  assert.deepEqual(row.nativeCalls.map(call => [call.status, call.temperature]), [['response', 0.2], ['response', 0]]);
  for (const call of row.nativeCalls) {
    assert.equal(call.artifact.sha256, report.expectedArtifactSha256);
    assert.equal(call.stopReason, 'eogToken');
    assert.equal(call.maxTokens, 2048);
  }
  assert.equal(row.checks.typecheck.ok, false);
  assert.equal(row.checks.tests.ok, false);
  assert.equal(row.verifications.length, 1);
  assert.equal(row.verifications[0].candidateArtifacts[0].sha256, row.candidateArtifacts[0].sha256);
  assert.ok(formatPilotReport(report).includes('| vectalon-verified-repair | 0/3 | 0 | 0/1 | 0 | 2 recorded; remainder unrecorded |'));
  for (const key of ['generatedArtifacts', 'rawResponses', 'stdout', 'stderr']) assert.ok(!JSON.stringify(report).includes(`"${key}"`));
});

test('output-decoding diagnostic preserves source-free parser identity and the failed unpaired outcome', () => {
  const report = require('../../docs/release-roadmap/evidence/output-decoding-2026-10-24.json');
  assert.equal(report.kind, 'bounded-guided-output-diagnostic');
  assert.equal(report.resourceProtocol.rowLimit, 1);
  assert.equal(report.runs.filter(row => row.status === 'not-run').length, 5);
  const guided = report.runs[1];
  assert.equal(guided.condition, 'vectalon');
  assert.equal(guided.status, 'failed');
  assert.equal(guided.identityMatched, true);
  assert.equal(guided.result.attempts.length, 1);
  assert.equal(guided.result.attempts[0].providerCalls.length, 1);
  assert.equal(guided.checks.typecheck.ok, false);
  assert.equal(guided.checks.tests.ok, false);
  const audit = report.outputAudit;
  assert.equal(audit.strictWholeResponseJson, false);
  assert.equal(audit.strictFencedJson, true);
  assert.equal(audit.parsedEqualsStrictFenced, true);
  assert.equal(audit.strictFilesSha256, audit.parsedFilesSha256);
  assert.equal(audit.strictFileCount, 1);
  assert.equal(audit.parsedFileCount, 1);
  assert.match(audit.rawSha256, /^[a-f0-9]{64}$/);
  for (const key of ['generatedArtifacts', 'rawResponses', 'stdout', 'stderr']) assert.ok(!JSON.stringify(report).includes(`"${key}"`));
  assert.ok(formatPilotReport(report).includes('| vectalon | 3 | 0 | 1 | 2 | 0/1 | 0/1 |'));
});

test('bounded resource reports retain stops and unstarted rows without implying qualification', () => {
  const report = { resourceProtocol: { routing: 'direct native in both conditions', rowLimit: 2, reserveBytes: 2147483648 },
    runs: [{ condition: 'task-only', repetition: 1, status: 'resource-aborted', resourceStopReason: 'memory-reserve',
      resources: { memoryMetric: 'os-free', minimumSampledAvailableBudgetBytes: 1024, maximumSampledRssBytes: 2048 } },
      { condition: 'vectalon', repetition: 1, status: 'not-run' }] };
  const text = formatPilotReport(report);
  assert.ok(text.includes('| task-only | 1 | os-free | 1024 | 2048 | unrecorded | memory-reserve |'));
  assert.ok(text.includes('| vectalon | 1 | 0 | 0 | 1 |'));
  assert.ok(text.includes('not peak GPU/RAM or sustained-safety evidence'));
  assert.ok(text.indexOf('## Bounded resource protocol') < text.indexOf('## Outcome matrix'));
});

test('original resource pair retains adapter failure separately from real task-only output', () => {
  const report = require('../../docs/release-roadmap/evidence/bounded-pair-adapter-failure-2026-10-24.json');
  const [baseline, guided] = report.runs;
  assert.equal(baseline.status, 'failed');
  assert.equal(baseline.identityMatched, true);
  assert.equal(baseline.result.attempts[0].providerCalls.length, 1);
  assert.equal(baseline.checks.typecheck.ok, false);
  assert.equal(guided.result.attempts[0].status, 'error');
  assert.equal(guided.result.attempts[0].artifact, undefined);
  assert.equal(guided.result.attempts[0].localContext, undefined);
  assert.equal(report.runs.filter(row => row.status === 'not-run').length, 4);
  assert.match(baseline.candidateArtifacts[0].sha256, /^[a-f0-9]{64}$/);
  for (const key of ['generatedArtifacts', 'stdout', 'stderr', 'rawResponses']) assert.ok(!JSON.stringify(report).includes(`"${key}"`));
});

test('corrected resource pair retains two real failures without hiding four unstarted rows', () => {
  const report = require('../../docs/release-roadmap/evidence/bounded-pair-2026-10-24.json');
  const [baseline, guided] = report.runs;
  assert.equal(report.kind, 'bounded-one-app-resource-pair');
  assert.equal(report.runs.length, 6);
  assert.equal(report.runs.filter(row => row.status === 'not-run').length, 4);
  for (const row of [baseline, guided]) {
    assert.equal(row.status, 'failed');
    assert.equal(row.identityMatched, true);
    assert.equal(row.result.attempts.length, 1);
    const attempt = row.result.attempts[0];
    assert.equal(attempt.kind, 'initial');
    assert.equal(attempt.stopReason, 'eogToken');
    assert.equal(attempt.artifact.sha256, report.expectedArtifactSha256);
    assert.equal(attempt.providerCalls.length, 1);
    assert.ok(attempt.localContext.inputTokens + 2048 + 256 <= attempt.localContext.contextSize);
    assert.ok(row.resources.minimumSampledAvailableBudgetBytes >= row.resources.reserveBytes);
  }
  assert.equal(baseline.result.attempts[0].status, 'parsed');
  assert.equal(baseline.checks.typecheck.ok, false);
  assert.equal(guided.result.attempts[0].status, 'invalid');
  assert.equal(guided.checks, undefined);
  const text = formatPilotReport(report);
  assert.ok(text.includes('| task-only | 3 | 0 | 1 | 2 | 0/1 | 0/1 |'));
  assert.ok(text.includes('| vectalon | 3 | 0 | 1 | 2 | 0/0 | 0/0 |'));
  for (const key of ['generatedArtifacts', 'stdout', 'stderr', 'rawResponses']) assert.ok(!JSON.stringify(report).includes(`"${key}"`));
});

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

test('retains all six counter stress failures and distinguishes skipped checks', () => {
  const report = require('../../docs/release-roadmap/evidence/counter-stress-comparison-2026-10-24.json');
  assert.equal(report.runs.length, 6);
  assert.ok(report.runs.every(row => row.status === 'failed' && row.identityMatched &&
    row.result.attempts.length === 1 && row.result.attempts[0].kind === 'initial'));
  const text = formatPilotReport(report);
  assert.ok(text.includes('| task-only | 3 | 0 | 3 | 0 | 3/3 | 0/3 |'));
  assert.ok(text.includes('| task-relevant | 3 | 0 | 3 | 0 | 0/2 | 0/2 |'));
  assert.ok(text.includes('skipped | skipped | initial: invalid'));
  const serialized = serializePilotReport(report);
  for (const key of ['generatedArtifacts', 'rawResponses', 'stdout', 'stderr']) {
    assert.ok(!serialized.includes(`"${key}"`));
  }
});

test('retains failed verified counter repairs without promoting extra calls to improvement', () => {
  const report = require('../../docs/release-roadmap/evidence/counter-verified-repair-2026-10-24.json');
  assert.equal(report.runs.length, 6);
  assert.ok(report.runs.every(row => row.status === 'failed' && row.identityMatched && row.result.attempts.length === 2));
  const text = formatPilotReport(report);
  assert.ok(text.includes('| task-only | 0/3 | 0 | 0/3 | 0 | 6 |'));
  assert.ok(text.includes('| task-relevant | 0/3 | 1 | 0/2 | 0 | 6 |'));
  assert.ok(text.includes('initial: invalid / unrecorded; parse-retry: parsed / failed'));
  const attempts = report.runs.flatMap(row => row.result.attempts);
  assert.equal(attempts.filter(attempt => attempt.kind === 'repair' && attempt.selected).length, 0);
  assert.equal(attempts.reduce((sum, attempt) => sum + attempt.providerCalls.length, 0), 12);
});

test('does not equate compilation gains in sampling controls with task improvement', () => {
  const report = require('../../docs/release-roadmap/evidence/counter-sampling-2026-10-24.json');
  assert.equal(report.runs.length, 6);
  assert.ok(report.runs.every(row => row.status === 'failed' && row.identityMatched));
  assert.equal(new Set(report.runs.map(row => row.result.attempts[0].requestDigest)).size, 1);
  const text = formatPilotReport(report);
  assert.ok(text.includes('| repeat-default | 3 | 0 | 3 | 0 | 1/3 | 0/3 |'));
  assert.ok(text.includes('| repeat-off | 3 | 0 | 3 | 0 | 3/3 | 0/3 |'));
});

test('retains the isolated 7B app-check pass without implying release qualification', () => {
  const report = require('../../docs/release-roadmap/evidence/counter-7b-comparison-2026-10-24.json');
  assert.equal(report.model, 'qwen2.5-coder-7b');
  assert.equal(report.runs.filter(row => row.status === 'passed').length, 1);
  const text = formatPilotReport(report);
  assert.ok(text.includes('| task-only | 3 | 0 | 3 | 0 | 3/3 | 0/3 |'));
  assert.ok(text.includes('| task-relevant | 3 | 1 | 2 | 0 | 3/3 | 1/3 |'));
  assert.ok(text.includes('| 94.4 | unscored | not-run |'));
  assert.ok(text.includes('does not meet the release'));
  assert.equal(report.independentRecheck.byteIdenticalCandidate, true);
  assert.equal(report.independentRecheck.checks.tests.passedTests, 38);
});

test('keeps resource-interrupted app trials distinct from completed model failures', () => {
  const evidence = require('../../docs/release-roadmap/evidence/one-app-7b-interrupted-2026-10-24.json');
  assert.equal(evidence.execution.plannedRuns, 18);
  assert.equal(evidence.execution.completedRuns + evidence.execution.interruptedRuns + evidence.execution.notStartedRuns, 18);
  const partial = evidence.reports[0];
  assert.equal(partial.runs.filter(row => row.status === 'failed').length, 1);
  assert.equal(partial.runs.filter(row => row.status === 'running').length, 1);
  assert.ok(formatPilotReport(partial).includes('| vectalon | 3 | 0 | 0 | 3 | 0/0 | 0/0 |'));
  assert.equal(evidence.execution.nativeVerification, 'not-run');
  assert.ok(evidence.preflights.every(report => report.runs.every(row => row.status === 'not-run')));
  const probe = evidence.preflights.find(report => report.task.id === 'current-session').nativeProbePreflight;
  assert.equal(probe.negative.tests.ok, false);
  assert.equal(probe.positive.tests.ok, true);
  assert.ok(probe.method.includes('NOT native build/device evidence'));
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

test('separates initial failure, repair candidate, selected outcome and observed calls', () => {
  const report = { verificationMode: 'both conditions: bounded verifier', runs: [
    { condition: 'task-only', status: 'passed', identityMatched: true,
      checks: { typecheck: { ok: true }, tests: { ok: true } }, result: { attempts: [
        { kind: 'initial', verification: { status: 'failed' }, providerCalls: [{}] },
        { kind: 'repair', verification: { status: 'passed' }, providerCalls: [{}] },
      ] } },
    { condition: 'task-only', status: 'failed', identityMatched: true, result: { attempts: [
      { kind: 'initial', status: 'invalid', providerCalls: [{}] },
      { kind: 'parse-retry', status: 'invalid', providerCalls: [{}] },
    ] } },
    { condition: 'task-relevant', status: 'not-run' },
  ] };
  const text = formatPilotReport(report);
  assert.ok(text.includes('| task-only | 0/2 | 1 | 1/1 | 1 | 4 |'));
  assert.ok(text.includes('| task-relevant | 0/1 | 0 | 0/0 | 0 | unrecorded |'));
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
  assert.ok(formatPilotReport({ settings: { requiredTool: 'propose_edits' }, runs: [] }).includes('required tool arguments: propose_edits'));
  assert.ok(formatPilotReport({ settings: { anchorMode: 'unique-source-lines' }, runs: [] }).includes('Anchor selection: unique-source-lines'));
  assert.ok(formatPilotReport({ conditionSettings: { 'vectalon-edits': { requiredTool: 'propose_edits', anchorMode: 'top-level-source-blocks', maxTokens: 2048, maxAttempts: 1 } }, runs: [] }).includes('Condition vectalon-edits: top-level-source-blocks; required tool: propose_edits'));
  assert.ok(text.includes('Edit application'));
  assert.ok(text.includes('not-run | applied |'));
  assert.ok(text.includes('| vectalon-edits | 1 | 0 |'));
  assert.ok(!text.includes('PRIVATE_SOURCE'));
});
