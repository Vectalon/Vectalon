const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

test('paired repair freezes equal budgets and fresh feature/review inputs without verifier answers', async () => {
  const { freeze, taskDefinition } = require('./one-app-paired-repair-tasks.cjs');
  assert.deepEqual(freeze.tasks, ['cart-membership', 'order-total-review']);
  assert.deepEqual(freeze.conditions, ['task-only', 'vectalon']);
  assert.equal(freeze.repetitions, 3);
  assert.deepEqual(freeze.settings, { temperature: 0.2, maxTokens: 2048, maxAttempts: 2, providerCallLimit: 1 });
  assert.equal(freeze.timeoutMs, 360000);
  assert.equal(freeze.model, 'qwen2.5-coder-7b');
  assert.equal(freeze.artifactSha256, require('./one-app-evaluation-7b.json').artifactSha256);
  assert.deepEqual(Object.keys(freeze.inputs).sort(), ['one-app-paired-repair-tasks.cjs', 'cart-membership.acceptance.tsx', 'one-app-tasks.cjs'].sort());
  for (const [file, expected] of Object.entries(freeze.inputs)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname, file))).digest('hex'), expected, file);
  }
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../../packages/rn/dist/bench/rubric.js'))).digest('hex'), freeze.rubricModuleSha256);
  const read = file => execFileSync('git', ['show', `${freeze.appRevision}:apps/website/demo/login-app/${file}`], { encoding: 'utf8' });
  assert.throws(() => taskDefinition('cart-distinct-count', read), /Unknown paired repair task/);
  const { createModelGenerate } = require('../../packages/rn/dist/bench/modelGenerate.js');
  for (const id of freeze.tasks) {
    const task = taskDefinition(id, read);
    assert.ok(!task.fixturePaths.some(file => /acceptance|__tests__/.test(file)));
    if (task.kind !== 'review') assert.notEqual(task.positiveControl, read(task.target));
    else {
      assert.notEqual(task.proposal, read(task.proposalPath));
      assert.ok(require('./one-app-tasks.cjs').reviewImportsAllowed(task.positiveControl,
        require('../../apps/website/demo/login-app/node_modules/typescript')));
    }
    for (const promptMode of freeze.conditions) {
      const requests = [];
      const generate = createModelGenerate({ promptMode, ...freeze.settings,
        modelRouter: { generate: async value => { requests.push(value); return { content: '{', provider: 'local' }; } },
        verify: async () => { throw new Error('Invalid output must not reach verifier'); } });
      await generate({ specVersion: 1, id, title: id, suite: task.kind, scaffoldable: false,
        prompt: task.prompt, fixtures: { ...Object.fromEntries(task.fixturePaths.map(file => [file, read(file)])), ...task.extraFixtures },
        expect: { files: [task.target], behaviors: [task.prompt] }, axes: ['adherence', 'guardrails'],
        correctness: { tests: true, typecheck: true, lint: false } });
      assert.equal(requests.length, 2);
      for (const request of requests) {
        assert.equal(request.maxTokens, 2048);
        const serialized = JSON.stringify(request);
        for (const source of [task.positiveControl, task.acceptance].filter(Boolean)) {
          assert.ok(!serialized.includes(JSON.stringify(source).slice(1, -1)));
        }
        assert.ok(!serialized.includes('paired_repair_acceptance_canary'));
      }
    }
  }
});
