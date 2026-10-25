const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

test('fresh orders task freezes separate inputs and excludes verifier/control source from both prompts', async () => {
  const { freeze, taskDefinition } = require('./one-app-fresh-tasks.cjs');
  const read = file => execFileSync('git', ['show', `${freeze.appRevision}:apps/website/demo/login-app/${file}`], { encoding: 'utf8' });
  assert.deepEqual(freeze.tasks, ['orders-refresh-race']);
  assert.equal(freeze.model, 'qwen2.5-coder-7b');
  assert.equal(freeze.repetitions, 3);
  assert.deepEqual(freeze.conditions, ['task-only', 'vectalon']);
  assert.deepEqual(freeze.settings, { temperature: 0.2, maxTokens: 2048, maxAttempts: 1, providerCallLimit: 1 });
  for (const [file, expected] of Object.entries(freeze.inputs)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname, file))).digest('hex'), expected, file);
  }
  assert.throws(() => taskDefinition('current-session', read), /Unknown fresh evaluation task/);
  const task = taskDefinition('orders-refresh-race', read);
  assert.notEqual(task.positiveControl, read(task.target));
  const { createModelGenerate } = require('../../packages/rn/dist/bench/modelGenerate.js');
  for (const promptMode of freeze.conditions) {
    let request;
    const generate = createModelGenerate({ promptMode, ...freeze.settings,
      modelRouter: { generate: async value => { request = value; return { content: '', provider: 'local' }; } } });
    await generate({ specVersion: 1, id: task.id, title: task.id, suite: task.kind, scaffoldable: false,
      prompt: task.prompt, fixtures: Object.fromEntries(task.fixturePaths.map(file => [file, read(file)])),
      expect: { files: [task.target], behaviors: [task.prompt] }, axes: ['adherence', 'guardrails'],
      correctness: { tests: true, typecheck: true, lint: false } });
    const serialized = JSON.stringify(request);
    for (const source of [task.positiveControl, task.acceptance]) assert.ok(!serialized.includes(JSON.stringify(source).slice(1, -1)));
    assert.ok(!serialized.includes('older_orders_control'));
    assert.ok(!task.fixturePaths.some(file => /acceptance|__tests__/.test(file)));
  }
});
