const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runRubric } = require('../../packages/rn/dist/bench/rubric.js');
const fixtures = require('./rubric-applicability-fixtures.json');

for (const fixture of fixtures) test(`records unchanged error-state rubric boundary: ${fixture.id}`, () => {
  const result = runRubric([{ path: fixture.path, content: fixture.content }]);
  const check = result.files[0].checks.find(check => check.id === 'error-states');
  assert.equal(check?.passed ?? null, fixture.errorStates);
});
