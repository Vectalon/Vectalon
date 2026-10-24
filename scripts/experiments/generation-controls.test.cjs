const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ids, controlTask } = require('./generation-controls.cjs');
const { createModelEditGenerate } = require('../../packages/rn/dist/bench/modelEditGenerate.js');
const { createModelGenerate } = require('../../packages/rn/dist/bench/modelGenerate.js');

test('task-only, guided full-file and block-edit requests exclude control answers and acceptance source', async () => {
  for (const id of ids) {
    const task = controlTask(id);
    assert.notEqual(task.original, task.positiveControl);
    const scenario = { specVersion: 1, id, title: id, suite: 'data-flow', scaffoldable: false,
      prompt: task.prompt, fixtures: { [task.target]: task.original }, expect: { files: [task.target], behaviors: [task.prompt] },
      correctness: { tests: true, typecheck: true, lint: false }, axes: ['guardrails', 'adherence'] };
    for (const [factory, promptMode] of [[createModelGenerate, 'task-only'], [createModelGenerate, 'vectalon'], [createModelEditGenerate, 'vectalon']]) {
      const requests = [];
      const generate = factory({ modelRouter: { generate: async request => { requests.push(request); return { content: '', provider: 'local' }; } },
        promptMode, temperature: 0.2, maxTokens: 2048, maxAttempts: 1, providerCallLimit: 1 });
      await generate(scenario);
      assert.equal(requests.length, 1);
      const input = JSON.stringify(requests);
      assert(!input.includes(JSON.stringify(task.positiveControl).slice(1, -1)));
      assert(!input.includes(JSON.stringify(task.acceptance).slice(1, -1)));
      assert.equal(requests[0].maxTokens, 2048);
      assert.equal(requests[0].providerCallLimit, 1);
      if (factory === createModelGenerate) assert.equal(requests[0].tools, undefined);
    }
  }
  assert.throws(() => controlTask('unknown'), /Unknown/);
});
