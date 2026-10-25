const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

for (const [lowMemory, singleGuided, guidedRepair, structured, scoped, fresh = false, asyncControl = false, editRepair = false] of [[false, false, false, false, false], [true, false, false, false, false], [false, true, false, false, false], [false, false, true, false, false], [false, false, true, true, false], [false, false, false, false, true], [false, false, false, false, false, true], [false, false, false, false, false, false, true], [false, false, false, false, true, false, true], [false, false, false, false, true, false, true, true]]) test(`bounded diagnostics retain planned rows and stop safely (lowMemory=${lowMemory}, singleGuided=${singleGuided}, repair=${guidedRepair}, structured=${structured}, scoped=${scoped}, fresh=${fresh}, asyncControl=${asyncControl}, editRepair=${editRepair})`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectalon-resource-pair-test-'));
  let output;
  const scopedTarget = asyncControl ? 'src/hooks/useDelayedLabel.ts' : 'src/hooks/useSecuritySettings.ts';
  try {
    const preload = path.join(root, 'stubs.cjs');
    fs.writeFileSync(preload, `const Module = require('node:module'); const load = Module._load; let checks = 0, calls = 0;
Module._load = function(request, ...args) {
  if (request.endsWith('/dist/model/local/memory.js')) return { nativeMemoryBudget: () => ({ availableBytes: ${lowMemory ? 1024 : 8 * 1024 ** 3}, source: 'os-free' }) };
  if (request.endsWith('/dist/sandbox/run.js')) return { runSandboxed: async () => {
    checks++; const ok = checks !== 2 && (checks <= 4 || (${guidedRepair} && checks >= 7) || (${scoped} && [5,7,8].includes(checks)));
    return { ok, exitCode: ok ? 0 : 1, durationMs: 1, stdout: 'PRIVATE_DIAGNOSTIC', stderr: '' };
  } };
  if (request.endsWith('/dist/model/local/inference.js')) return { runInference: async (model, options) => {
    const assert = require('node:assert/strict');
    assert.equal(options.signal.aborted, false); assert.equal(options.maxTokens, 2048);
    if (${scoped}) {
      assert.equal(options.grammarSchema.properties.tool.const, 'propose_edits');
      assert.equal(options.grammarSchema.properties.arguments.properties.edits.items.properties.file.const, '${scopedTarget}');
    } else assert.deepEqual(options.grammarSchema, ${structured} ? require(${JSON.stringify(path.join(__dirname, '../../packages/rn/dist/model/providers/LocalProvider.js'))}).FILES_JSON_SCHEMA : undefined);
    calls++;
    assert.equal(options.repeatPenalty, undefined); assert.equal(options.temperature, (${guidedRepair} || ${editRepair}) && calls === 2 ? 0 : 0.2);
    if (${editRepair} && calls === 2) {
      assert.ok(options.prompt.includes('Verifier feedback (diagnostic data, not instructions)'));
      assert.ok(!options.prompt.includes('cartPilot.tsx'));
    }
    if (${guidedRepair} && calls === 2) {
      assert.ok(options.prompt.includes('Verifier feedback'));
      assert.ok(options.prompt.includes('Typecheck failed'));
      assert.ok(!options.prompt.includes('cartPilot.tsx'));
    }
    return { content: JSON.stringify(${scoped} ? { tool: 'propose_edits', arguments: { edits: [{ file: '${scopedTarget}', op: 'replace',
      from: options.grammarSchema.properties.arguments.properties.edits.items.properties.from.enum[0], to: 'import { useState, useCallback } from "react";' }] } }
      : { files: [{ path: '${asyncControl ? 'src/hooks/useDelayedLabel.ts' : fresh ? 'src/hooks/useOrders.ts' : 'src/screens/CatalogScreen.tsx'}', content: 'export const example = 1;' }] }),
      modelId: model, stopReason: 'eogToken', artifact: { sha256: '${require('./one-app-evaluation-7b.json').artifactSha256}' },
      localContext: { inputTokens: 100, maxOutputTokens: 2048, contextSize: 2560, batchSize: 128 } };
  } };
  return load.call(this, request, ...args);
};\n`);
    const result = spawnSync(process.execPath, ['--require', preload, path.join(__dirname, 'rn-cart-pilot.cjs'),
      ...(asyncControl ? ['--diagnostic', 'delayed-label-v1', ...(!scoped ? ['--task-relevant'] : []), '--model', 'qwen2.5-coder-7b', '--artifact-sha256', require('./one-app-evaluation-7b.json').artifactSha256]
        : ['--task', fresh ? 'orders-refresh-race' : scoped ? 'current-session' : 'stock-filter', '--evaluation-lane', fresh ? 'fresh-7b' : '7b']), '--resource-pair',
      ...(singleGuided ? ['--raw-guided', '--include-raw-response', '--include-generated'] : []),
      ...(guidedRepair ? ['--guided-repair'] : []), ...(structured ? ['--constrained'] : []),
      ...(scoped ? ['--scoped-edits', '--include-generated'] : []), ...(editRepair ? ['--edit-repair'] : [])], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, lowMemory ? 1 : 0, result.stderr);
    output = result.stdout.match(/^Evidence: (.+)$/m)?.[1];
    assert.ok(output, result.stdout);
    const source = fs.readFileSync(path.join(output, 'report.json'), 'utf8');
    const report = JSON.parse(source);
    if (asyncControl) {
      assert.equal(report.task.id, 'delayed-label-v1');
      assert.deepEqual(report.runs.slice(0, 2).map(row => row.condition), scoped ? ['vectalon-edits', 'vectalon-edits'] : ['task-only', 'task-relevant']);
      assert.match(report.controlSourceSha256, /^[a-f0-9]{64}$/);
    }
    if (fresh) {
      assert.equal(report.evaluationLane, 'fresh-7b');
      assert.equal(report.task.id, 'orders-refresh-race');
      assert.equal(report.taskDefinitionsSha256, require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'one-app-fresh-tasks.cjs'))).digest('hex'));
    }
    if (scoped) {
      assert.equal(report.kind, editRepair ? 'bounded-scoped-edit-repair' : 'bounded-scoped-edit-diagnostic');
      assert.equal(report.resourceProtocol.rowLimit, 1);
      assert.equal(report.runs.length, 3);
      const row = report.runs[0];
      assert.equal(row.status, 'failed');
      assert.equal(row.result.attempts[0].editApplication, 'applied');
      assert.equal(row.identityMatched, true);
      assert.equal(row.nativeCalls.length, editRepair ? 2 : 1);
      if (editRepair) {
        assert.equal(report.resourceProtocol.maxNativeCalls, 2);
        assert.equal(row.resources.timeoutMs, 360000);
        assert.deepEqual(row.result.attempts.map(a => [a.kind, a.selected]), [['initial', true], ['repair', false]]);
        assert.equal(row.result.attempts[0].verification.status, 'failed');
        assert.equal(row.editAttempts.length, 2);
      }
      assert.equal(row.nativeCalls[0].grammarSchemaSha256, report.resourceProtocol.grammarSchemaSha256);
      assert.ok(report.runs.slice(1).every(row => row.status === 'not-run'));
      const original = asyncControl ? require('./react-async-control.cjs').original
        : spawnSync('git', ['show', require('./one-app-evaluation-7b.json').appRevision + ':apps/website/demo/login-app/src/hooks/useSecuritySettings.ts'], { encoding: 'utf8' }).stdout;
      assert.equal(report.runs[0].condition, 'vectalon-edits');
      if (asyncControl) assert.deepEqual(Object.keys(report.conditionSettings), ['vectalon-edits']);
      assert.equal(row.result.generatedArtifacts[0].content, 'import { useState, useCallback } from "react";' + original.slice(original.indexOf('\n')));
      assert.ok(!require('./pilot-report.cjs').serializePilotReport(report).includes('PRIVATE_DIAGNOSTIC'));
      return;
    }
    if (guidedRepair) {
      assert.equal(report.kind, structured ? 'bounded-structured-repair-diagnostic' : 'bounded-guided-repair-diagnostic');
      if (structured) {
        assert.equal(report.settings.outputFormat, 'files-json');
        assert.ok(report.runs[0].result.attempts.every(a => a.outputFormat === 'files-json'));
        assert.ok(report.runs[0].nativeCalls.every(c => c.grammarSchemaSha256 === report.resourceProtocol.grammarSchemaSha256));
      }
      assert.equal(report.resourceProtocol.rowLimit, 1);
      assert.equal(report.settings.maxAttempts, 2);
      assert.equal(report.runs.length, 3);
      assert.equal(report.runs[0].resources.timeoutMs, 360000);
      assert.equal(report.runs[0].status, 'passed');
      assert.deepEqual(report.runs[0].result.attempts.map(a => [a.kind, a.verification.status, a.selected]), [['initial', 'failed', false], ['repair', 'passed', true]]);
      assert.deepEqual(report.runs[0].nativeCalls.map(c => c.status), ['response', 'response']);
      assert.ok(report.runs.slice(1).every(row => row.status === 'not-run'));
      assert.ok(!require('./pilot-report.cjs').serializePilotReport(report).includes('PRIVATE_DIAGNOSTIC'));
      return;
    }
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

for (const preflight of [true, false]) test(`v2 keeps all repetitions and frozen lane (preflight=${preflight})`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectalon-v2-preflight-test-'));
  let output;
  try {
    const preload = path.join(root, 'stubs.cjs');
    fs.writeFileSync(preload, `const Module = require('node:module'), load = Module._load; let checks = 0, calls = 0;
Module._load = function(request, ...args) {
  if (request.endsWith('/dist/model/local/memory.js')) return { nativeMemoryBudget: () => ({ availableBytes: 8 * 1024 ** 3, source: 'os-free' }) };
  if (request.endsWith('/dist/sandbox/run.js')) return { runSandboxed: async () => {
    const ok = ++checks !== 2; return { ok, exitCode: ok ? 0 : 1, durationMs: 1, stdout: '', stderr: '' };
  } };
  if (request.endsWith('/dist/model/local/inference.js')) {
    if (${preflight}) throw new Error('Preflight must not load inference');
    return { runInference: async () => {
      require('node:assert/strict').ok(++calls <= 6);
      return { content: 'invalid candidate', modelId: 'qwen2.5-coder-7b', artifact: { sha256: '${require('./one-app-evaluation-7b.json').artifactSha256}' } };
    } };
  }
  return load.call(this, request, ...args);
};`);
    const result = spawnSync(process.execPath, ['--require', preload, path.join(__dirname, 'rn-cart-pilot.cjs'),
      '--task', 'cart-distinct-count', '--evaluation-lane', 'v2-7b', '--resource-pair', ...(preflight ? ['--preflight'] : [])],
    { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    output = result.stdout.match(/^Evidence: (.+)$/m)?.[1];
    const report = JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8'));
    assert.equal(report.evaluationLane, 'v2-7b');
    assert.match(report.rubricModuleSha256, /^[a-f0-9]{64}$/);
    assert.equal(report.resourceProtocol.rowLimit, 6);
    assert.equal(report.runs.length, 6);
    assert.ok(report.runs.every(row => row.status === (preflight ? 'not-run' : 'failed')));
    assert.equal(report.runs.reduce((sum, row) => sum + (row.nativeCalls?.length ?? 0), 0), preflight ? 0 : 6);
    assert.deepEqual(report.runs.map(row => row.condition), ['task-only', 'vectalon', 'vectalon', 'task-only', 'task-only', 'vectalon']);
    assert.equal(report.positiveControl.tests.ok, true);
    assert.equal(report.negativeControl.tests.ok, false);
  } finally {
    if (output) fs.rmSync(output, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('recorded resume invokes only one native repair and labels historical initial separately', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectalon-recorded-resume-test-'));
  let output;
  try {
    const preload = path.join(root, 'stubs.cjs');
    const recorded = path.join(root, 'recorded.json');
    fs.writeFileSync(recorded, '{}');
    fs.writeFileSync(preload, `const Module = require('node:module'), fs = require('node:fs'), crypto = require('node:crypto');
const load = Module._load; let checks = 0, calls = 0;
const control = require(${JSON.stringify(path.join(__dirname, 'react-async-control.cjs'))});
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
Module._load = function(request, ...args) {
  if (request === './recorded-edit-candidate.cjs') return { loadRecordedEditCandidate: () => ({
    files: [{ path: 'src/hooks/useDelayedLabel.ts', content: 'export const value = 1;' }],
    attempt: { kind: 'initial', status: 'parsed', origin: 'recorded-candidate-recheck', editApplication: 'applied', provider: 'local',
      providerCalls: [], artifact: { sha256: '${require('./one-app-evaluation-7b.json').artifactSha256}' }, durationMs: 0 },
    provenance: { revision: 'recorded', candidateSha256: 'recorded-hash', acceptanceSha256: hash(control.acceptance),
      controlSourceSha256: hash(fs.readFileSync(${JSON.stringify(path.join(__dirname, 'react-async-control.cjs'))})) }
  }) };
  if (request.endsWith('/dist/model/local/memory.js')) return { nativeMemoryBudget: () => ({ availableBytes: 8 * 1024 ** 3, source: 'os-free' }) };
  if (request.endsWith('/dist/sandbox/run.js')) return { runSandboxed: async () => {
    const ok = ++checks % 2 === 1 || checks === 4;
    return { ok, exitCode: ok ? 0 : 1, durationMs: 1, stdout: '', stderr: '' };
  } };
  if (request.endsWith('/dist/model/local/inference.js')) return { runInference: async (model, options) => {
    require('node:assert/strict').equal(++calls, 1); require('node:assert/strict').equal(options.temperature, 0);
    return { content: 'invalid tool response', modelId: model, artifact: { sha256: '${require('./one-app-evaluation-7b.json').artifactSha256}' } };
  } };
  return load.call(this, request, ...args);
};`);
    const result = spawnSync(process.execPath, ['--require', preload, path.join(__dirname, 'rn-cart-pilot.cjs'),
      '--diagnostic', 'delayed-label-v1', '--scoped-edits', '--edit-repair', '--resource-pair', '--repair-from', recorded,
      '--model', 'qwen2.5-coder-7b', '--artifact-sha256', require('./one-app-evaluation-7b.json').artifactSha256],
    { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    output = result.stdout.match(/^Evidence: (.+)$/m)?.[1];
    const report = JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8'));
    assert.equal(report.kind, 'recorded-candidate-assisted-repair');
    assert.equal(report.resourceProtocol.maxNativeCalls, 1);
    const row = report.runs[0];
    assert.equal(row.resources.timeoutMs, 180000);
    assert.equal(row.nativeCalls.length, 1);
    assert.equal(row.nativeCalls[0].kind, 'repair');
    assert.equal(row.result.attempts[0].origin, 'recorded-candidate-recheck');
    assert.deepEqual(row.result.attempts[0].providerCalls, []);
    assert.equal(row.result.attempts[1].kind, 'repair');
    assert.equal(row.result.attempts[1].selected, false);
    assert.match(fs.readFileSync(path.join(output, 'report.md'), 'utf8'), /Rechecked without a new initial model call/);
  } finally {
    if (output) fs.rmSync(output, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('invalid recorded JSON fails before output without echoing source bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vectalon-recorded-invalid-'));
  try {
    const file = path.join(root, 'invalid.json');
    fs.writeFileSync(file, 'PRIVATE_SOURCE_TOKEN_NOT_JSON');
    const result = spawnSync(process.execPath, [path.join(__dirname, 'rn-cart-pilot.cjs'), '--diagnostic', 'delayed-label-v1',
      '--scoped-edits', '--edit-repair', '--resource-pair', '--repair-from', file,
      '--model', 'qwen2.5-coder-7b', '--artifact-sha256', require('./one-app-evaluation-7b.json').artifactSha256],
    { encoding: 'utf8', timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.ok(!result.stdout.includes('Evidence:'));
    assert.ok(!result.stderr.includes('PRIVATE_SOURCE_TOKEN'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
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
  ['v2 without resource guards', ['--task', 'cart-distinct-count', '--evaluation-lane', 'v2-7b'], 'V2 evaluation requires'],
  ['v2 with repair', ['--task', 'cart-distinct-count', '--evaluation-lane', 'v2-7b', '--resource-pair', '--guided-repair'], 'V2 evaluation requires'],
  ['v2 model substitution', ['--task', 'cart-distinct-count', '--evaluation-lane', 'v2-7b', '--resource-pair', '--model', 'qwen2.5-coder-3b', '--artifact-sha256', 'a'.repeat(64)], 'model cannot change'],
  ['v2 with old task', ['--task', 'orders-refresh-race', '--evaluation-lane', 'v2-7b', '--resource-pair'], 'Unknown frozen evaluation task'],
  ['recorded source without repair mode', ['--repair-from', '/private/tmp/not-read.json'], '--repair-from requires'],
  ['edit repair without scoped mode', ['--edit-repair'], '--edit-repair requires'],
  ['edit repair on frozen task', ['--edit-repair', '--scoped-edits', '--resource-pair', '--task', 'current-session', '--evaluation-lane', '7b'], '--edit-repair requires'],
  ['async scoped control with wrong identity', ['--diagnostic', 'delayed-label-v1', '--scoped-edits', '--resource-pair', '--model', 'qwen2.5-coder-7b', '--artifact-sha256', 'a'.repeat(64)], '--scoped-edits requires'],
  ['async scoped control mixed with full-file guidance', ['--diagnostic', 'delayed-label-v1', '--scoped-edits', '--task-relevant', '--resource-pair', '--model', 'qwen2.5-coder-7b', '--artifact-sha256', require('./one-app-evaluation-7b.json').artifactSha256], '--scoped-edits requires'],
  ['async scoped control without watchdog', ['--diagnostic', 'delayed-label-v1', '--scoped-edits', '--model', 'qwen2.5-coder-7b', '--artifact-sha256', require('./one-app-evaluation-7b.json').artifactSha256], '--scoped-edits requires'],
  ['async guarded control with unpinned model', ['--diagnostic', 'delayed-label-v1', '--task-relevant', '--resource-pair', '--model', 'qwen2.5-coder-3b', '--artifact-sha256', 'a'.repeat(64)], '--resource-pair requires'],
  ['async guarded control with repair override', ['--diagnostic', 'delayed-label-v1', '--task-relevant', '--resource-pair', '--verified-controls', '--model', 'qwen2.5-coder-7b', '--artifact-sha256', require('./one-app-evaluation-7b.json').artifactSha256], '--resource-pair requires'],
  ['fresh lane without resource guards', ['--task', 'orders-refresh-race', '--evaluation-lane', 'fresh-7b'], 'Fresh evaluation requires'],
  ['fresh lane with old task', ['--task', 'current-session', '--evaluation-lane', 'fresh-7b', '--resource-pair'], '--resource-pair requires'],
  ['fresh lane with repair', ['--task', 'orders-refresh-race', '--evaluation-lane', 'fresh-7b', '--resource-pair', '--guided-repair'], 'Fresh evaluation requires'],
  ['fresh lane model substitution', ['--task', 'orders-refresh-race', '--evaluation-lane', 'fresh-7b', '--resource-pair', '--model', 'qwen2.5-coder-3b', '--artifact-sha256', 'a'.repeat(64)], 'model cannot change'],
  ['scoped edits without guards', ['--scoped-edits'], '--scoped-edits requires'],
  ['scoped edits on another task', ['--scoped-edits', '--resource-pair', '--task', 'stock-filter', '--evaluation-lane', '7b'], '--scoped-edits requires'],
  ['scoped edits mixed with repairs', ['--scoped-edits', '--resource-pair', '--task', 'current-session', '--evaluation-lane', '7b', '--guided-repair'], '--scoped-edits requires'],
  ['guided repair without guards', ['--guided-repair'], '--guided-repair requires'],
  ['guided repair mixed with raw-only diagnostic', ['--guided-repair', '--resource-pair', '--raw-guided'], '--guided-repair requires'],
  ['guided repair mixed with legacy repair', ['--guided-repair', '--resource-pair', '--repair'], '--guided-repair requires'],
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
