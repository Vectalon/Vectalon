const assert = require('node:assert/strict');

// Direct native lane: identical prompt assembly, no enrichment, retries or fallback.
function createSamplingRouter(runInference, model, disableRepeatPenalty) {
  assert.equal(typeof disableRepeatPenalty, 'boolean');
  return { generate: async request => {
    assert.equal(request.projectContext, 'disabled');
    assert.equal(request.providerCallLimit, 1);
    assert.equal(request.tools, undefined);
    assert.equal(request.outputFormat, undefined);
    const started = Date.now();
    const result = await runInference(model, {
      systemPrompt: request.systemPrompt,
      prompt: request.context ? `\nContext:\n${request.context}\n${request.prompt}` : request.prompt,
      temperature: request.temperature, maxTokens: request.maxTokens,
      ...(disableRepeatPenalty ? { repeatPenalty: false } : {}),
    });
    return { content: result.content, stopReason: result.stopReason, artifact: result.artifact,
      provider: 'local', model: { id: result.modelId, source: 'configured' },
      providerCalls: [{ provider: 'local', status: 'response', durationMs: Date.now() - started }] };
  } };
}
module.exports = { createSamplingRouter };
