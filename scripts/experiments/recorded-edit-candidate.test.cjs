const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadRecordedEditCandidate } = require('./recorded-edit-candidate.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');
const candidate = { path: 'src/hooks/value.ts', content: 'export const value = 1;' };
const attempt = { kind: 'initial', selected: true, status: 'parsed', editApplication: 'applied', requestDigest: 'request',
  artifact: { sha256: 'pinned-model' }, provider: 'local', durationMs: 10, providerCalls: [{ provider: 'local' }] };
const expected = { revision: 'original-revision', acceptanceSha256: 'acceptance', controlSourceSha256: 'control',
  expectedArtifactSha256: 'pinned-model', outputAudit: { responseSha256: hash('raw'), candidates: [{ path: candidate.path, sha256: hash(candidate.content) }] },
  runs: [{ status: 'failed', identityMatched: true, result: { attempts: [attempt] } }] };
function report() {
  return { ...expected, runs: [{ ...expected.runs[0], rawResponses: [{ content: 'raw' }],
    result: { attempts: [structuredClone(attempt)], generatedArtifacts: [structuredClone(candidate)] } }] };
}

test('loads exact recorded source with canonical historical metadata, not a new initial call', () => {
  const loaded = loadRecordedEditCandidate(report(), expected);
  assert.deepEqual(loaded.files, [candidate]);
  assert.equal(loaded.attempt.origin, 'recorded-candidate-recheck');
  assert.deepEqual(loaded.attempt.providerCalls, []);
  assert.equal(loaded.attempt.durationMs, 0);
  assert.equal(loaded.provenance.historicalAttemptDurationMs, 10);
  assert.ok(!JSON.stringify(loaded.provenance).includes('export const'));
});

for (const [name, mutate] of [
  ['candidate bytes', r => { r.runs[0].result.generatedArtifacts[0].content += '\n'; }],
  ['extra file', r => { r.runs[0].result.generatedArtifacts.push(candidate); }],
  ['raw response', r => { r.runs[0].rawResponses[0].content = 'changed'; }],
  ['model identity', r => { r.runs[0].result.attempts[0].artifact.sha256 = 'other'; }],
  ['request identity', r => { r.runs[0].result.attempts[0].requestDigest = 'other'; }],
  ['control', r => { r.controlSourceSha256 = 'other'; }],
  ['revision', r => { r.revision = 'other'; }],
]) test(`rejects changed recorded ${name}`, () => {
  const r = report(); mutate(r);
  assert.throws(() => loadRecordedEditCandidate(r, expected));
});
