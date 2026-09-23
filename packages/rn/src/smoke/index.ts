export {
  runSmoke,
  cliEntry,
  detectFlavor,
  detectSourceFiles,
  totalsFor,
  emptyTotals,
} from './runner'
export type { SmokeRunnerOptions } from './runner'
export { SMOKE_CHECKS, listSmokeChecks, getSmokeCheck } from './catalog'
export {
  renderTerminalSummary,
  renderJsonReport,
  renderActivityLog,
  renderHtmlReport,
} from './reporters'
export type {
  SmokeCheck,
  SmokeContext,
  SmokeRun,
  SmokeReport,
  SmokeTotals,
  SmokeStatus,
  SmokeCategory,
  SmokeFlavor,
  SmokeProbe,
} from './types'
export { DEMO_APPS, materializeDemoApp, runMatrix, renderMatrixHtml, renderMatrixLog, writeMatrixReport } from './matrix'
export type { DemoApp, MatrixReport, MatrixAppRun, MatrixOptions, ModelEvidence } from './matrix'
