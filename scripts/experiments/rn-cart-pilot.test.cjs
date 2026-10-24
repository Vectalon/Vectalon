const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

for (const [name, args, message] of [
  ['model without identity', ['--model', 'qwen2.5-coder-3b'], 'must be supplied together'],
  ['identity without model', ['--artifact-sha256', 'a'.repeat(64)], 'must be supplied together'],
  ['invalid identity', ['--model', 'qwen2.5-coder-3b', '--artifact-sha256', 'bad'], 'Expected a lowercase SHA-256'],
  ['empty identity', ['--model', 'qwen2.5-coder-3b', '--artifact-sha256', ''], 'Expected a lowercase SHA-256'],
  ['unknown model', ['--model', 'unknown', '--artifact-sha256', 'a'.repeat(64)], 'refusing default-model substitution'],
  ['unknown option', ['--modle', 'qwen2.5-coder-3b'], 'Unknown option'],
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
