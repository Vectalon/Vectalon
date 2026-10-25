const cell = value => String(value ?? 'unrecorded').replace(/[^a-zA-Z0-9._ :/=-]/g, ' ');
const check = value => value?.skipped ? 'skipped' : value?.ok === true ? 'passed' : value?.ok === false ? 'failed' : 'unrecorded';
const passed = row => row.status === 'passed' && row.identityMatched === true &&
  check(row.checks?.typecheck) === 'passed' && check(row.checks?.tests) === 'passed';
const pending = row => ['running', 'not-run'].includes(row.status);

function serializePilotReport(report, { includeGenerated = false, includeRawResponse = false } = {}) {
  return JSON.stringify(report, (key, value) =>
    (key === 'rawResponses' && !includeRawResponse) ||
    (!includeGenerated && ['generatedArtifacts', 'stdout', 'stderr'].includes(key)) ? undefined : value, 2);
}

function formatPilotReport(report) {
  const runs = report.runs || [];
  const lines = ['# RN development pilot', '',
    'Observed development evidence, not model qualification or unseen-task improvement. Native evidence is separate from app checks and rubric scores; tokens/cost and human correction time are unmeasured.', '',
    `Model: ${cell(report.model)} · expected file SHA-256: ${cell(report.expectedArtifactSha256)}`,
    `Output-token cap: ${cell(report.settings?.maxTokens)} · attempt cap: ${cell(report.settings?.maxAttempts)} · grammar: ${cell(report.settings?.requiredTool ? 'required tool arguments: ' + report.settings.requiredTool : report.settings?.toolEnvelope ? 'local tool envelope' : report.settings?.outputFormat ?? 'not requested')}`, '',
    '## Outcome matrix', '',
    'Check fractions count only recorded, non-skipped checks. Missing checks are not passes. App-check passes require matching model identity and both app checks; pending runs remain in the planned count. Passing app checks alone does not meet the release guardrail/adherence or native gates.', '',
    '| Condition | Planned | App-check passes | Failed/error/timeout/incomplete | Pending | Typecheck passed/checked | Tests passed/checked |',
    '|---|---:|---:|---:|---:|---:|---:|'];
  if (report.settings?.anchorMode) lines.splice(7, 0, `Anchor selection: ${cell(report.settings.anchorMode)}. Source selection is not implementation correctness.`, '');
  if (report.recordedInitial) lines.splice(lines.indexOf('## Outcome matrix'), 0,
    `Recorded initial candidate: ${cell(report.recordedInitial.candidateSha256)}; original revision ${cell(report.recordedInitial.revision)}. Rechecked without a new initial model call. Historical invocation/duration is not part of this run's budget; subsequent repair evidence is assisted, not first-pass success.`, '');
  if (report.conditionSettings) lines.splice(lines.indexOf('## Outcome matrix'), 0,
    ...Object.entries(report.conditionSettings).map(([name, settings]) =>
      `Condition ${cell(name)}: ${cell(settings.output ?? settings.anchorMode)}; required tool: ${cell(settings.requiredTool ?? 'not requested')}; output cap: ${cell(settings.maxTokens)}; attempt cap: ${cell(settings.maxAttempts)}.`), '');
  if (report.task) lines.splice(4, 0,
    `Task: ${cell(report.task.id)} · workflow: ${cell(report.task.kind)} · app revision: ${cell(report.appRevision)}`, '',
    ...(report.task.kind === 'review' ? ['Review passes require the generated test to pass on the original service and fail through an assertion on the proposed service; a compile/runtime error is not detection.', ''] : []));
  if (report.resourceProtocol) lines.splice(lines.indexOf('## Outcome matrix'), 0, '## Bounded resource protocol', '',
    cell(report.resourceProtocol.routing), '',
    `Row limit: ${cell(report.resourceProtocol.rowLimit)}. Remaining planned rows stay not-run. Reserve: ${cell(report.resourceProtocol.reserveBytes)} bytes. Samples are estimates, not peak GPU/RAM or sustained-safety evidence.`, '',
    '| Condition | Repeat | Memory metric | Minimum available bytes | Maximum sampled RSS bytes | Input/output cap/context/batch tokens | Resource stop |',
    '|---|---:|---|---:|---:|---|---|',
    ...runs.filter(row => row.resources).map(row => {
      const context = report.recordedInitial ? row.nativeCalls?.[0]?.localContext : row.result?.attempts?.[0]?.localContext;
      return `| ${cell(row.condition)} | ${cell(row.repetition)} | ${cell(row.resources.memoryMetric)} | ${cell(row.resources.minimumSampledAvailableBudgetBytes)} | ${cell(row.resources.maximumSampledRssBytes)} | ${context ? [context.inputTokens, context.maxOutputTokens, context.contextSize, context.batchSize].map(cell).join('/') : 'unrecorded'} | ${cell(row.resourceStopReason ?? 'none observed')} |`;
    }), '');
  for (const condition of [...new Set(runs.map(row => row.condition))]) {
    const rows = runs.filter(row => row.condition === condition);
    const countChecks = name => {
      const checks = rows.map(row => check(row.checks?.[name])).filter(value => ['passed', 'failed'].includes(value));
      return `${checks.filter(value => value === 'passed').length}/${checks.length}`;
    };
    lines.push(`| ${cell(condition)} | ${rows.length} | ${rows.filter(passed).length} | ${rows.filter(row => !passed(row) && !pending(row)).length} | ${rows.filter(pending).length} | ${countChecks('typecheck')} | ${countChecks('tests')} |`);
  }
  if (!runs.length) lines.push('', 'No runs recorded.');
  lines.push('', '## Workflow qualification boundary', '',
    'Scope: this model artifact, task and condition only. Failed means an observed task, identity, safety or native gate failed; unverified means no recorded failure, not qualification. No automatic qualification: repeated held-out comparisons, comparable budgets and customer/native acceptance still require review. Native counts use supplied candidate verification only, never local inference calls. Pending rows and missing scores remain unresolved; tokens/cost and human effort remain unmeasured.', '',
    '| Condition | Gate state | Rows with observed gate failure | Pending | Supplied native passed/checked |',
    '|---|---|---:|---:|---:|');
  for (const condition of [...new Set(runs.map(row => row.condition))]) {
    const rows = runs.filter(row => row.condition === condition);
    const below = (value, threshold) => Number.isFinite(value) && value >= 0 && value <= 1 && value < threshold;
    const failures = rows.filter(row => !pending(row) && (
      ['failed', 'error', 'timeout'].includes(row.status) || row.identityMatched === false ||
      ['typecheck', 'tests'].some(name => check(row.checks?.[name]) === 'failed') ||
      below(row.result?.axes?.guardrails, 1) || below(row.result?.axes?.adherence, 0.8) ||
      row.nativeVerification?.status === 'failed')).length;
    const native = rows.filter(row => ['passed', 'failed'].includes(row.nativeVerification?.status));
    lines.push(`| ${cell(condition)} | ${failures ? 'failed' : 'unverified'} | ${failures} | ${rows.filter(pending).length} | ${native.filter(row => row.nativeVerification.status === 'passed').length}/${native.length} |`);
  }
  if (report.verificationMode) {
    lines.push('', '## Initial versus assisted outcomes', '',
      cell(report.verificationMode), '',
      'Candidate verification is not selection or native qualification. Missing/invalid initial candidates are not passes. Equal declared call caps do not imply equal actual calls or input-token work.', '',
      '| Condition | Initial verified passes/planned | Parse retries | Repair candidates verified/attempted | Selected app-check passes | Observed provider calls |',
      '|---|---:|---:|---:|---:|---:|');
    for (const condition of [...new Set(runs.map(row => row.condition))]) {
      const rows = runs.filter(row => row.condition === condition);
      const attempts = rows.flatMap(row => row.result?.attempts || []);
      const repairs = attempts.filter(attempt => attempt.kind === 'repair');
      const knownCalls = attempts.reduce((sum, attempt) => sum + (attempt.providerCalls?.length ?? 0), 0);
      const calls = rows.every(row => row.result?.attempts?.length) && attempts.every(attempt => Array.isArray(attempt.providerCalls))
        ? knownCalls : knownCalls ? `${knownCalls} recorded; remainder unrecorded` : 'unrecorded';
      const initialPasses = rows.filter(row => !report.recordedInitial && row.identityMatched === true && row.result?.attempts?.[0]?.kind === 'initial' && row.result.attempts[0].origin !== 'recorded-candidate-recheck' && row.result.attempts[0].verification?.status === 'passed').length;
      lines.push(`| ${cell(condition)} | ${initialPasses}/${rows.length} | ${attempts.filter(attempt => attempt.kind === 'parse-retry').length} | ${repairs.filter(attempt => attempt.verification?.status === 'passed').length}/${repairs.length} | ${rows.filter(passed).length} | ${calls} |`);
    }
  }
  lines.push('', '## Repetitions and attempts', '',
    'Attempt entries show kind: parsing / supplied verification. Unrecorded verification is not success. Attempt time includes in-loop verification but excludes final app checks; it is not total workflow latency.', '',
    '| Condition | Repeat | Outcome | Identity | Typecheck | Tests | Attempts | Attempt ms | Run ms | Guardrails % | Adherence % | Native | Edit application |',
    '|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---|');
  for (const row of runs) {
    const attempts = row.result?.attempts;
    const times = attempts?.map(attempt => attempt.durationMs);
    const duration = times?.length && times.every(time => Number.isFinite(time) && time >= 0)
      ? times.reduce((sum, time) => sum + time, 0) : 'unrecorded';
    const details = attempts?.map(attempt => `${cell(attempt.kind)}: ${cell(attempt.status)} / ${cell(attempt.verification?.status)}`).join('; ') || 'unrecorded';
    const identity = row.identityMatched === true ? 'matched' : row.identityMatched === false ? 'mismatch' : 'unrecorded';
    const outcome = row.status === 'passed' && !passed(row) ? 'incomplete evidence' : cell(row.status);
    const runDuration = Number.isFinite(row.durationMs) && row.durationMs >= 0 ? row.durationMs : 'unrecorded';
    const percent = value => Number.isFinite(value) && value >= 0 && value <= 1 ? (value * 100).toFixed(1) : 'unscored';
    lines.push(`| ${cell(row.condition)} | ${cell(row.repetition)} | ${outcome} | ${identity} | ${check(row.checks?.typecheck)} | ${check(row.checks?.tests)} | ${details} | ${duration} | ${runDuration} | ${percent(row.result?.axes?.guardrails)} | ${percent(row.result?.axes?.adherence)} | ${cell(row.nativeVerification?.status ?? 'not-run')} | ${cell(attempts?.map(attempt => attempt.editApplication ?? 'not-applicable').join('; ') ?? 'unrecorded')} |`);
  }
  return lines.join('\n') + '\n';
}

module.exports = { formatPilotReport, serializePilotReport };
