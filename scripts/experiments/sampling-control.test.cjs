const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSamplingRouter } = require('./sampling-control.cjs');

test('native sampling lanes differ only in repetition penalties and preserve real observations', async () => {
  const calls = [];
  const result = { content: 'model output', modelId: 'pinned', stopReason: 'eogToken', artifact: { sha256: 'observed' } };
  const inference = async (...args) => { calls.push(args); return result; };
  const request = { projectContext: 'disabled', providerCallLimit: 1, systemPrompt: 'system', context: 'source', prompt: 'task', temperature: 0.2, maxTokens: 2048 };
  for (const disabled of [false, true]) {
    const response = await createSamplingRouter(inference, 'pinned', disabled).generate(request);
    assert.equal(response.content, result.content);
    assert.equal(response.artifact, result.artifact);
    assert.equal(response.stopReason, 'eogToken');
    assert.equal(response.providerCalls.length, 1);
  }
  assert.equal(calls[0][0], 'pinned');
  assert.equal(calls[0][1].prompt, '\nContext:\nsource\ntask');
  assert.equal(Object.hasOwn(calls[0][1], 'repeatPenalty'), false);
  assert.deepEqual(calls[1], ['pinned', { ...calls[0][1], repeatPenalty: false }]);
});

test('sampling lane refuses enrichment and never substitutes fallback text after inference failure', async () => {
  let calls = 0;
  const router = createSamplingRouter(async () => { calls++; throw new Error('native failure'); }, 'pinned', true);
  await assert.rejects(router.generate({ providerCallLimit: 1 }), /disabled/);
  assert.equal(calls, 0);
  await assert.rejects(router.generate({ projectContext: 'disabled', providerCallLimit: 1 }), /native failure/);
  assert.equal(calls, 1);
});
