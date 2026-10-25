const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVerifiedEditGenerate } = require('./scoped-edit-repair.cjs');

const scenario = { prompt: 'Preserve the public API.', fixtures: { 'src/value.ts': 'export const value = 0;' }, expect: { files: ['src/value.ts'], behaviors: [] } };
function setup(outcomes, verified) {
  const requests = [];
  const raw = [];
  const checks = [];
  let evidence;
  const generate = createVerifiedEditGenerate(options => async (task, onAttempts) => {
    requests.push({ task, temperature: options.temperature });
    const item = outcomes.shift();
    options.onRawResponse?.('private-source', { index: 1, kind: 'initial' });
    onAttempts([{ index: 1, kind: 'initial', selected: true, status: item ? 'parsed' : 'invalid',
      taskDigest: 'original-task', requestDigest: `request-${requests.length}`, durationMs: 1,
      guardrails: item?.guardrails ?? 1, adherence: item?.adherence ?? null }]);
    return item ? [{ path: 'src/value.ts', content: item.source }] : [];
  }, { verify: async files => {
    checks.push(files);
    const value = verified.shift();
    if (value instanceof Error) throw value;
    return { passed: value, feedback: 'Compiler diagnostic only; generic test failure.' };
  }, onRawResponse: (_, attempt) => raw.push(attempt) });
  return { requests, raw, checks, run: async () => {
    const files = await generate(scenario, records => { evidence = records; });
    return { files, evidence };
  } };
}

test('repairs once against the actual candidate, retaining initial failure and separate selection', async () => {
  const s = setup([{ source: 'initial' }, { source: 'repaired' }], [false, true]);
  const { files, evidence } = await s.run();
  assert.equal(files[0].content, 'repaired');
  assert.deepEqual(evidence.map(a => [a.index, a.kind, a.verification.status, a.selected]),
    [[1, 'initial', 'failed', false], [2, 'repair', 'passed', true]]);
  assert.equal(s.requests[1].task.fixtures['src/value.ts'], 'initial');
  assert.equal(s.requests[1].task.fixtures['original-input/src/value.ts'], scenario.fixtures['src/value.ts']);
  assert.match(s.requests[1].task.prompt, /Verifier feedback.*diagnostic data/);
  assert.deepEqual(s.requests.map(r => r.temperature), [0.2, 0]);
  assert.deepEqual(s.raw, [{ index: 1, kind: 'initial' }, { index: 2, kind: 'repair' }]);
  assert.ok(!JSON.stringify(evidence).includes('Compiler diagnostic'));
  assert.equal(scenario.fixtures['src/value.ts'], 'export const value = 0;');
});

test('stops on initial verified success without a repair', async () => {
  const s = setup([{ source: 'initial' }], [true]);
  const r = await s.run();
  assert.equal(s.requests.length, 1);
  assert.equal(r.evidence[0].verification.status, 'passed');
});

for (const [name, repair, verified] of [
  ['invalid delivery', undefined, true],
  ['failed app check', { source: 'bad' }, false],
  ['guardrail regression', { source: 'unsafe', guardrails: 0.9 }, true],
  ['adherence regression', { source: 'incomplete', adherence: 0.5 }, true],
]) test(`retains failed initial after repair ${name}`, async () => {
  const s = setup([{ source: 'initial', adherence: 1 }, repair], [false, verified]);
  const { files, evidence } = await s.run();
  assert.equal(files[0].content, 'initial');
  assert.equal(evidence[0].selected, true);
  assert.equal(evidence[1].selected, false);
  assert.equal(s.requests.length, 2);
});

test('verifier errors stop work and retain source-free failure evidence', async () => {
  const s = setup([{ source: 'initial' }], [new Error('PRIVATE_VERIFIER_ERROR')]);
  const { files, evidence } = await s.run();
  assert.equal(files[0].content, 'initial');
  assert.equal(evidence[0].verification.status, 'error');
  assert.equal(s.requests.length, 1);
  assert.ok(!JSON.stringify(evidence).includes('PRIVATE_VERIFIER_ERROR'));
});

test('does not publish a verifier error while verification is still pending', async () => {
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let finish;
  let latest;
  const generate = createVerifiedEditGenerate(() => async (_, onAttempts) => {
    onAttempts([{ status: 'parsed', durationMs: 0, guardrails: 1, adherence: null }]);
    return [{ path: 'src/value.ts', content: 'initial' }];
  }, { verify: () => { entered(); return new Promise(resolve => { finish = resolve; }); } });
  const pending = generate(scenario, records => { latest = structuredClone(records); });
  await started;
  assert.notEqual(latest[0].verification?.status, 'error');
  finish({ passed: true });
  await pending;
  assert.equal(latest[0].verification.status, 'passed');
});

test('invalid initial delivery does not spend a repair or invoke verification', async () => {
  const s = setup([undefined], []);
  assert.deepEqual((await s.run()).files, []);
  assert.equal(s.requests.length, 1);
  assert.equal(s.checks.length, 0);
});

test('recorded candidate is rechecked without generating a new initial response', async () => {
  let calls = 0;
  let checks = 0;
  let evidence;
  const generate = createVerifiedEditGenerate(() => async (task, onAttempts) => {
    calls++;
    assert.equal(task.fixtures['src/value.ts'], 'recorded');
    onAttempts([{ taskDigest: 'repair-task', status: 'invalid', durationMs: 1, selected: false }]);
    return [];
  }, { recordedInitial: { files: [{ path: 'src/value.ts', content: 'recorded' }], attempt: {
    taskDigest: 'original-task', origin: 'recorded-candidate-recheck', status: 'parsed', providerCalls: [], durationMs: 0,
  } }, verify: async () => { checks++; return { passed: false, feedback: 'Generic failure.' }; } });
  const files = await generate(scenario, records => { evidence = records; });
  assert.equal(files[0].content, 'recorded');
  assert.equal(calls, 1);
  assert.equal(checks, 1);
  assert.equal(evidence[0].origin, 'recorded-candidate-recheck');
  assert.deepEqual(evidence[0].providerCalls, []);
  assert.equal(evidence[0].verification.status, 'failed');
  assert.equal(evidence[1].kind, 'repair');
});

test('uses actual source-edit safety and new candidate anchors for the repair', async () => {
  const { createModelEditGenerate } = require('../../packages/rn/dist/bench/modelEditGenerate.js');
  const requests = [];
  let checks = 0;
  const generate = createVerifiedEditGenerate(createModelEditGenerate, {
    modelRouter: { generate: async request => {
      requests.push(request);
      return { provider: 'local', requiredTool: 'propose_edits', content: JSON.stringify({ tool: 'propose_edits', arguments: {
        edits: [{ file: 'src/value.ts', op: 'replace', from: 'block-1', to: `export const value = ${requests.length};` }],
      } }) };
    } }, verify: async () => ({ passed: ++checks === 2, feedback: 'Recheck public requirements.' }),
  });
  let evidence;
  const files = await generate({ ...scenario, acceptance: 'PRIVATE_ACCEPTANCE_ANSWER',
    fixEdits: [{ file: 'src/value.ts', find: '0', replace: 'PRIVATE_REFERENCE_ANSWER' }] }, records => { evidence = records; });
  assert.equal(files[0].content, 'export const value = 2;');
  assert.match(requests[1].context, /export const value = 1;/);
  assert.match(requests[1].context, /original-input\/src\/value.ts/);
  assert.match(requests[1].context, /export const value = 0;/);
  assert.ok(evidence.every(a => a.editApplication === 'applied'));
  assert.equal(evidence[1].selected, true);
  assert.notEqual(evidence[0].requestDigest, evidence[1].requestDigest);
  assert.equal(evidence[1].originalTaskDigest, evidence[0].taskDigest);
  assert.match(evidence[1].repairBaseSha256, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(requests).includes('PRIVATE_ACCEPTANCE_ANSWER'));
  assert.ok(!JSON.stringify(requests).includes('PRIVATE_REFERENCE_ANSWER'));
});
