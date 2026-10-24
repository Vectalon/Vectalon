const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

for (const [lowMemory, singleGuided] of [[false, false], [true, false], [false, true]]) test(`bounded diagnostics retain six planned rows and stop safely (lowMemory=${lowMemory}, singleGuided=${singleGuided})`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectalon-resource-pair-test-'));
  let output;
  try {
    const preload = path.join(root, 'stubs.cjs');
    fs.writeFileSync(preload, `const Module = require('node:module'); const load = Module._load; let checks = 0;
Module._load = function(request, ...args) {
  if (request.endsWith('/dist/model/local/memory.js')) return { nativeMemoryBudget: () => ({ availableBytes: ${lowMemory ? 1024 : 8 * 1024 ** 3}, source: 'os-free' }) };
  if (request.endsWith('/dist/sandbox/run.js')) return { runSandboxed: async () => {
    checks++; const ok = checks !== 2 && checks <= 4;
    return { ok, exitCode: ok ? 0 : 1, durationMs: 1, stdout: 'PRIVATE_DIAGNOSTIC', stderr: '' };
  } };
  if (request.endsWith('/dist/model/local/inference.js')) return { runInference: async (model, options) => {
    const assert = require('node:assert/strict');
    assert.equal(options.signal.aborted, false); assert.equal(options.maxTokens, 2048);
    assert.equal(options.repeatPenalty, undefined); assert.equal(options.temperature, 0.2);
    return { content: JSON.stringify({ files: [{ path: 'src/screens/CatalogScreen.tsx', content: 'export const example = 1;' }] }),
      modelId: model, stopReason: 'eogToken', artifact: { sha256: '${require('./one-app-evaluation-7b.json').artifactSha256}' },
      localContext: { inputTokens: 100, maxOutputTokens: 2048, contextSize: 2560, batchSize: 128 } };
  } };
  return load.call(this, request, ...args);
};\n`);
    const result = spawnSync(process.execPath, ['--require', preload, path.join(__dirname, 'rn-cart-pilot.cjs'),
      '--task', 'stock-filter', '--evaluation-lane', '7b', '--resource-pair',
      ...(singleGuided ? ['--raw-guided', '--include-raw-response', '--include-generated'] : [])], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, lowMemory ? 1 : 0, result.stderr);
    output = result.stdout.match(/^Evidence: (.+)$/m)?.[1];
    assert.ok(output, result.stdout);
    const source = fs.readFileSync(path.join(output, 'report.json'), 'utf8');
    const report = JSON.parse(source);
    assert.equal(report.kind, singleGuided ? 'bounded-guided-output-diagnostic' : 'bounded-one-app-resource-pair');
    assert.equal(report.resourceProtocol.rowLimit, singleGuided ? 1 : 2);
    assert.equal(report.runs.length, 6);
    assert.equal(report.runs[0].status, singleGuided ? 'not-run' : lowMemory ? 'resource-aborted' : 'failed');
    assert.equal(report.runs[1].status, lowMemory ? 'not-run' : 'failed');
    assert.ok(report.runs.slice(2).every(row => row.status === 'not-run'));
    assert.equal(report.runs[singleGuided ? 1 : 0].resources.reserveBytes, 2 * 1024 ** 3);
    if (lowMemory) assert.equal(report.runs[0].resourceStopReason, 'memory-reserve');
    else for (const row of singleGuided ? [report.runs[1]] : report.runs.slice(0, 2)) {
      assert.equal(row.result.attempts[0].provider, 'local');
      assert.equal(row.identityMatched, true);
      assert.equal(row.result.attempts[0].providerCalls.length, 1);
    }
    if (singleGuided) {
      assert.equal(report.runs.filter(row => row.status === 'not-run').length, 5);
      assert.equal(report.runs[1].rawResponses.length, 1);
    }
    assert.equal(source.includes('PRIVATE_DIAGNOSTIC'), singleGuided);
    assert.ok(!require('./pilot-report.cjs').serializePilotReport(report).includes('PRIVATE_DIAGNOSTIC'));
  } finally {
    if (output) fs.rmSync(output, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects changed 7B verifier input before experiment output or inference', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectalon-freeze-test-'));
  try {
    const preload = path.join(root, 'changed-input.cjs');
    fs.writeFileSync(preload, "const fs = require('node:fs'); const read = fs.readFileSync; fs.readFileSync = function(file, ...args) { if (String(file).endsWith('/stock-filter.acceptance.tsx')) return 'changed verifier'; return read.call(this, file, ...args); };\n");
    const result = spawnSync(process.execPath, ['--require', preload, path.join(__dirname, 'rn-cart-pilot.cjs'),
      '--task', 'stock-filter', '--evaluation-lane', '7b', '--preflight'], { encoding: 'utf8', timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('Frozen evaluation input changed: stock-filter.acceptance.tsx'), result.stderr);
    assert.ok(!result.stdout.includes('Evidence:'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const [name, args, message] of [
  ['raw diagnostic without explicit capture', ['--raw-guided', '--resource-pair', '--task', 'stock-filter', '--evaluation-lane', '7b'], '--raw-guided requires'],
  ['raw diagnostic without resource guards', ['--raw-guided', '--include-generated', '--include-raw-response'], '--raw-guided requires'],
  ['resource pair without frozen task', ['--resource-pair'], '--resource-pair requires'],
  ['resource pair on another task', ['--resource-pair', '--task', 'current-session', '--evaluation-lane', '7b'], '--resource-pair requires'],
  ['resource pair on another model lane', ['--resource-pair', '--task', 'stock-filter'], '--resource-pair requires'],
  ['model without identity', ['--model', 'qwen2.5-coder-3b'], 'must be supplied together'],
  ['identity without model', ['--artifact-sha256', 'a'.repeat(64)], 'must be supplied together'],
  ['invalid identity', ['--model', 'qwen2.5-coder-3b', '--artifact-sha256', 'bad'], 'Expected a lowercase SHA-256'],
  ['empty identity', ['--model', 'qwen2.5-coder-3b', '--artifact-sha256', ''], 'Expected a lowercase SHA-256'],
  ['unknown model', ['--model', 'unknown', '--artifact-sha256', 'a'.repeat(64)], 'refusing default-model substitution'],
  ['unknown option', ['--modle', 'qwen2.5-coder-3b'], 'Unknown option'],
  ['unknown evaluation lane', ['--task', 'current-session', '--evaluation-lane', 'unknown'], 'Unknown evaluation lane'],
  ['evaluation lane without task', ['--evaluation-lane', '7b'], '--evaluation-lane requires --task'],
  ['7B lane model substitution', ['--task', 'current-session', '--evaluation-lane', '7b', '--model', 'qwen2.5-coder-3b', '--artifact-sha256', 'a'.repeat(64)], 'model cannot change'],
  ['7B lane artifact substitution', ['--task', 'current-session', '--evaluation-lane', '7b', '--model', 'qwen2.5-coder-7b', '--artifact-sha256', 'a'.repeat(64)], 'artifact cannot change'],
  ['7B lane repair', ['--task', 'current-session', '--evaluation-lane', '7b', '--repair'], 'does not allow repair'],
  ['unsupported grammar condition', ['--constrained'], '--constrained requires --repair'],
  ['edit protocol on frozen tasks', ['--task', 'stock-filter', '--edits'], 'first-attempt public development diagnostic only'],
  ['edit protocol with repairs', ['--edits', '--repair'], 'first-attempt public development diagnostic only'],
  ['unknown frozen task', ['--task', 'unknown'], 'Unknown frozen evaluation task'],
  ['unknown generation control', ['--diagnostic', 'unknown'], 'Unknown generation control'],
  ['guided mode without a control', ['--guided'], '--guided requires a generation control'],
  ['task-relevant mode without a control', ['--task-relevant'], '--task-relevant requires a generation control'],
  ['mixed guidance modes', ['--diagnostic', 'page-bound', '--guided', '--task-relevant'], '--task-relevant requires'],
  ['guided mode on frozen task', ['--task', 'stock-filter', '--guided'], '--guided requires a generation control'],
  ['control without explicit model', ['--diagnostic', 'page-bound'], 'require an explicit model'],
  ['control with frozen task', ['--diagnostic', 'page-bound', '--task', 'stock-filter'], 'cannot combine'],
  ['control with edit override', ['--diagnostic', 'page-bound', '--edits'], 'cannot combine'],
  ['control with repair', ['--diagnostic', 'page-bound', '--repair'], 'cannot combine'],
  ['verified controls without diagnostic', ['--verified-controls'], '--verified-controls requires'],
  ['verified controls without paired guidance', ['--diagnostic', 'page-bound', '--verified-controls'], '--verified-controls requires'],
  ['verified controls on frozen task', ['--task', 'stock-filter', '--verified-controls'], '--verified-controls requires'],
  ['verified controls with legacy repair', ['--diagnostic', 'page-bound', '--task-relevant', '--verified-controls', '--repair'], '--verified-controls requires'],
  ['sampling without diagnostic', ['--sampling-control'], '--sampling-control requires'],
  ['sampling without fixed guidance', ['--diagnostic', 'page-bound', '--sampling-control'], '--sampling-control requires'],
  ['sampling on frozen task', ['--task', 'stock-filter', '--sampling-control'], '--sampling-control requires'],
  ['sampling with repairs', ['--diagnostic', 'page-bound', '--task-relevant', '--verified-controls', '--sampling-control'], '--sampling-control requires'],
  ['empty frozen task', ['--task', ''], 'Unknown frozen evaluation task'],
  ['frozen task repair', ['--task', 'stock-filter', '--repair'], 'does not allow repair'],
  ['frozen model substitution', ['--task', 'stock-filter', '--model', 'qwen2.5-coder-1.5b', '--artifact-sha256', 'a'.repeat(64)], 'model cannot change'],
  ['frozen artifact substitution', ['--task', 'stock-filter', '--model', 'qwen2.5-coder-3b', '--artifact-sha256', 'a'.repeat(64)], 'artifact cannot change'],
]) {
  test(`rejects ${name} before creating experiment output`, () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'rn-cart-pilot.cjs'), ...args], { encoding: 'utf8', timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(message), result.stderr);
    assert.ok(!result.stdout.includes('Evidence:'));
  });
}
