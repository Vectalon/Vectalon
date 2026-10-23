const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { freeze, taskDefinition, reviewImportsAllowed } = require('./one-app-tasks.cjs');
const ts = require('../../apps/website/demo/login-app/node_modules/typescript');
const read = file => execFileSync('git', ['show', `${freeze.appRevision}:apps/website/demo/login-app/${file}`], { encoding: 'utf8' });

test('frozen feature/fix/review inputs exclude verifier answers and candidate test source', () => {
  for (const id of freeze.tasks) {
    const task = taskDefinition(id, read);
    assert.ok(!task.fixturePaths.some(file => file.includes('__tests__') || file.includes('acceptance')));
    const input = task.prompt + task.fixturePaths.map(read).join('\n') + JSON.stringify(task.extraFixtures);
    assert.ok(!input.includes(task.positiveControl));
    if (task.acceptance) assert.ok(!input.includes(task.acceptance));
    assert.ok(task.positiveControl.trim());
    if (task.kind !== 'review') assert.notEqual(task.positiveControl, read(task.target));
  }
});

test('review import policy accepts service behavior tests and rejects mocks/source inspection hooks', () => {
  assert.ok(reviewImportsAllowed(taskDefinition('order-copy-review', read).positiveControl, ts));
  for (const text of [
    "import fs from 'node:fs';", "import '../services/Other';", "require('../services/OrdersApi')",
    "import('../services/OrdersApi')", "jest.mock('../services/OrdersApi')", 'process.env.MODE',
    "eval('code')", 'new Function("return 1")', 'const value = ;',
  ]) assert.equal(reviewImportsAllowed(text, ts), false, text);
});
