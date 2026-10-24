// Resource calibration only: one 7B call with public app input and eight output tokens.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const freeze = require('./one-app-evaluation-7b.json');
const { taskDefinition } = require('./one-app-tasks.cjs');
const { createModelGenerate } = require('../../packages/rn/dist/bench/modelGenerate.js');
const { runInference } = require('../../packages/rn/dist/model/local/inference.js');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

async function main() {
  for (const [file, expected] of Object.entries(freeze.inputs)) assert.equal(hash(fs.readFileSync(path.join(__dirname, file))), expected);
  const read = file => execFileSync('git', ['show', `${freeze.appRevision}:apps/website/demo/login-app/${file}`], { encoding: 'utf8' });
  const task = taskDefinition('stock-filter', read);
  const report = { kind: 'native-context-resource-calibration', revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    model: freeze.model, expectedArtifactSha256: freeze.artifactSha256, appRevision: freeze.appRevision,
    inferenceModuleSha256: hash(fs.readFileSync(path.join(__dirname, '../../packages/rn/dist/model/local/inference.js'))),
    task: task.id, outputTokenCap: 8, timeoutMs: 60000, sampleIntervalMs: 1000,
    limitations: ['One public-input calibration call; no task/native-app/model-quality qualification',
      'Sampled host free RAM and process RSS are not peak GPU/RAM measurements', '7B on hosts below the recommended 32 GB class remains experimental'] };
  const controller = new AbortController();
  const started = Date.now();
  let minimumFree = os.freemem(), maximumRss = process.memoryUsage().rss;
  report.host = { totalBytes: os.totalmem(), freeBytesBefore: minimumFree };
  const sample = () => {
    minimumFree = Math.min(minimumFree, os.freemem());
    maximumRss = Math.max(maximumRss, process.memoryUsage().rss);
    if (os.freemem() < 2 * 1024 ** 3) controller.abort(new Error('Resource reserve reached'));
  };
  const interval = setInterval(sample, 1000);
  const timer = setTimeout(() => controller.abort(new Error('Calibration deadline reached')), 60000);
  let calls = 0;
  try {
    const generate = createModelGenerate({ promptMode: 'task-only', maxAttempts: 1, maxTokens: 8, providerCallLimit: 1,
      modelRouter: { generate: async request => {
        assert.equal(++calls, 1);
        assert.equal(request.projectContext, 'disabled');
        report.requestSha256 = hash(JSON.stringify(request));
        const result = await runInference(freeze.model, { systemPrompt: request.systemPrompt,
          prompt: request.context ? `\nContext:\n${request.context}\n${request.prompt}` : request.prompt,
          maxTokens: 8, temperature: 0.2, signal: controller.signal });
        report.artifact = result.artifact;
        report.localContext = result.localContext;
        report.stopReason = result.stopReason;
        assert.equal(result.artifact?.sha256, freeze.artifactSha256);
        assert.equal(result.localContext?.maxOutputTokens, 8);
        assert.ok(result.localContext.inputTokens + 8 + 256 <= result.localContext.contextSize);
        assert.ok(result.localContext.contextSize <= 16384);
        report.observationVerified = true;
        // Discard response text: this output budget cannot establish a working app change.
        return { content: '', provider: 'local' };
      } } });
    await generate({ specVersion: 1, id: task.id, suite: task.kind, title: task.id, scaffoldable: false,
      prompt: task.prompt, fixtures: Object.fromEntries(task.fixturePaths.map(file => [file, read(file)])),
      expect: { files: [task.target], behaviors: [task.prompt] }, axes: ['guardrails', 'adherence'],
      correctness: { tests: true, typecheck: true, lint: false } });
  } finally {
    clearInterval(interval); clearTimeout(timer); sample();
    report.durationMs = Date.now() - started;
    report.nativeCallAttempts = calls;
    report.host = { ...report.host, minimumSampledFreeBytes: minimumFree, maximumSampledRssBytes: maximumRss, freeBytesAfter: os.freemem() };
  }
  report.outcome = report.observationVerified && !controller.signal.aborted ? 'completed' : controller.signal.aborted ? 'aborted' : 'refused-or-error';
  return report;
}
main().then(report => { console.log(`CALIBRATION=${JSON.stringify(report)}`); process.exit(report.outcome === 'completed' ? 0 : 1); })
  .catch(() => { console.error('Calibration setup failed; no model result claimed.'); process.exit(1); });
