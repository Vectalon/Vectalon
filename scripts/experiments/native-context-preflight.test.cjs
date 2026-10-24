const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

test('retained calibration separates raw-free refusal from bounded inference evidence', () => {
  const evidence = path.join(__dirname, '../../docs/release-roadmap/evidence');
  const refused = JSON.parse(fs.readFileSync(path.join(evidence, 'native-context-raw-free-refusal-2026-10-24.json'), 'utf8'));
  const bounded = JSON.parse(fs.readFileSync(path.join(evidence, 'native-context-bounded-2026-10-24.json'), 'utf8'));
  assert.equal(refused.outcome, 'aborted');
  assert.equal(refused.artifact, undefined);
  assert.equal(refused.localContext, undefined);
  assert.equal(refused.requestSha256, bounded.requestSha256);
  assert.equal(bounded.outcome, 'completed');
  assert.equal(bounded.observationVerified, true);
  assert.equal(bounded.artifact.sha256, bounded.expectedArtifactSha256);
  assert.equal(bounded.host.memoryMetric, 'macos-pressure-estimate');
  assert.ok(bounded.host.minimumSampledAvailableBudgetBytes >= 2 * 1024 ** 3);
  const context = bounded.localContext;
  assert.equal(context.maxOutputTokens, 8);
  assert.equal(context.batchSize, 128);
  assert.ok(context.inputTokens + context.maxOutputTokens + 256 <= context.contextSize);
  assert.ok(context.contextSize <= 16384);
  assert.equal(bounded.kind, 'native-context-resource-calibration');
  assert.equal(bounded.content, undefined);
  assert.equal(bounded.taskSuccess, undefined);
});

for (const fullBudget of [false, true]) for (const matches of [true, false]) test(`resource calibration requires matching observations and never emits response text (full=${fullBudget}, matches=${matches})`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectalon-context-calibration-test-'));
  try {
    const preload = path.join(root, 'native-stub.cjs');
    const result = { content: 'PRIVATE_NATIVE_RESPONSE', modelId: 'qwen2.5-coder-7b', stopReason: 'maxTokens',
      artifact: { sha256: matches ? require('./one-app-evaluation-7b.json').artifactSha256 : 'wrong' },
      localContext: { inputTokens: 100, maxOutputTokens: fullBudget ? 2048 : 8, contextSize: fullBudget ? 2560 : 512, batchSize: 128 } };
    fs.writeFileSync(preload, `const Module = require('node:module'); const load = Module._load;
Module._load = function(request, ...args) {
  if (request.endsWith('/dist/model/local/inference.js')) return { runInference: async (_model, options) => {
    require('node:assert/strict').equal(options.maxTokens, ${fullBudget ? 2048 : 8});
    require('node:assert/strict').equal(options.temperature, 0.2);
    return ${JSON.stringify(result)};
  } };
  if (request.endsWith('/dist/model/local/memory.js')) return { nativeMemoryBudget: () => ({ availableBytes: 8 * 1024 ** 3, source: 'os-free' }) };
  if (request === 'node:os') return { ...load.call(this, request, ...args), totalmem: () => 16 * 1024 ** 3, freemem: () => 8 * 1024 ** 3 };
  return load.call(this, request, ...args);
};\n`);
    const run = spawnSync(process.execPath, ['--require', preload, path.join(__dirname, 'native-context-preflight.cjs'), ...(fullBudget ? ['--full-budget'] : [])], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, matches ? 0 : 1, run.stderr);
    const line = run.stdout.split('\n').find(line => line.startsWith('CALIBRATION='));
    const report = JSON.parse(line.slice('CALIBRATION='.length));
    assert.equal(report.outcome, matches ? 'completed' : 'refused-or-error');
    assert.equal(report.nativeCallAttempts, 1);
    assert.equal(report.mode, fullBudget ? 'full-budget' : 'eight-token');
    assert.equal(report.outputTokenCap, fullBudget ? 2048 : 8);
    assert.equal(report.timeoutMs, fullBudget ? 180000 : 60000);
    assert.ok(!run.stdout.includes('PRIVATE_NATIVE_RESPONSE'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('resource calibration rejects unknown arguments before inference', () => {
  const run = spawnSync(process.execPath, [path.join(__dirname, 'native-context-preflight.cjs'), '--unknown'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 1);
  assert.ok(!run.stdout.includes('CALIBRATION='));
});
