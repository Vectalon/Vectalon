const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { freeze, taskDefinition, reviewImportsAllowed } = require('./one-app-tasks.cjs');
const ts = require('../../apps/website/demo/login-app/node_modules/typescript');
const read = file => execFileSync('git', ['show', `${freeze.appRevision}:apps/website/demo/login-app/${file}`], { encoding: 'utf8' });

test('7B replication freezes a separate identity without changing 3B inputs or budgets', () => {
  const lane = require('./one-app-evaluation-7b.json');
  assert.equal(freeze.model, 'qwen2.5-coder-3b');
  assert.equal(freeze.artifactSha256, '724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7');
  assert.equal(lane.model, 'qwen2.5-coder-7b');
  assert.equal(lane.artifactSha256, '89f120544682078148c5a86117de9af3a65c339111262f2d3ff01d80d48b14be');
  for (const key of ['appRevision', 'tasks', 'settings', 'conditions', 'repetitions', 'timeoutMs']) assert.deepEqual(lane[key], freeze[key]);
  assert.ok(lane.limitations.some(text => text.includes('not fresh held-out')));
  const fs = require('node:fs');
  const { createHash } = require('node:crypto');
  assert.deepEqual(Object.keys(lane.inputs).sort(), ['one-app-tasks.cjs', 'stock-filter.acceptance.tsx', 'current-session.acceptance.tsx', 'current-session.native.tsx', 'current-session.probe.acceptance.tsx'].sort());
  for (const [file, expected] of Object.entries(lane.inputs)) assert.equal(createHash('sha256').update(fs.readFileSync(require.resolve(`./${file}`))).digest('hex'), expected);
  assert.equal(createHash('sha256').update(fs.readFileSync(require.resolve('./one-app-evaluation.json'))).digest('hex'),
    require('../../docs/release-roadmap/evidence/one-app-frozen-2026-10-23.json').reports[0].freezeSha256);
});

test('neither paired model request includes session probe source or probe assertions', async () => {
  const fs = require('node:fs');
  const { createModelGenerate } = require('../../packages/rn/dist/bench/modelGenerate.js');
  const task = taskDefinition('current-session', read);
  for (const promptMode of ['task-only', 'vectalon']) {
    let request;
    const generate = createModelGenerate({ promptMode, maxAttempts: 1, providerCallLimit: 1,
      modelRouter: { generate: async input => { request = input; return { content: '', provider: 'local' }; } } });
    await generate({ specVersion: 1, id: task.id, title: task.id, suite: task.kind, scaffoldable: false,
      prompt: task.prompt, fixtures: Object.fromEntries(task.fixturePaths.map(file => [file, read(file)])),
      expect: { files: [task.target], behaviors: [task.prompt] }, axes: ['adherence', 'guardrails'],
      correctness: { tests: true, typecheck: true, lint: false } });
    const input = JSON.stringify(request);
    for (const file of ['current-session.native.tsx', 'current-session.probe.acceptance.tsx']) {
      assert.ok(!input.includes(JSON.stringify(fs.readFileSync(require.resolve(`./${file}`), 'utf8')).slice(1, -1)));
    }
  }
});

test('frozen feature/fix/review inputs exclude verifier answers and candidate test source', () => {
  for (const id of freeze.tasks) {
    const task = taskDefinition(id, read);
    assert.ok(!task.fixturePaths.some(file => file.includes('__tests__') || file.includes('acceptance')));
    const input = task.prompt + task.fixturePaths.map(read).join('\n') + JSON.stringify(task.extraFixtures);
    assert.ok(!input.includes(task.positiveControl));
    if (task.acceptance) assert.ok(!input.includes(task.acceptance));
    assert.ok(task.positiveControl.trim());
    if (task.kind !== 'review') assert.notEqual(task.positiveControl, read(task.target));
  }
});

test('review import policy accepts service behavior tests and rejects mocks/source inspection hooks', () => {
  assert.ok(reviewImportsAllowed(taskDefinition('order-copy-review', read).positiveControl, ts));
  for (const text of [
    "import fs from 'node:fs';", "import '../services/Other';", "require('../services/OrdersApi')",
    "import('../services/OrdersApi')", "jest.mock('../services/OrdersApi')", 'process.env.MODE',
    "eval('code')", 'new Function("return 1")', 'const value = ;',
  ]) assert.equal(reviewImportsAllowed(text, ts), false, text);
});
