/**
 * Vectalon RN — Feature self-test suite
 * Business Source License 1.1 (BSL-1.1)
 *
 * `vectalon selftest` exercises every feature of the harness in a sandboxed,
 * offline way and produces a visible report (terminal + HTML dashboard) plus
 * an activity trace of every step, shell command, and file modification.
 */

export { FEATURE_CATALOG, getFeatureCheck, listFeatureChecks, categorizeChecks } from './catalog'
export { runSelfTest, totalsForRuns } from './runner'
export type { SelfTestProgressHooks } from './runner'
export { ActivityTracer, Sandbox, createTracedRunner } from './trace'
export { LiveProgressReporter } from './progress'
export type { LiveProgressReporterOptions } from './progress'
export {
  renderTerminalReport,
  renderTerminalSummary,
  renderActivityLog,
  renderHtmlReport,
  renderJsonReport,
} from './reporters'
export { SELF_TEST_CATEGORIES } from './types'
export type {
  FeatureCheck,
  CheckResult,
  CheckRun,
  SelfTestContext,
  SelfTestCategory,
  SelfTestOptions,
  SelfTestReport,
  SelfTestTotals,
  SelfTestActivity,
  TraceStep,
  TraceStepKind,
  TraceCommand,
  TraceWrite,
  TraceArtifact,
  CheckStatus,
  ModelProviderChoice,
} from './types'
