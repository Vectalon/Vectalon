const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

for (const matches of [true, false]) test(`resource calibration requires matching observations and never emits response text (${matches})`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectalon-context-calibration-test-'));
  try {
    const preload = path.join(root, 'native-stub.cjs');
    const result = { content: 'PRIVATE_NATIVE_RESPONSE', modelId: 'qwen2.5-coder-7b', stopReason: 'maxTokens',
      artifact: { sha256: matches ? require('./one-app-evaluation-7b.json').artifactSha256 : 'wrong' },
      localContext: { inputTokens: 100, maxOutputTokens: 8, contextSize: 512, batchSize: 128 } };
    fs.writeFileSync(preload, `const Module = require('node:module'); const load = Module._load;
Module._load = function(request, ...args) {
  if (request.endsWith('/dist/model/local/inference.js')) return { runInference: async () => (${JSON.stringify(result)}) };
  if (request.endsWith('/dist/model/local/memory.js')) return { nativeMemoryBudget: () => ({ availableBytes: 8 * 1024 ** 3, source: 'os-free' }) };
  if (request === 'node:os') return { ...load.call(this, request, ...args), totalmem: () => 16 * 1024 ** 3, freemem: () => 8 * 1024 ** 3 };
  return load.call(this, request, ...args);
};\n`);
    const run = spawnSync(process.execPath, ['--require', preload, path.join(__dirname, 'native-context-preflight.cjs')], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, matches ? 0 : 1, run.stderr);
    const line = run.stdout.split('\n').find(line => line.startsWith('CALIBRATION='));
    const report = JSON.parse(line.slice('CALIBRATION='.length));
    assert.equal(report.outcome, matches ? 'completed' : 'refused-or-error');
    assert.equal(report.nativeCallAttempts, 1);
    assert.ok(!run.stdout.includes('PRIVATE_NATIVE_RESPONSE'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
