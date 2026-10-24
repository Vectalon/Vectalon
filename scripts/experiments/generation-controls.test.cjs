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
    for (const [factory, promptMode] of [[createModelGenerate, 'task-only'], [createModelGenerate, 'vectalon'], [createModelGenerate, 'task-relevant'], [createModelEditGenerate, 'vectalon']]) {
      const requests = [];
      const generate = factory({ modelRouter: { generate: async request => { requests.push(request); return { content: '', provider: 'local' }; } },
        promptMode, temperature: 0.2, maxTokens: 2048, maxAttempts: 1, providerCallLimit: 1 });
      await generate(scenario);
      assert.equal(requests.length, 1);
      const input = JSON.stringify(requests);
      assert(!input.includes(JSON.stringify(task.positiveControl).slice(1, -1)));
      assert(!input.includes(JSON.stringify(task.acceptance).slice(1, -1)));
      if (task.priorAcceptance) assert(!input.includes(JSON.stringify(task.priorAcceptance).slice(1, -1)));
      assert.equal(requests[0].maxTokens, 2048);
      assert.equal(requests[0].providerCallLimit, 1);
      if (factory === createModelGenerate) assert.equal(requests[0].tools, undefined);
    }
  }
  assert.throws(() => controlTask('unknown'), /Unknown/);
});

test('stress control is versioned separately and does not rewrite completed counter acceptance', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { createHash } = require('node:crypto');
  const old = controlTask('batched-counter');
  const stress = controlTask('batched-counter-stress-v1');
  const prior = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/release-roadmap/evidence/batched-counter-control-2026-10-24.json'), 'utf8'));
  assert.equal(createHash('sha256').update(old.acceptance).digest('hex'), prior.acceptanceSha256);
  assert.notEqual(stress.id, old.id);
  assert.notEqual(stress.original, old.original);
  assert.equal(stress.priorAcceptance, old.acceptance);
  assert(stress.acceptance.startsWith(old.acceptance));
  assert(stress.prompt.includes('retained from earlier renders'));
});

test('verified minimal repairs exclude control answers and acceptance from both requests', async () => {
  const task = controlTask('batched-counter-stress-v1');
  for (const promptMode of ['task-only', 'task-relevant']) {
    const requests = [];
    let checks = 0;
    const generate = createModelGenerate({ promptMode, maxAttempts: 2, providerCallLimit: 1,
      modelRouter: { generate: async request => { requests.push(request); return {
        content: JSON.stringify({ files: [{ path: task.target, content: task.original }] }), provider: 'local',
      }; } }, verify: async () => ({ passed: ++checks === 2, feedback: 'Task/project tests failed. Recheck the original requirements.' }) });
    await generate({ specVersion: 1, id: task.id, suite: task.kind, title: task.id, scaffoldable: false,
      prompt: task.prompt, fixtures: { [task.target]: task.original }, expect: { files: [task.target], behaviors: [task.prompt] },
      correctness: { tests: true, typecheck: true, lint: false }, axes: ['guardrails', 'adherence'] });
    assert.equal(requests.length, 2);
    for (const request of requests) {
      const input = JSON.stringify(request);
      for (const excluded of [task.positiveControl, task.acceptance, task.priorAcceptance]) {
        assert(!input.includes(JSON.stringify(excluded).slice(1, -1)));
      }
      assert.equal(request.projectContext, 'disabled');
    }
  }
});
