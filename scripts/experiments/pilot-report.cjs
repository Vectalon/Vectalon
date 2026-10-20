const cell = value => String(value ?? 'unrecorded').replace(/[^a-zA-Z0-9._ :/=-]/g, ' ');
const check = value => value?.skipped ? 'skipped' : value?.ok === true ? 'passed' : value?.ok === false ? 'failed' : 'unrecorded';
const passed = row => row.status === 'passed' && row.identityMatched === true &&
  check(row.checks?.typecheck) === 'passed' && check(row.checks?.tests) === 'passed';
const pending = row => ['running', 'not-run'].includes(row.status);

function formatPilotReport(report) {
  const runs = report.runs || [];
  const lines = ['# RN development pilot', '',
    'Observed development evidence, not model qualification or unseen-task improvement. Native builds, tokens/cost and human correction time are unmeasured.', '',
    `Model: ${cell(report.model)} · expected file SHA-256: ${cell(report.expectedArtifactSha256)}`,
    `Output-token cap: ${cell(report.settings?.maxTokens)} · attempt cap: ${cell(report.settings?.maxAttempts)} · grammar: ${cell(report.settings?.outputFormat ?? 'not requested')}`, '',
    '## Outcome matrix', '',
    'Check fractions count only recorded, non-skipped checks. Missing checks are not passes. Task passes require matching model identity and both app checks; pending runs remain in the planned count.', '',
    '| Condition | Planned | Task passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |',
    '|---|---:|---:|---:|---:|---:|---:|'];
  for (const condition of [...new Set(runs.map(row => row.condition))]) {
    const rows = runs.filter(row => row.condition === condition);
    const countChecks = name => {
      const checks = rows.map(row => check(row.checks?.[name])).filter(value => ['passed', 'failed'].includes(value));
      return `${checks.filter(value => value === 'passed').length}/${checks.length}`;
    };
    lines.push(`| ${cell(condition)} | ${rows.length} | ${rows.filter(passed).length} | ${rows.filter(row => !passed(row) && !pending(row)).length} | ${rows.filter(pending).length} | ${countChecks('typecheck')} | ${countChecks('tests')} |`);
  }
  if (!runs.length) lines.push('', 'No runs recorded.');
  lines.push('', '## Repetitions and attempts', '',
    'Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.', '',
    '| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms |',
    '|---|---:|---|---|---|---|---|---:|');
  for (const row of runs) {
    const attempts = row.result?.attempts;
    const times = attempts?.map(attempt => attempt.durationMs);
    const duration = times?.length && times.every(time => Number.isFinite(time) && time >= 0)
      ? times.reduce((sum, time) => sum + time, 0) : 'unrecorded';
    const details = attempts?.map(attempt => `${cell(attempt.kind)}: ${cell(attempt.status)} / ${cell(attempt.verification?.status)}`).join('; ') || 'unrecorded';
    const identity = row.identityMatched === true ? 'matched' : row.identityMatched === false ? 'mismatch' : 'unrecorded';
    const outcome = row.status === 'passed' && !passed(row) ? 'incomplete evidence' : cell(row.status);
    lines.push(`| ${cell(row.condition)} | ${cell(row.repetition)} | ${outcome} | ${identity} | ${check(row.checks?.typecheck)} | ${check(row.checks?.tests)} | ${details} | ${duration} |`);
  }
  return lines.join('\n') + '\n';
}

module.exports = { formatPilotReport };
