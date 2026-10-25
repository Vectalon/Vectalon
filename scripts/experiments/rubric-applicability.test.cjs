const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runRubric } = require('../../packages/rn/dist/bench/rubric.js');
const fixtures = require('./rubric-applicability-fixtures.json');

const current = {
  'pure-async-service': null,
  'propagating-network-service': null,
  'async-in-string': null,
  'missing-ui-error-handling': false,
  'ui-with-error-handling': true,
  'promise-without-async-marker': null,
};

for (const fixture of fixtures) test(`corrected UI error-state applicability preserves original audit: ${fixture.id}`, () => {
  const historical = require('../../docs/release-roadmap/evidence/rubric-applicability-2026-10-25.json');
  assert.equal(historical.observations.find(row => row.id === fixture.id).errorStates, fixture.errorStates);
  const result = runRubric([{ path: fixture.path, content: fixture.content }]);
  const check = result.files[0].checks.find(check => check.id === 'error-states');
  assert.equal(check?.passed ?? null, current[fixture.id]);
});
