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
