// Development pilot, not unseen native-task qualification. Run after the RN build.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const { formatPilotReport } = require('./pilot-report.cjs');
const { values: args } = require('node:util').parseArgs({ options: {
  preflight: { type: 'boolean' }, repair: { type: 'boolean' }, constrained: { type: 'boolean' },
  'include-generated': { type: 'boolean' }, model: { type: 'string' }, 'artifact-sha256': { type: 'string' },
} });
assert.equal(args.model !== undefined, args['artifact-sha256'] !== undefined, '--model and --artifact-sha256 must be supplied together');
assert.ok(args['artifact-sha256'] === undefined || /^[a-f0-9]{64}$/.test(args['artifact-sha256']), 'Expected a lowercase SHA-256 artifact hash');
assert.ok(!args.constrained || args.repair, '--constrained requires --repair for this diagnostic');
const repo = path.resolve(__dirname, '../..');
const load = file => require(path.join(repo, 'packages/rn/dist', file));
const { getPreset } = load('model/local/presets.js');
const model = args.model ?? 'qwen2.5-coder-1.5b';
assert.ok(getPreset(model), 'Unknown model preset; refusing default-model substitution');
const expectedArtifactSha256 = args['artifact-sha256'] ?? 'cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046';
const { runSandboxed } = load('sandbox/run.js');
const { createModelGenerate } = load('bench/modelGenerate.js');
const { runScenario } = load('bench/runner.js');
const { ModelRouter } = load('model/ModelRouter.js');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const appPath = 'apps/website/demo/login-app';
const app = path.join(repo, appPath);
const target = 'src/hooks/useCart.tsx';
const acceptance = fs.readFileSync(path.join(__dirname, 'cart-quantity.acceptance.tsx'), 'utf8');
const output = fs.mkdtempSync('/private/tmp/vectalon-cart-pilot-');
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim();
const archive = spawnSync('git', ['archive', revision, appPath], { cwd: repo, maxBuffer: 16 * 1024 * 1024 });
assert.equal(archive.status, 0, 'Cannot export app snapshot');
const fixturePaths = ['package.json', target, 'src/services/CatalogApi.ts'];
const fixtures = Object.fromEntries(fixturePaths.map(file => {
  const result = spawnSync('git', ['show', `${revision}:${appPath}/${file}`], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0);
  return [file, result.stdout];
}));
const scenario = {
  specVersion: 1, id: 'cart-quantity-pilot', suite: 'data-flow', title: 'Set cart quantity', scaffoldable: false,
  prompt: 'Extend useCart and its CartValue interface with setQuantity(productId: string, qty: number): void. For an existing item, a positive integer replaces its quantity; zero removes it. Negative, non-finite or fractional quantities and unknown IDs are ignored without throwing. Preserve add/remove/clear and shared provider state. count and total must reflect changes. Batched add followed by setQuantity must work. Change only src/hooks/useCart.tsx; return its complete content.',
  fixtures, expect: { files: [target], behaviors: ['setQuantity implements the stated semantics while preserving existing cart operations'] },
  correctness: { tests: true, typecheck: true, lint: false }, axes: ['correctness', 'adherence', 'guardrails'],
};
const repair = args.repair;
const constrained = args.constrained;
const settings = { temperature: 0.2, maxTokens: 2048, maxAttempts: repair ? 2 : 1, providerCallLimit: 1,
  ...(constrained ? { outputFormat: 'files-json' } : {}) };
const report = { kind: 'development-pilot', revision, startedAt: new Date().toISOString(),
  runnerSha256: hash(fs.readFileSync(__filename)), appArchiveSha256: hash(archive.stdout),
  inferenceModuleSha256: hash(fs.readFileSync(path.join(repo, 'packages/rn/dist/model/local/inference.js'))),
  acceptanceSha256: hash(acceptance), taskSha256: hash(JSON.stringify(scenario)),
  runtime: { node: process.version, platform: process.platform, arch: process.arch }, settings,
  model, expectedArtifactSha256,
  limitations: ['No native build', 'Installed dependencies reused', 'Tokens/cost not measured', 'No human correction-time measurement', 'One public development task; not launch qualification',
    ...(repair ? ['Repair diagnostic permits twice the generation budget of the first-pass pilot; not an equal-budget comparison'] : []),
    ...(constrained ? ['Native file-envelope grammar constrains serialization, not file scope or code correctness'] : [])],
  runs: Array.from({ length: 3 }, (_, repetition) => (repair ? ['vectalon-verified-repair'] : repetition % 2 ? ['vectalon', 'task-only'] : ['task-only', 'vectalon']).map(condition => ({ repetition: repetition + 1, condition, status: 'not-run' }))).flat() };
const save = () => {
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report,
    (key, value) => !args['include-generated'] && ['generatedArtifacts', 'stdout', 'stderr'].includes(key) ? undefined : value, 2));
  fs.writeFileSync(path.join(output, 'report.md'), formatPilotReport(report));
};
async function verify(files, deadline = Infinity) {
  // Reject the whole candidate before writing or executing any generated file.
  if (files.length > 1 || files.some(file => file.path !== target)) {
    return { scope: { ok: false }, typecheck: { ok: false, skipped: true }, tests: { ok: false, skipped: true } };
  }
  const root = fs.mkdtempSync('/private/tmp/vectalon-cart-check-');
  try {
    assert.equal(spawnSync('tar', ['-x', '--strip-components=4', '-C', root], { input: archive.stdout }).status, 0);
    fs.symlinkSync(path.join(app, 'node_modules'), path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, 'src/__tests__/cartPilot.tsx'), acceptance);
    for (const file of files) {
      assert.equal(file.path, target, 'Out-of-scope generated file');
      fs.writeFileSync(path.join(root, file.path), file.content);
    }
    const checks = {};
    for (const [name, args] of [
      ['typecheck', [path.join(app, 'node_modules/typescript/bin/tsc'), '--noEmit']],
      ['tests', [path.join(app, 'node_modules/jest/bin/jest.js'), '--runInBand', '--no-watchman']],
    ]) {
      const remainingMs = deadline - Date.now();
      assert(remainingMs > 0, 'Verification deadline exhausted');
      const result = await runSandboxed(process.execPath, args, { root,
        readPaths: [process.execPath, path.join(app, 'node_modules'), path.join(repo, 'node_modules')],
        timeoutMs: Math.min(60000, remainingMs), maxProcesses: 4096 });
      checks[name] = { ok: result.ok, exitCode: result.exitCode, timedOut: result.timedOut,
        isolation: result.isolation, durationMs: result.durationMs, stdout: result.stdout, stderr: result.stderr };
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
  await assert.rejects(verify([], 0), /Verification deadline exhausted/);
  report.negativeControl = await verify([]);
  save();
  assert.equal(report.negativeControl.typecheck.ok, false, 'Acceptance unexpectedly passes unchanged app');
  assert.match(report.negativeControl.typecheck.stdout + report.negativeControl.typecheck.stderr, /setQuantity/);
  assert.equal(report.negativeControl.tests.ok, false);
  // Assistant-authored verifier control, never included in inference fixtures.
  const control = fixtures[target]
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
  if (args.preflight) return;
  for (const row of report.runs) {
    row.status = 'running'; row.phase = 'generation'; row.verifications = []; save();
    console.log(`Start ${row.repetition} ${row.condition}`);
    const deadline = Date.now() + 180000;
    const timer = setTimeout(() => {
      row.status = 'timeout'; save();
      // Let the sandbox kill its process group and clean its root before exiting.
      if (row.phase !== 'verification') process.exit(1);
    }, 180000);
    try {
      const router = new ModelRouter({ zeroConfigEnabled: false });
      router.initialize({ provider: 'local', modelName: report.model });
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
      const generate = createModelGenerate({ modelRouter: router, promptMode: repair ? 'vectalon' : row.condition,
        ...settings, ...(repair ? { verify: verifier } : {}) });
      row.result = await runScenario(scenario, { generate, includeGenerated: true });
      if (Date.now() >= deadline) { row.status = 'timeout'; save(); process.exitCode = 1; break; }
      clearTimeout(timer);
      row.identityMatched = Boolean(row.result.attempts?.length) && row.result.attempts.every(attempt =>
        attempt.provider === 'local' && attempt.artifact?.sha256 === report.expectedArtifactSha256);
      const files = row.result.generatedArtifacts || [];
      if (files.length === 1 && files[0].path === target && row.identityMatched) row.checks = verified.get(hash(JSON.stringify(files))) || await verify(files);
      row.status = row.checks?.typecheck.ok && row.checks?.tests.ok ? 'passed' : 'failed';
      row.phase = 'complete';
    } catch { row.status = 'error'; }
    finally { clearTimeout(timer); save(); }
    console.log(`End ${row.repetition} ${row.condition}: ${row.status}`);
  }
}
main().then(() => process.exit(process.exitCode || 0)).catch(() => { report.error = 'Pilot failed; retained partial evidence'; save(); process.exit(1); });
