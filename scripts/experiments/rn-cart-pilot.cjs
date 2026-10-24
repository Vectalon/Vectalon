// Development pilot, not unseen native-task qualification. Run after the RN build.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const { formatPilotReport, serializePilotReport } = require('./pilot-report.cjs');
const { taskDefinition, reviewImportsAllowed } = require('./one-app-tasks.cjs');
const { ids: controlIds, controlTask } = require('./generation-controls.cjs');
const { createSamplingRouter } = require('./sampling-control.cjs');
const { startResourceGuard } = require('./resource-guard.cjs');
const { values: args } = require('node:util').parseArgs({ options: {
  preflight: { type: 'boolean' }, repair: { type: 'boolean' }, constrained: { type: 'boolean' },
  'include-generated': { type: 'boolean' }, model: { type: 'string' }, 'artifact-sha256': { type: 'string' },
  'include-raw-response': { type: 'boolean' },
  task: { type: 'string' }, edits: { type: 'boolean' }, diagnostic: { type: 'string' }, guided: { type: 'boolean' },
  'task-relevant': { type: 'boolean' }, 'verified-controls': { type: 'boolean' },
  'sampling-control': { type: 'boolean' },
  'evaluation-lane': { type: 'string' },
  'resource-pair': { type: 'boolean' },
} });
assert.ok(!args['resource-pair'] || (args.task === 'stock-filter' && args['evaluation-lane'] === '7b'), '--resource-pair requires --task stock-filter --evaluation-lane 7b');
assert.ok(args['evaluation-lane'] === undefined || ['3b', '7b'].includes(args['evaluation-lane']), 'Unknown evaluation lane');
assert.ok(args['evaluation-lane'] === undefined || args.task !== undefined, '--evaluation-lane requires --task');
const freezeFile = args['evaluation-lane'] === '7b' ? 'one-app-evaluation-7b.json' : 'one-app-evaluation.json';
const freeze = require(`./${freezeFile}`);
assert.equal(args.model !== undefined, args['artifact-sha256'] !== undefined, '--model and --artifact-sha256 must be supplied together');
assert.ok(args['artifact-sha256'] === undefined || /^[a-f0-9]{64}$/.test(args['artifact-sha256']), 'Expected a lowercase SHA-256 artifact hash');
assert.ok(!args.constrained || args.repair, '--constrained requires --repair for this diagnostic');
assert.ok(!args.edits || (!args.task && !args.repair && !args.constrained), '--edits is a first-attempt public development diagnostic only; cannot combine with --task, --repair or --constrained');
assert.ok(!args.guided || args.diagnostic !== undefined, '--guided requires a generation control');
assert.ok(!args['task-relevant'] || (args.diagnostic !== undefined && !args.guided), '--task-relevant requires a generation control without --guided');
assert.ok(!args['verified-controls'] || (args.diagnostic !== undefined && args['task-relevant'] && !args.repair && !args.constrained && !args.edits && !args.task), '--verified-controls requires --diagnostic and --task-relevant without task, repair, constrained or edits');
assert.ok(!args['sampling-control'] || (args.diagnostic !== undefined && args['task-relevant'] && !args['verified-controls'] && !args.task && !args.repair && !args.edits && !args.constrained), '--sampling-control requires --diagnostic and --task-relevant without verified-controls, task, repair, edits or constrained');
if (args.diagnostic !== undefined) {
  assert.ok(controlIds.includes(args.diagnostic), 'Unknown generation control');
  assert.ok(!args.task && !args.edits && !args.repair && !args.constrained, 'Generation controls cannot combine with task, edits, repair or constrained');
  assert.ok(args.model !== undefined, 'Generation controls require an explicit model and artifact identity');
}
if (args.task !== undefined) {
  assert.ok(freeze.tasks.includes(args.task), 'Unknown frozen evaluation task');
  assert.ok(!args.repair && !args.constrained, 'Frozen first-pass evaluation does not allow repair or grammar changes');
  assert.ok(args.model === undefined || args.model === freeze.model, 'Frozen evaluation model cannot change');
  assert.ok(args['artifact-sha256'] === undefined || args['artifact-sha256'] === freeze.artifactSha256, 'Frozen evaluation artifact cannot change');
}
const repo = path.resolve(__dirname, '../..');
const load = file => require(path.join(repo, 'packages/rn/dist', file));
const { getPreset } = load('model/local/presets.js');
const model = args.model ?? (args.task ? freeze.model : 'qwen2.5-coder-1.5b');
assert.ok(getPreset(model), 'Unknown model preset; refusing default-model substitution');
const expectedArtifactSha256 = args['artifact-sha256'] ?? (args.task ? freeze.artifactSha256 : 'cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046');
const { runSandboxed } = load('sandbox/run.js');
const { createModelGenerate } = load('bench/modelGenerate.js');
const { createModelEditGenerate } = args.edits || args.diagnostic ? load('bench/modelEditGenerate.js') : {};
const { runScenario } = load('bench/runner.js');
const { ModelRouter } = load('model/ModelRouter.js');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
for (const [file, expected] of Object.entries(freeze.inputs ?? {})) {
  if (args.task) assert.equal(hash(fs.readFileSync(path.join(__dirname, file))), expected, `Frozen evaluation input changed: ${file}`);
}
const appPath = 'apps/website/demo/login-app';
const app = path.join(repo, appPath);
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim();
const appRevision = args.task ? freeze.appRevision : revision;
const readApp = file => {
  const result = spawnSync('git', ['show', `${appRevision}:${appPath}/${file}`], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0);
  return result.stdout;
};
const task = args.task ? taskDefinition(args.task, readApp) : args.diagnostic ? controlTask(args.diagnostic) : undefined;
const target = task?.target ?? 'src/hooks/useCart.tsx';
const acceptance = task?.acceptance ?? fs.readFileSync(path.join(__dirname, 'cart-quantity.acceptance.tsx'), 'utf8');
const archive = spawnSync('git', ['archive', appRevision, appPath], { cwd: repo, maxBuffer: 16 * 1024 * 1024 });
assert.equal(archive.status, 0, 'Cannot export app snapshot');
const fixturePaths = task?.fixturePaths ?? ['package.json', target, 'src/services/CatalogApi.ts'];
const fixtures = args.diagnostic ? { [target]: task.original }
  : { ...Object.fromEntries(fixturePaths.map(file => [file, readApp(file)])), ...task?.extraFixtures };
const installedDependencyVersions = {};
if (args.task) {
  const lock = JSON.parse(readApp('package-lock.json'));
  assert.equal(fs.readFileSync(path.join(app, 'package-lock.json'), 'utf8'), readApp('package-lock.json'), 'Installed app lockfile differs from frozen baseline');
  const manifest = JSON.parse(fixtures['package.json']);
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    const version = JSON.parse(fs.readFileSync(path.join(app, 'node_modules', name, 'package.json'), 'utf8')).version;
    assert.equal(version, lock.packages[`node_modules/${name}`].version, `Installed version differs for ${name}`);
    installedDependencyVersions[name] = version;
  }
}
const scenario = {
  specVersion: 1, id: 'cart-quantity-pilot', suite: 'data-flow', title: 'Set cart quantity', scaffoldable: false,
  prompt: 'Extend useCart and its CartValue interface with setQuantity(productId: string, qty: number): void. For an existing item, a positive integer replaces its quantity; zero removes it. Negative, non-finite or fractional quantities and unknown IDs are ignored without throwing. Preserve add/remove/clear and shared provider state. count and total must reflect changes. Batched add followed by setQuantity must work. Change only src/hooks/useCart.tsx; return its complete content.',
  fixtures, expect: { files: [target], behaviors: ['setQuantity implements the stated semantics while preserving existing cart operations'] },
  correctness: { tests: true, typecheck: true, lint: false }, axes: ['correctness', 'adherence', 'guardrails'],
};
if (task) {
  scenario.id = task.id; scenario.title = task.id; scenario.suite = task.kind;
  scenario.prompt = task.prompt;
  scenario.expect = { files: [target], behaviors: [task.prompt] };
}
const repair = args.repair;
const verifiedControls = args['verified-controls'];
const samplingControl = args['sampling-control'];
const constrained = args.constrained;
const settings = { temperature: 0.2, maxTokens: 2048, maxAttempts: repair || verifiedControls ? 2 : 1, providerCallLimit: 1,
  ...(constrained ? { outputFormat: 'files-json' } : {}), ...(args.edits ? { toolEnvelope: true, requiredTool: 'propose_edits', anchorMode: 'top-level-source-blocks' } : {}) };
if (args.task) assert.deepEqual(settings, freeze.settings, 'Frozen resource settings changed');
const output = fs.mkdtempSync('/private/tmp/vectalon-cart-pilot-');
const report = { kind: args.task ? 'frozen-one-app-evaluation' : 'development-pilot', revision, appRevision, startedAt: new Date().toISOString(),
  ...(args['resource-pair'] ? { kind: 'bounded-one-app-resource-pair', resourceProtocol: {
    routing: 'direct native in both conditions; no router enrichment/fallback; default sampling unchanged',
    rowLimit: 2, reserveBytes: 2 * 1024 ** 3, sampleIntervalMs: 1000, hardStopGraceMs: 5000,
    guardSha256: hash(fs.readFileSync(path.join(__dirname, 'resource-guard.cjs'))),
    adapterSha256: hash(fs.readFileSync(path.join(__dirname, 'sampling-control.cjs'))),
    memoryModuleSha256: hash(fs.readFileSync(path.join(repo, 'packages/rn/dist/model/local/memory.js'))),
  } } : {}),
  ...(args.diagnostic ? { controlDefinitionsSha256: hash(fs.readFileSync(path.join(__dirname, 'generation-controls.cjs'))),
    conditionSettings: samplingControl ? {
      'repeat-default': { ...settings, output: 'task-relevant full-file JSON; existing repetition penalties' },
      'repeat-off': { ...settings, output: 'task-relevant full-file JSON; repetition penalties disabled' },
    } : args['task-relevant'] ? { 'task-only': { ...settings, output: 'full-file JSON; no requested grammar' },
      'task-relevant': { ...settings, output: 'minimal source-grounded full-file JSON; no requested grammar' } }
      : args.guided ? { vectalon: { ...settings, output: 'existing guided full-file JSON; no requested grammar' } }
      : { 'task-only': { ...settings, output: 'full-file JSON; no requested grammar' },
        'vectalon-edits': { ...settings, requiredTool: 'propose_edits', anchorMode: 'top-level-source-blocks' } } } : {}),
  ...(task ? { task: { id: task.id, kind: task.kind } } : {}),
  ...(args.task ? {
    installedDependencyVersions,
    evaluationLane: args['evaluation-lane'] ?? '3b',
    freezeSha256: hash(fs.readFileSync(path.join(__dirname, freezeFile))),
    taskDefinitionsSha256: hash(fs.readFileSync(path.join(__dirname, 'one-app-tasks.cjs'))),
    dependencyLockSha256: hash(fs.readFileSync(path.join(app, 'package-lock.json'))),
    nativeVerification: 'not-run' } : {}),
  runnerSha256: hash(fs.readFileSync(__filename)), appArchiveSha256: hash(archive.stdout),
  generationModuleSha256: hash(fs.readFileSync(path.join(repo, 'packages/rn/dist/bench', args.edits ? 'modelEditGenerate.js' : 'modelGenerate.js'))),
  ...(args.diagnostic && !args.guided ? { editGenerationModuleSha256: hash(fs.readFileSync(path.join(repo, 'packages/rn/dist/bench/modelEditGenerate.js'))) } : {}),
  inferenceModuleSha256: hash(fs.readFileSync(path.join(repo, 'packages/rn/dist/model/local/inference.js'))),
  acceptanceSha256: hash(acceptance), taskSha256: hash(JSON.stringify(scenario)),
  runtime: { node: process.version, platform: process.platform, arch: process.arch }, settings,
  ...(verifiedControls ? { verificationMode: 'both conditions: bounded app verifier; compiler-only diagnostics and generic test-failure feedback' } : {}),
  ...(samplingControl ? { samplingControl: { adapterSha256: hash(fs.readFileSync(path.join(__dirname, 'sampling-control.cjs'))),
    routing: 'direct native inference; no enrichment or fallback in either lane', promptMode: 'task-relevant', minP: 0.05,
    repeatDefault: { penalty: 1.1, lastTokens: 512, frequencyPenalty: 0.3, presencePenalty: 0.2 }, repeatOff: false } } : {}),
  model, expectedArtifactSha256,
  limitations: ['No native build', 'Installed dependencies reused', 'Tokens/cost not measured', 'No human correction-time measurement', ...(args.task ? freeze.limitations : ['Public development tasks; not launch qualification']),
    ...(args.diagnostic ? ['Synthetic controls in one installed app; not held-out RN workflow evidence', 'Conditions change instructions; input-token budgets are unmeasured; not a single-factor causal ablation'] : []),
    ...(args['task-relevant'] ? ['Experimental guidance uses original source and a general React state-queue rule; textual useState-call detection does not qualify aliases or arbitrary state libraries'] : []),
    ...(repair ? ['Repair diagnostic permits twice the generation budget of the first-pass pilot; not an equal-budget comparison'] : []),
    ...(verifiedControls ? ['Both conditions permit at most two provider calls and 4096 output tokens; actual work and input tokens differ. Earlier single-attempt results are not equal-budget controls.'] : []),
    ...(samplingControl ? ['Direct native sampling diagnostic in both lanes, not the production router; repetition penalties alone differ; historical router runs are not causal controls.'] : []),
    ...(constrained ? ['Native file-envelope grammar constrains serialization, not file scope or code correctness'] : []),
    ...(args.edits ? ['Scoped edit protocol differs from full-file generation; single existing file, at most eight edits, no repairs', 'Block IDs select unique original top-level TypeScript/JSX spans; repeated selections are rejected and exact application is checked again', 'Block catalogue repeats approved source in context; input-token cost is not measured', 'Source-grounded grammar does not establish code correctness or task improvement'] : [])],
  runs: Array.from({ length: args.task ? freeze.repetitions : 3 }, (_, repetition) => (samplingControl ? (repetition % 2 ? ['repeat-off', 'repeat-default'] : ['repeat-default', 'repeat-off']) : args['task-relevant'] ? (repetition % 2 ? ['task-relevant', 'task-only'] : ['task-only', 'task-relevant']) : args.guided ? ['vectalon'] : args.diagnostic ? (repetition % 2 ? ['vectalon-edits', 'task-only'] : ['task-only', 'vectalon-edits']) : args.edits ? ['vectalon-edits'] : repair ? ['vectalon-verified-repair'] : repetition % 2 ? ['vectalon', 'task-only'] : ['task-only', 'vectalon']).map(condition => ({ repetition: repetition + 1, condition, status: 'not-run' }))).flat() };
const save = () => {
  fs.writeFileSync(path.join(output, 'report.json'), serializePilotReport(report, {
    includeGenerated: args['include-generated'], includeRawResponse: args['include-raw-response'],
  }));
  fs.writeFileSync(path.join(output, 'report.md'), formatPilotReport(report));
};
async function verify(files, deadline = Infinity, acceptanceSource = acceptance, probeSource) {
  // Reject the whole candidate before writing or executing any generated file.
  if (files.length > 1 || files.some(file => file.path !== target) || (task?.kind === 'review' &&
    (files.length !== 1 || !reviewImportsAllowed(files[0].content, require(path.join(app, 'node_modules/typescript')))))) {
    return { scope: { ok: false }, typecheck: { ok: false, skipped: true }, tests: { ok: false, skipped: true } };
  }
  const root = fs.mkdtempSync('/private/tmp/vectalon-cart-check-');
  try {
    assert.equal(spawnSync('tar', ['-x', '--strip-components=4', '-C', root], { input: archive.stdout }).status, 0);
    fs.symlinkSync(path.join(app, 'node_modules'), path.join(root, 'node_modules'));
    if (args.diagnostic) fs.writeFileSync(path.join(root, target), task.original);
    if (acceptanceSource) fs.writeFileSync(path.join(root, 'src/__tests__/cartPilot.tsx'), acceptanceSource);
    if (probeSource) fs.writeFileSync(path.join(root, 'App.tsx'), probeSource);
    for (const file of files) {
      assert.equal(file.path, target, 'Out-of-scope generated file');
      fs.writeFileSync(path.join(root, file.path), file.content);
    }
    const checks = {};
    async function check(args) {
      const remainingMs = deadline - Date.now();
      assert(remainingMs > 0, 'Verification deadline exhausted');
      const result = await runSandboxed(process.execPath, args, { root,
        readPaths: [process.execPath, path.join(app, 'node_modules'), path.join(repo, 'node_modules')],
        timeoutMs: Math.min(60000, remainingMs), maxProcesses: 4096 });
      return { ok: result.ok, exitCode: result.exitCode, timedOut: result.timedOut,
        isolation: result.isolation, durationMs: result.durationMs, stdout: result.stdout, stderr: result.stderr };
    }
    for (const [name, args] of [
      ['typecheck', [path.join(app, 'node_modules/typescript/bin/tsc'), '--noEmit']],
      ['tests', [path.join(app, 'node_modules/jest/bin/jest.js'), '--runInBand', '--no-watchman']],
    ]) {
      checks[name] = await check(args);
    }
    if (task?.kind === 'review') {
      checks.originalTests = checks.tests;
      fs.writeFileSync(path.join(root, task.proposalPath), task.proposal);
      const resultFile = path.join(root, 'review-results.json');
      checks.proposedTests = await check([path.join(app, 'node_modules/jest/bin/jest.js'), '--runInBand', '--no-watchman',
        '--runTestsByPath', target, '--json', '--outputFile', resultFile]);
      let summary;
      try { summary = JSON.parse(fs.readFileSync(resultFile, 'utf8')); } catch { /* Missing evidence is failure. */ }
      checks.proposedTests.assertionFailures = summary?.numFailedTests ?? 0;
      checks.tests = { ok: Boolean(checks.originalTests.ok && checks.proposedTests.exitCode === 1 && !checks.proposedTests.timedOut &&
        summary?.numFailedTests > 0 && summary?.numRuntimeErrorTestSuites === 0 &&
        summary?.testResults?.length === 1 && summary.testResults[0].name === path.join(root, target)),
        durationMs: checks.originalTests.durationMs + checks.proposedTests.durationMs };
    }
    return checks;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
async function main() {
  save();
  console.log(`Evidence: ${output}`);
  for (const files of [
    [{ path: '../outside.ts', content: 'not executed' }],
    [{ path: '/tmp/outside.ts', content: 'not executed' }],
    [{ path: target, content: '' }, { path: 'src/services/CatalogApi.ts', content: '' }],
    [{ path: target, content: '' }, { path: target, content: '' }],
  ]) {
    assert.deepEqual(await verify(files, 0), {
      scope: { ok: false }, typecheck: { ok: false, skipped: true }, tests: { ok: false, skipped: true },
    });
  }
  if (task?.kind !== 'review') await assert.rejects(verify([], 0), /Verification deadline exhausted/);
  report.negativeControl = await verify(task?.kind === 'review' ? [{ path: target, content: "it('does not detect a regression', () => { expect(true).toBe(true); });" }] : []);
  save();
  if (!task) {
    assert.equal(report.negativeControl.typecheck.ok, false, 'Acceptance unexpectedly passes unchanged app');
    assert.match(report.negativeControl.typecheck.stdout + report.negativeControl.typecheck.stderr, /setQuantity/);
  }
  assert.equal(report.negativeControl.tests.ok, false);
  if (args.diagnostic) assert.equal(report.negativeControl.typecheck.ok, true, 'Control must fail behavior, not missing source or compilation');
  // Assistant-authored verifier control, never included in inference fixtures.
  const control = task?.positiveControl ?? fixtures[target]
    .replace('  clear: () => void;', '  clear: () => void;\n  setQuantity: (productId: string, qty: number) => void;')
    .replace('  const clear =', `  const setQuantity = useCallback((productId: string, qty: number) => {
    if (!Number.isInteger(qty) || qty < 0) return;
    setLines(prev => qty === 0 ? prev.filter(line => line.product.id !== productId)
      : prev.map(line => line.product.id === productId ? { ...line, qty } : line));
  }, []);
  const clear =`)
    .replace('value={{ lines, add, remove, clear, count, total }}', 'value={{ lines, add, remove, clear, count, total, setQuantity }}');
  report.positiveControl = await verify([{ path: target, content: control }]);
  save();
  assert.equal(report.positiveControl.typecheck.ok, true, 'Verifier control does not compile');
  assert.equal(report.positiveControl.tests.ok, true, 'Verifier control does not satisfy acceptance');
  if (args.task === 'current-session') {
    const probe = fs.readFileSync(path.join(__dirname, 'current-session.native.tsx'), 'utf8');
    const probeAcceptance = fs.readFileSync(path.join(__dirname, 'current-session.probe.acceptance.tsx'), 'utf8');
    report.nativeProbePreflight = { method: 'Disposable probe UI and real hook under Jest/native shims; NOT native build/device evidence',
      probeSha256: hash(probe), acceptanceSha256: hash(probeAcceptance),
      negative: await verify([], Infinity, probeAcceptance, probe),
      positive: await verify([{ path: target, content: control }], Infinity, probeAcceptance, probe) };
    save();
    assert.equal(report.nativeProbePreflight.negative.typecheck.ok, true);
    assert.equal(report.nativeProbePreflight.negative.tests.ok, false);
    assert.equal(report.nativeProbePreflight.positive.typecheck.ok, true);
    assert.equal(report.nativeProbePreflight.positive.tests.ok, true);
  }
  if (task?.priorAcceptance) {
    report.priorAcceptanceControl = await verify([], Infinity, task.priorAcceptance);
    save();
    assert.equal(report.priorAcceptanceControl.typecheck.ok, true);
    assert.equal(report.priorAcceptanceControl.tests.ok, true, 'Stress negative must pass the earlier finite acceptance cases');
  }
  if (args.preflight) return;
  for (const row of args['resource-pair'] ? report.runs.slice(0, 2) : report.runs) {
    const started = Date.now();
    row.status = 'running'; row.phase = 'generation'; row.verifications = []; save();
    console.log(`Start ${row.repetition} ${row.condition}`);
    const timeoutMs = task ? freeze.timeoutMs : 180000;
    const deadline = Date.now() + timeoutMs;
    const timer = args['resource-pair'] ? undefined : setTimeout(() => {
      row.status = 'timeout'; save();
      // Let the sandbox kill its process group and clean its root before exiting.
      if (row.phase !== 'verification') process.exit(1);
    }, timeoutMs);
    const guard = args['resource-pair'] ? startResourceGuard(load('model/local/memory.js').nativeMemoryBudget, timeoutMs,
      reason => { row.status = reason === 'deadline' ? 'timeout' : 'resource-aborted'; row.resourceStopReason = reason; row.durationMs = Date.now() - started; save(); },
      () => { if (row.phase !== 'verification') process.exit(1); }) : undefined;
    if (guard) row.resources = guard.observation;
    try {
      guard?.signal.throwIfAborted();
      const router = guard ? createSamplingRouter((model, options) => {
        guard.signal.throwIfAborted();
        return load('model/local/inference.js').runInference(model, { ...options, signal: guard.signal });
      }, report.model, false) : samplingControl ? createSamplingRouter(load('model/local/inference.js').runInference, report.model, row.condition === 'repeat-off')
        : new ModelRouter({ zeroConfigEnabled: false });
      if (!samplingControl && !guard) router.initialize({ provider: 'local', modelName: report.model });
      const verified = new Map();
      const verifier = async files => {
        row.phase = 'verification';
        const verification = { status: 'running', generatedArtifacts: files };
        row.verifications.push(verification); save();
        let checks;
        try { checks = await verify(files, deadline); }
        catch (error) { verification.status = Date.now() >= deadline ? 'timeout' : 'error'; save(); throw error; }
        verification.status = checks.typecheck.ok && checks.tests.ok ? 'passed' : 'failed';
        verification.checks = checks;
        row.phase = 'generation'; save();
        assert(Date.now() < deadline, 'Verification deadline exhausted');
        verified.set(hash(JSON.stringify(files)), checks);
        // Only diagnostics for the generated file; never acceptance source/assertions.
        const diagnostics = (checks.typecheck.stdout || '').split('\n').filter(line => line.startsWith(`${target}(`));
        return { passed: checks.typecheck.ok && checks.tests.ok,
          feedback: checks.scope?.ok === false ? `Scope rejected. Return exactly one file: ${target}. No checks were executed.`
            : [...diagnostics, ...(!checks.tests.ok ? ['Task/project tests failed. Recheck the original requirements.'] : []),
              ...(!checks.typecheck.ok ? ['Typecheck failed. Preserve the requested public interface.'] : [])].join('\n') };
      };
      const generate = (args.edits || row.condition === 'vectalon-edits' ? createModelEditGenerate : createModelGenerate)({ modelRouter: router, promptMode: samplingControl ? 'task-relevant' : repair ? 'vectalon' : row.condition,
        ...settings, ...(repair || verifiedControls ? { verify: verifier } : {}),
        ...(args['include-raw-response'] ? { onRawResponse: (content, attempt) => {
          (row.rawResponses ??= []).push({ ...attempt, content }); save();
        } } : {}) });
      row.result = await runScenario(scenario, { generate, includeGenerated: true });
      guard?.signal.throwIfAborted();
      if (Date.now() >= deadline) { row.status = 'timeout'; save(); process.exitCode = 1; break; }
      row.identityMatched = Boolean(row.result.attempts?.length) && row.result.attempts.every(attempt =>
        attempt.provider === 'local' && attempt.artifact?.sha256 === report.expectedArtifactSha256);
      const files = row.result.generatedArtifacts || [];
      row.phase = 'verification';
      if (files.length === 1 && files[0].path === target && row.identityMatched) row.checks = verified.get(hash(JSON.stringify(files))) || await verify(files, deadline);
      if ((args.edits || args.diagnostic) && !row.checks) row.checks = { typecheck: { ok: false, skipped: true }, tests: { ok: false, skipped: true } };
      row.status = Date.now() >= deadline ? 'timeout' : row.checks?.typecheck.ok && row.checks?.tests.ok ? 'passed' : 'failed';
      row.phase = 'complete';
    } catch { row.status = Date.now() >= deadline ? 'timeout' : 'error'; }
    finally {
      clearTimeout(timer); guard?.dispose();
      if (guard?.signal.aborted) row.status = row.resourceStopReason === 'deadline' ? 'timeout' : 'resource-aborted';
      row.durationMs = Date.now() - started; save();
    }
    console.log(`End ${row.repetition} ${row.condition}: ${row.status}`);
    if (guard?.signal.aborted) { process.exitCode = 1; break; }
  }
}
main().then(() => process.exit(process.exitCode || 0)).catch(() => { report.error = 'Pilot failed; retained partial evidence'; save(); process.exit(1); });
