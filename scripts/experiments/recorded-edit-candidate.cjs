const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');

function loadRecordedEditCandidate(report, expected) {
  for (const key of ['revision', 'acceptanceSha256', 'controlSourceSha256', 'expectedArtifactSha256']) {
    assert.equal(report[key], expected[key], `Recorded ${key} changed`);
  }
  const row = report.runs[0];
  const canonical = expected.runs[0].result.attempts[0];
  assert.equal(row.status, 'failed');
  assert.equal(row.identityMatched, true);
  assert.equal(row.result.attempts.length, 1);
  assert.equal(row.result.attempts[0].artifact.sha256, expected.expectedArtifactSha256);
  assert.equal(row.result.attempts[0].requestDigest, canonical.requestDigest);
  assert.equal(canonical.editApplication, 'applied');
  assert.equal(row.result.generatedArtifacts.length, 1);
  const file = row.result.generatedArtifacts[0];
  const fingerprint = expected.outputAudit.candidates[0];
  assert.equal(file.path, fingerprint.path);
  assert.equal(hash(file.content), fingerprint.sha256, 'Recorded candidate bytes changed');
  assert.equal(row.rawResponses.length, 1);
  assert.equal(hash(row.rawResponses[0].content), expected.outputAudit.responseSha256, 'Recorded response changed');
  return {
    files: [{ path: file.path, content: file.content }],
    attempt: { ...canonical, origin: 'recorded-candidate-recheck', editApplicationOrigin: 'recorded',
      durationMs: 0, providerCalls: [], verification: undefined },
    provenance: { kind: 'recorded-failed-candidate', revision: expected.revision, requestDigest: canonical.requestDigest,
      candidateSha256: fingerprint.sha256, responseSha256: expected.outputAudit.responseSha256,
      controlSourceSha256: expected.controlSourceSha256, acceptanceSha256: expected.acceptanceSha256,
      historicalAttemptDurationMs: canonical.durationMs },
  };
}

module.exports = { loadRecordedEditCandidate };
