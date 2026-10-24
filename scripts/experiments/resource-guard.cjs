// Diagnostic guard only: available-budget/RSS samples are not peak GPU/RAM measurements.
function startResourceGuard(memoryBudget, timeoutMs, onStop, onHardStop) {
  const controller = new AbortController();
  const first = memoryBudget();
  const observation = { memoryMetric: first.source, availableBudgetBytesBefore: first.availableBytes,
    minimumSampledAvailableBudgetBytes: first.availableBytes, maximumSampledRssBytes: process.memoryUsage().rss,
    reserveBytes: 2 * 1024 ** 3, sampleIntervalMs: 1000, timeoutMs };
  let hardStop;
  const stop = reason => {
    if (controller.signal.aborted) return;
    observation.stopReason = reason;
    controller.abort(new Error(reason));
    onStop(reason);
    hardStop = setTimeout(onHardStop, 5000);
  };
  const sample = () => {
    const memory = memoryBudget();
    observation.availableBudgetBytesAfter = memory.availableBytes;
    observation.minimumSampledAvailableBudgetBytes = Math.min(observation.minimumSampledAvailableBudgetBytes, memory.availableBytes);
    observation.maximumSampledRssBytes = Math.max(observation.maximumSampledRssBytes, process.memoryUsage().rss);
    if (memory.source !== first.source) stop('memory-metric-changed');
    if (!Number.isFinite(memory.availableBytes) || memory.availableBytes < observation.reserveBytes) stop('memory-reserve');
  };
  const interval = setInterval(sample, 1000);
  const timer = setTimeout(() => stop('deadline'), timeoutMs);
  sample();
  return { signal: controller.signal, observation, dispose() {
    sample();
    clearInterval(interval); clearTimeout(timer); clearTimeout(hardStop);
  } };
}
module.exports = { startResourceGuard };
