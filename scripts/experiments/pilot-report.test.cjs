const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatPilotReport, serializePilotReport } = require('./pilot-report.cjs');
const evidence = require('../../docs/release-roadmap/evidence/cart-3b-paired-pilot-2026-10-20.json');

test('recorded repair retains historical initial separately and rejects unchanged repair despite delivered feedback', () => {
  const report = require('../../docs/release-roadmap/evidence/react-recorded-repair-2026-10-25.json');
  const row = report.runs[0];
  assert.equal(report.kind, 'recorded-candidate-assisted-repair');
  assert.equal(report.resourceProtocol.maxNativeCalls, 1);
  assert.equal(row.resources.timeoutMs, 180000);
  assert.equal(row.nativeCalls.length, 1);
  assert.equal(row.nativeCalls[0].kind, 'repair');
  const [initial, repair] = row.result.attempts;
  assert.equal(initial.origin, 'recorded-candidate-recheck');
  assert.deepEqual(initial.providerCalls, []);
  assert.equal(initial.verification.status, 'failed');
  assert.equal(initial.selected, true);
  assert.equal(repair.kind, 'repair');
  assert.equal(repair.unchangedEdits, 1);
  assert.equal(repair.editApplication, 'rejected');
  assert.equal(repair.selected, false);
  assert.equal(repair.repairBaseSha256, report.recordedInitial.candidateSha256);
  assert.equal(report.outputAudit.selectedCandidateSha256, report.recordedInitial.candidateSha256);
  assert.equal(report.runs.filter(row => row.status === 'not-run').length, 2);
  assert.equal(report.nativeRequestAudit.newModelCalls, 0);
  assert.equal(report.nativeRequestAudit.nativeRequestSha256, row.nativeCalls[0].requestSha256);
  assert.equal(report.nativeRequestAudit.repairRequestDigest, repair.requestDigest);
  assert.equal(report.nativeRequestAudit.acceptanceAndReferenceExcluded, true);
  assert.equal(report.nativeRequestAudit.scopedCompilerFeedbackPresent, true);
  assert.match(formatPilotReport(report), /1491\/2048\/3840\/128/);
  for (const key of ['generatedArtifacts', 'rawResponses', 'stdout', 'stderr']) assert.ok(!JSON.stringify(report).includes(`"${key}"`));
});

test('bounded scoped repair records a rejected initial without claiming an unspent repair', () => {
  const report = require('../../docs/release-roadmap/evidence/react-async-repair-2026-10-25.json');
  const prior = require('../../docs/release-roadmap/evidence/react-async-edits-2026-10-25.json');
  const row = report.runs[0];
  assert.equal(report.kind, 'bounded-scoped-edit-repair');
  assert.equal(report.controlSourceSha256, prior.controlSourceSha256);
  assert.equal(report.acceptanceSha256, prior.acceptanceSha256);
  assert.equal(report.resourceProtocol.maxNativeCalls, 2);
  assert.equal(row.resources.timeoutMs, 360000);
  assert.equal(row.nativeCalls.length, 1);
  assert.equal(row.result.attempts.length, 1);
  assert.equal(row.result.attempts[0].kind, 'initial');
  assert.equal(row.result.attempts[0].editApplication, 'rejected');
  assert.equal(row.result.attempts[0].selected, false);
  assert.equal(row.result.attempts[0].verification, undefined);
  assert.equal(row.checks.tests.skipped, true);
  assert.equal(report.outputAudit.composedModuleDiagnostic.reasonCode, 'VarRedeclaration');
  assert.equal(report.outputAudit.observedRepairCalls, 0);
  assert.equal(report.runs.filter(row => row.status === 'not-run').length, 2);
  for (const key of ['generatedArtifacts', 'rawResponses', 'stdout', 'stderr']) assert.ok(!JSON.stringify(report).includes(`"${key}"`));
});

test('async scoped delivery preserves exact application separately from compiler and app failure', () => {
  const report = require('../../docs/release-roadmap/evidence/react-async-edits-2026-10-25.json');
  const prior = require('../../docs/release-roadmap/evidence/react-async-control-2026-10-25.json');
  const row = report.runs[0];
  assert.equal(report.kind, 'bounded-scoped-edit-diagnostic');
  assert.equal(report.controlSourceSha256, prior.controlSourceSha256);
  assert.equal(report.acceptanceSha256, prior.acceptanceSha256);
  assert.equal(report.resourceProtocol.rowLimit, 1);
  assert.equal(report.runs.filter(row => row.status === 'not-run').length, 2);
  assert.ok(report.runs.every(row => row.condition === 'vectalon-edits'));
  assert.equal(report.outputAudit.strictToolEnvelope, true);
  assert.equal(report.outputAudit.edits[0].block, 'block-2');
  assert.equal(row.identityMatched, true);
  assert.equal(row.nativeCalls.length, 1);
  assert.equal(row.nativeCalls[0].grammarSchemaSha256, report.resourceProtocol.grammarSchemaSha256);
  assert.equal(row.result.attempts[0].editApplication, 'applied');
  assert.equal(row.result.attempts[0].status, 'parsed');
  assert.equal(row.status, 'failed');
  assert.equal(row.checks.typecheck.ok, false);
  assert.equal(row.checks.tests.ok, false);
  assert.deepEqual(report.outputAudit.compilerDiagnosticCodes.sort(), ['TS2304', 'TS2554']);
  assert.match(report.outputAudit.testSummary, /5 failed, 34 passed, 39 total/);
  for (const key of ['generatedArtifacts', 'rawResponses', 'stdout', 'stderr']) assert.ok(!JSON.stringify(report).includes(`"${key}"`));
});

test('async guidance control retains behavior failure and malformed delivery as separate failures', () => {
  const report = require('../../docs/release-roadmap/evidence/react-async-control-2026-10-25.json');
  const [base, guided] = report.runs;
  assert.equal(report.task.id, 'delayed-label-v1');
  assert.deepEqual([base.condition, guided.condition], ['task-only', 'task-relevant']);
  assert.equal(report.runs.filter(row => row.status === 'not-run').length, 4);
  assert.equal(report.negativeControl.typecheck.ok, true);
  assert.equal(report.negativeControl.tests.ok, false);
  assert.equal(report.positiveControl.tests.ok, true);
  for (const row of [base, guided]) {
    assert.equal(row.status, 'failed');
    assert.equal(row.identityMatched, true);
    assert.equal(row.nativeCalls.length, 1);
    assert.equal(row.result.attempts.length, 1);
    assert.equal(row.result.attempts[0].kind, 'initial');
  }
  assert.equal(base.checks.typecheck.ok, true);
  assert.equal(base.checks.tests.ok, false);
  assert.match(report.outputAudits[0].testSummary, /5 failed, 34 passed, 39 total/);
  assert.equal(guided.result.attempts[0].status, 'invalid');
  assert.equal(guided.checks.tests.skipped, true);
  assert.equal(report.outputAudits[1].jsonEnvelopeValidAfterFenceRemoval, false);
  assert.deepEqual(report.outputAudits[1].candidates, []);
  assert.ok(report.preflightHistory.every(row => row.modelCalls === 0));
  for (const key of ['generatedArtifacts', 'rawResponses', 'stdout', 'stderr']) assert.ok(!JSON.stringify(report).includes(`"${key}"`));
  assert.match(formatPilotReport(report), /task-relevant \| 3 \| 0 \| 1 \| 2/);
});

test('fresh orders pair retains heap failure, stale-state assertions and four pending rows without claiming improvement', () => {
  const report = require('../../docs/release-roadmap/evidence/orders-refresh-pair-2026-10-25.json');
  assert.equal(report.evaluationLane, 'fresh-7b');
  assert.equal(report.task.id, 'orders-refresh-race');
  assert.equal(report.negativeControl.typecheck.ok, true);
  assert.equal(report.negativeControl.tests.ok, false);
  assert.equal(report.positiveControl.typecheck.ok, true);
  assert.equal(report.positiveControl.tests.ok, true);
  assert.equal(report.runs.filter(row => row.status === 'not-run').length, 4);
  for (const row of report.runs.slice(0, 2)) {
    assert.equal(row.status, 'failed');
    assert.equal(row.identityMatched, true);
    assert.equal(row.nativeCalls.length, 1);
    assert.equal(row.result.attempts.length, 1);
    assert.equal(row.result.attempts[0].kind, 'initial');
    assert.equal(row.checks.typecheck.ok, true);
    assert.equal(row.checks.tests.ok, false);
    assert.equal(row.result.axes.adherence, 1);
    assert.ok(row.result.axes.guardrails < 1);
  }
  assert.equal(report.runs[0].checks.tests.exitCode, null);
  assert.equal(report.outputAudits[0].testProcessHeapExhausted, true);
  assert.equal(report.runs[1].checks.tests.exitCode, 1);
  assert.match(report.outputAudits[1].testSummary, /8 failed, 32 passed, 40 total/);
  for (const audit of report.outputAudits) assert.match(audit.responseSha256, /^[a-f0-9]{64}$/);
  for (const key of ['generatedArtifacts', 'rawResponses', 'stdout', 'stderr']) assert.ok(!JSON.stringify(report).includes(`"${key}"`));
  const markdown = formatPilotReport(report);
  assert.match(markdown, /task-only \| 3 \| 0 \| 1 \| 2/);
  assert.match(markdown, /vectalon \| 3 \| 0 \| 1 \| 2/);
});

test('native probe matches accepted replay without rewriting first-attempt or reliability evidence', () => {
  const native = require('../../docs/release-roadmap/evidence/local-anchor-native-2026-10-25.json');
  const replay = require('../../docs/release-roadmap/evidence/local-anchor-replay-2026-10-25.json');
  const { readFileSync } = require('node:fs');
  const { createHash } = require('node:crypto');
  assert.equal(native.candidateSha256, replay.candidate.sha256);
  assert.equal(native.dependencyLockSha256, replay.appRecheck.dependencyLockSha256);
  assert.equal(native.probeSha256, createHash('sha256').update(readFileSync(`${__dirname}/current-session.native.tsx`)).digest('hex'));
  assert.equal(native.modelCalls, 0);
  assert.equal(native.candidateModified, false);
  assert.equal(native.firstAttemptSuccess, false);
  assert.equal(native.reliableImprovementEstablished, false);
  assert.equal(native.build.status, 'succeeded');
  assert.equal(native.build.errors, 0);
  assert.deepEqual(native.observations.map(o => [o.current, o.other, o.twoFactor]),
    [[1, 2, false], [1, 2, false], [1, 0, false], [1, 0, true], [1, 0, true], [1, 0, true]]);
  for (const key of ['protectedScreenshot', 'finalScreenshot']) {
    const bytes = readFileSync(`${__dirname}/../../docs/release-roadmap/evidence/${native.evidence[key]}`);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
});

test('local anchor replay records post-processing-assisted app success without rewriting original rejection', () => {
  const original = require('../../docs/release-roadmap/evidence/local-anchor-session-2026-10-25.json');
  const replay = require('../../docs/release-roadmap/evidence/local-anchor-replay-2026-10-25.json');
  const row = original.runs[0];
  assert.equal(row.status, 'failed');
  assert.equal(row.result.attempts[0].editApplication, 'rejected');
  assert.equal(row.checks.tests.skipped, true);
  assert.equal(original.runs.filter(row => row.status === 'not-run').length, 2);
  assert.equal(replay.rawSha256, original.outputAudit.rawSha256);
  assert.equal(replay.requestDigest, row.result.attempts[0].requestDigest);
  assert.equal(replay.nativeCalls, 0);
  assert.equal(replay.attempt.provider, 'offline-replay');
  assert.equal(replay.attempt.unchangedEdits, 1);
  assert.equal(replay.fixturesUnchanged, true);
  assert.equal(replay.appRecheck.candidateSha256, replay.candidate.sha256);
  assert.equal(replay.appRecheck.acceptanceSha256, replay.acceptanceSha256);
  assert.equal(replay.appRecheck.checks.typecheck.ok, true);
  assert.deepEqual(replay.appRecheck.tests, { passed: 36, failed: 0, skipped: 0, suites: 15 });
  assert.equal(replay.appRecheck.nativeVerification, 'not-run');
  assert.equal(replay.attempt.adherence, null);
  for (const key of ['generatedArtifacts', 'rawResponses', '_candidate', '_acceptance']) assert.ok(!JSON.stringify(replay).includes(`"${key}"`));
});

test('scoped session history retains exact application separately from malformed candidate failure', () => {
  const report = require('../../docs/release-roadmap/evidence/scoped-session-2026-10-25.json');
  assert.equal(report.kind, 'bounded-scoped-edit-diagnostic');
  assert.equal(report.task.id, 'current-session');
  const row = report.runs[0];
  assert.equal(row.status, 'failed');
  assert.equal(row.identityMatched, true);
  assert.equal(row.result.attempts[0].editApplication, 'applied');
  assert.equal(row.checks.typecheck.ok, false);
  assert.equal(row.checks.tests.ok, false);
  assert.equal(row.nativeCalls.length, 1);
  assert.equal(report.outputAudit.strictJson, true);
  assert.equal(report.outputAudit.editCount, 1);
  assert.equal(report.outputAudit.replacements[0].toBytes, 52);
  assert.ok(row.compilerDiagnosticCodes.includes('TS1005'));
  assert.equal(report.runs.filter(row => row.status === 'not-run').length, 2);
  assert.equal(report.nativeProbePreflight.negative.tests.ok, false);
  assert.equal(report.nativeProbePreflight.positive.tests.ok, true);
  for (const key of ['generatedArtifacts', 'rawResponses', 'stdout', 'stderr']) assert.ok(!JSON.stringify(report).includes(`"${key}"`));
});

test('offline syntax replay rejects the recorded response without claiming fresh inference', () => {
  const observed = require('../../docs/release-roadmap/evidence/scoped-session-2026-10-25.json');
  const replay = require('../../docs/release-roadmap/evidence/scoped-syntax-replay-2026-10-25.json');
  assert.equal(replay.nativeCalls, 0);
  assert.equal(replay.stubDeliveries, 1);
  assert.equal(replay.rawSha256, observed.outputAudit.rawSha256);
  assert.equal(replay.requestDigest, observed.runs[0].result.attempts[0].requestDigest);
  assert.equal(replay.candidateCount, 0);
  assert.equal(replay.fixturesUnchanged, true);
  assert.equal(replay.attempt.editApplication, 'rejected');
  assert.equal(replay.attempt.status, 'invalid');
  assert.equal(replay.attempt.selected, false);
  assert.equal(replay.attempt.provider, 'offline-replay');
  assert.equal(replay.attempt.artifact, undefined);
});

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

test('shows workflow gate failures separately from missing qualification evidence', () => {
  const report = { model: 'chosen-model', task: { id: 'public-control', kind: 'development-control' }, runs: [
    { condition: 'failed-lane', status: 'failed', nativeCalls: [{}] },
    { condition: 'pending-lane', status: 'not-run' },
    { condition: 'app-only', status: 'passed', identityMatched: true,
      checks: { typecheck: { ok: true }, tests: { ok: true } },
      result: { axes: { guardrails: 1, adherence: 1 } }, nativeVerification: { status: 'passed' } },
    { condition: 'rubric-failure', status: 'passed', identityMatched: true,
      checks: { typecheck: { ok: true }, tests: { ok: true } },
      result: { axes: { guardrails: 0.94, adherence: null } } },
    { condition: 'missing', status: 'passed', result: { axes: { guardrails: null, adherence: 2 } },
      checks: { tests: { ok: true, skipped: true } }, nativeVerification: { status: 'not-run' } },
    { condition: 'native-failure', status: 'passed', nativeVerification: { status: 'failed' } },
  ] };
  const text = formatPilotReport(report);
  assert.ok(text.includes('## Workflow qualification boundary'));
  assert.ok(text.includes('| failed-lane | failed | 1 | 0 | 0/0 |'));
  assert.ok(text.includes('| pending-lane | unverified | 0 | 1 | 0/0 |'));
  assert.ok(text.includes('| app-only | unverified | 0 | 0 | 1/1 |'));
  assert.ok(text.includes('| rubric-failure | failed | 1 | 0 | 0/0 |'));
  assert.ok(text.includes('| missing | unverified | 0 | 0 | 0/0 |'));
  assert.ok(text.includes('| native-failure | failed | 1 | 0 | 0/1 |'));
  assert.ok(text.includes('No automatic qualification'));
});

test('capacity refusal leaves qualification unverified while a task failure remains failed', () => {
  const text = formatPilotReport({ verificationMode: 'bounded verifier', runs: [
    { condition: 'capacity', status: 'resource-aborted', resourceStopReason: 'insufficient-memory', identityMatched: undefined,
      nativeCalls: [{ status: 'error', failureCategory: 'insufficient-memory' }],
      result: { axes: { guardrails: 0, adherence: 0 }, attempts: [{ kind: 'initial', status: 'error' }] } },
    { condition: 'task', status: 'failed', identityMatched: true,
      nativeCalls: [{ status: 'response' }],
      checks: { typecheck: { ok: false }, tests: { ok: false } } },
  ] });
  assert.ok(text.includes('| capacity | unverified | 0 | 0 | 0/0 |'));
  assert.ok(text.includes('| task | failed | 1 | 0 | 0/0 |'));
  assert.ok(text.includes('| capacity | 0/1 | 0 | 0/0 | 0 | 1 |'));
  assert.ok(text.includes('| capacity | unrecorded | resource-aborted | unrecorded | unrecorded | unrecorded | initial: error / unrecorded | unrecorded | unrecorded | unscored | unscored |'));
  assert.ok(text.includes('Capacity refusals are infrastructure errors'));
});

test('never counts a successful recorded recheck as a new first-attempt pass', () => {
  const report = { recordedInitial: { candidateSha256: 'recorded' }, verificationMode: 'assisted only', runs: [
    { condition: 'repair', identityMatched: true, status: 'passed',
      checks: { typecheck: { ok: true }, tests: { ok: true } }, result: { attempts: [
        { kind: 'initial', origin: 'recorded-candidate-recheck', verification: { status: 'passed' }, providerCalls: [] },
      ] } },
  ] };
  assert.ok(formatPilotReport(report).includes('| repair | 0/1 | 0 | 0/0 | 1 | 0 |'));
});

test('identifies the actual scorer for new runs without rewriting legacy evidence', () => {
  const hash = 'a'.repeat(64);
  assert.ok(formatPilotReport({ rubricModuleSha256: hash, runs: [] }).includes(`Scoring runtime SHA-256: ${hash}`));
  assert.ok(!formatPilotReport({ runs: [] }).includes('Scoring runtime SHA-256:'));
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
