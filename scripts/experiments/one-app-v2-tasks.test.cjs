const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

test('v2 freezes new feature/fix/review tasks and keeps acceptance/reference source out of both requests', async () => {
  const { freeze, taskDefinition } = require('./one-app-v2-tasks.cjs');
  const read = file => execFileSync('git', ['show', `${freeze.appRevision}:apps/website/demo/login-app/${file}`], { encoding: 'utf8' });
  assert.deepEqual(freeze.tasks, ['cart-distinct-count', 'catalog-get-isolation', 'order-input-review']);
  assert.equal(freeze.model, 'qwen2.5-coder-7b');
  assert.equal(freeze.artifactSha256, require('./one-app-evaluation-7b.json').artifactSha256);
  assert.equal(freeze.repetitions, 3);
  assert.equal(freeze.timeoutMs, 180000);
  assert.deepEqual(freeze.conditions, ['task-only', 'vectalon']);
  assert.deepEqual(freeze.settings, { temperature: 0.2, maxTokens: 2048, maxAttempts: 1, providerCallLimit: 1 });
  assert.deepEqual(Object.keys(freeze.inputs).sort(), ['one-app-v2-tasks.cjs', 'cart-distinct-count.acceptance.tsx', 'catalog-get-isolation.acceptance.tsx', 'one-app-tasks.cjs'].sort());
  for (const [file, expected] of Object.entries(freeze.inputs)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname, file))).digest('hex'), expected, file);
  }
  assert.throws(() => taskDefinition('orders-refresh-race', read), /Unknown v2 evaluation task/);
  const { createModelGenerate } = require('../../packages/rn/dist/bench/modelGenerate.js');
  const kinds = [];
  for (const id of freeze.tasks) {
    const task = taskDefinition(id, read);
    kinds.push(task.kind);
    if (task.kind !== 'review') assert.notEqual(task.positiveControl, read(task.target));
    else {
      assert.notEqual(task.proposal, read(task.proposalPath));
      assert.ok(require('./one-app-tasks.cjs').reviewImportsAllowed(task.positiveControl,
        require('../../apps/website/demo/login-app/node_modules/typescript')));
    }
    assert.ok(!task.fixturePaths.some(file => /acceptance|__tests__/.test(file)));
    for (const promptMode of freeze.conditions) {
      let request;
      const generate = createModelGenerate({ promptMode, ...freeze.settings,
        modelRouter: { generate: async value => { request = value; return { content: '', provider: 'local' }; } } });
      await generate({ specVersion: 1, id, title: id, suite: task.kind, scaffoldable: false,
        prompt: task.prompt, fixtures: { ...Object.fromEntries(task.fixturePaths.map(file => [file, read(file)])), ...task.extraFixtures },
        expect: { files: [task.target], behaviors: [task.prompt] }, axes: ['adherence', 'guardrails'],
        correctness: { tests: true, typecheck: true, lint: false } });
      const serialized = JSON.stringify(request);
      for (const source of [task.positiveControl, task.acceptance].filter(Boolean)) {
        assert.ok(!serialized.includes(JSON.stringify(source).slice(1, -1)));
      }
      assert.ok(!serialized.includes('v2_acceptance_canary'));
    }
  }
  assert.deepEqual(kinds, ['feature', 'fix', 'review']);
});

test('retained v2 comparison preserves all first attempts, equal declared caps and negative results', () => {
  const evidence = require('../../docs/release-roadmap/evidence/one-app-v2-comparison-2026-10-25.json');
  assert.equal(evidence.plannedRows, 18);
  assert.equal(evidence.completedRows, 18);
  assert.equal(evidence.newModelCalls, 18);
  assert.equal(evidence.nativeDeviceChecks, 0);
  assert.equal(evidence.reliableImprovementEstablished, false);
  assert.deepEqual(evidence.reports.map(report => report.runs.filter(row => row.status === 'passed').length), [0, 6, 0]);
  for (const report of evidence.reports) {
    assert.equal(report.runs.length, 6);
    assert.equal(report.negativeControl.tests.ok, false);
    assert.equal(report.positiveControl.typecheck.ok, true);
    assert.equal(report.positiveControl.tests.ok, true);
    assert.deepEqual(report.settings, require('./one-app-evaluation-v2-7b.json').settings);
    assert.equal(report.resourceProtocol.rowLimit, 6);
    for (const row of report.runs) {
      assert.equal(row.identityMatched, true);
      assert.equal(row.nativeCalls.length, 1);
      assert.equal(row.result.attempts.length, 1);
      assert.equal(row.result.attempts[0].kind, 'initial');
      assert.ok(!row.resourceStopReason);
    }
    const matrix = require('./pilot-report.cjs').formatPilotReport(report);
    assert.ok(matrix.includes('| task-only | failed | 3 | 0 | 0/0 |'));
    assert.ok(matrix.includes('| vectalon | failed | 3 | 0 | 0/0 |'));
  }
  const fix = evidence.reports[1];
  assert.ok(fix.runs.every(row => row.result.axes.adherence === 0 && row.result.axes.guardrails === 1));
  for (const key of ['generatedArtifacts', 'rawResponses', 'stdout', 'stderr', 'content']) {
    assert.ok(!JSON.stringify(evidence).includes(`"${key}":`), key);
  }
  assert.ok(evidence.candidateEvidence.every(row => row.responseFingerprints.length === 1));
});

test('supplemental native probe binds the unchanged accepted candidate without promoting qualification', () => {
  const native = require('../../docs/release-roadmap/evidence/catalog-native-2026-10-25.json');
  const comparison = require('../../docs/release-roadmap/evidence/one-app-v2-comparison-2026-10-25.json');
  const candidate = comparison.candidateEvidence.find(row => row.task === native.task && row.condition === native.condition && row.repetition === native.repetition);
  assert.equal(native.candidateSha256, candidate.files[0].sha256);
  assert.equal(native.candidateModified, false);
  assert.equal(native.newModelCalls, 0);
  assert.equal(native.qualified, false);
  assert.equal(native.reliableImprovementEstablished, false);
  assert.equal(native.adherence, 0);
  assert.equal(native.observations[0].checks.filter(check => !check.passed).length, 5);
  assert.ok(native.observations.slice(1).every(row => row.checks.every(check => check.passed)));
  assert.equal(native.builds[1].usedForRuntimeEvidence, false);
  for (const [file, expected] of [['catalog-isolation.native.tsx', native.probeSha256], ['catalog-isolation.probe.acceptance.tsx', native.probeTestSha256]]) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname, file))).digest('hex'), expected);
  }
});
