/**
 * Vectalon RN — SDLC modules and generators
 * Business Source License 1.1 (BSL-1.1)
 */

export { ComponentGenerator } from './ComponentGenerator'
export { TestWriter } from './TestWriter'
export { DebugAnalyzer } from './DebugAnalyzer'
export { LintFixer } from './LintFixer'
export { RequirementWriter } from './RequirementWriter'
export type { PRDInput } from './RequirementWriter'
export { StoryWriter } from './StoryWriter'
export type { UserStoryCard, StoryInput } from './StoryWriter'
export { AcceptanceCriteriaWriter } from './AcceptanceCriteriaWriter'
export { GapAnalyzer } from './GapAnalyzer'
export type { GapInput, GapAnalysis } from './GapAnalyzer'
export { SWOTAnalyzer } from './SWOTAnalyzer'
export type { SWOTInput, SWOTAnalysis } from './SWOTAnalyzer'
export { SupportTicketAnalyzer } from './SupportTicketAnalyzer'
export type { TicketTheme, TicketAnalysis } from './SupportTicketAnalyzer'
export { TestPlanWriter } from './TestPlanWriter'
export type { TestPlanInput } from './TestPlanWriter'
export { TestCaseWriter } from './TestCaseWriter'
export type { CriteriaStep } from './TestCaseWriter'
export { BugTriageAnalyzer } from './BugTriageAnalyzer'
export type { BugTriage, TriageSeverity, TriagePriority } from './BugTriageAnalyzer'
export { RootCauseAnalyzer } from './RootCauseAnalyzer'
export type { RootCauseResult, CrashRootCauseResult, CrashFacts } from './RootCauseAnalyzer'
export { CodeReviewAnalyzer, formatRuntimeMetricMessage } from './CodeReviewAnalyzer'
export type { ReviewFinding, PerfRuntimeMetric } from './CodeReviewAnalyzer'
export {
  reviewCodeWithLLM,
  parseLLMReview,
  buildLLMReviewPrompt,
  formatLLMReview,
  fixCodeWithLLM,
  buildFixPrompt,
  extractFixedCode,
} from './LLMCodeReviewer'
export type {
  LLMCodeReview,
  LLMReviewFinding,
  LLMReviewOptions,
  FixCodeOptions,
  ReviewSeverity,
} from './LLMCodeReviewer'
export { RefactorSuggester } from './RefactorSuggester'
export type { RefactorSuggestion } from './RefactorSuggester'
export { ADRWriter } from './ADRWriter'
export type { ADRInput } from './ADRWriter'
export { TradeoffAnalyzer } from './TradeoffAnalyzer'
export type { TradeoffOption, TradeoffRanking, TradeoffResult } from './TradeoffAnalyzer'
export { ThreatModeler } from './ThreatModeler'
export type { Threat } from './ThreatModeler'
export { AccessibilityChecker } from './AccessibilityChecker'
export type { AccessibilityFinding } from './AccessibilityChecker'
export { DesignSystemExtractor } from './DesignSystemExtractor'
export type { DesignToken, DesignSystem } from './DesignSystemExtractor'
export { generateFigmaComponent, findFigmaComponent } from './FigmaComponentGenerator'
export type { FigmaGeneratedComponent, FigmaGenerateOptions } from './FigmaComponentGenerator'
export { DesignComplianceChecker } from './DesignComplianceChecker'
export type { ComplianceFinding, ComplianceOptions, ComplianceSeverity } from './DesignComplianceChecker'
export { WireframeGenerator } from './WireframeGenerator'
export type { WireframeSection, WireframeSectionType } from './WireframeGenerator'
export { ReleaseNoteWriter } from './ReleaseNoteWriter'
export type { ReleaseNoteInput, ReleaseNoteCategory } from './ReleaseNoteWriter'
export { IncidentAnalyzer } from './IncidentAnalyzer'
export type { IncidentInput, IncidentAnalysis } from './IncidentAnalyzer'
export { RunbookWriter } from './RunbookWriter'
export type { RunbookInput } from './RunbookWriter'
export { KpiReportAnalyzer } from './KpiReportAnalyzer'
export type { KpiMetric, KpiResult, KpiResultMetric, KpiStatus, TelemetryKpiOptions } from './KpiReportAnalyzer'
export { MaestroFlowWriter } from './MaestroFlowWriter'
export type { MaestroFlowOptions } from './MaestroFlowWriter'
export { deriveFromGitHistory, parseCommitHistory, renderGitDerivation, isBreaking, stripCommitPrefix } from './GitHistoryDeriver'
export type {
  GitDerivation,
  GitDerivationOptions,
  GitDerivationStats,
  DerivedCommit,
  DerivedAdr,
  RawCommit,
  DerivationCategory,
} from './GitHistoryDeriver'
export {
  bucketCrashSeries,
  deriveAnomalyBaseline,
  detectCrashAnomaly,
  recordCrashBaseline,
  getLatestCrashBaseline,
  monitorReleaseAnomaly,
  renderAnomalyReport,
} from './CrashAnomalyDetector'
export type {
  CrashRateSample,
  CrashAnomalyBaseline,
  CrashAnomalyOptions,
  CrashAnomalyResult,
  AnomalyMonitorResult,
} from './CrashAnomalyDetector'
export { NativeModuleGenerator, parseNativeModuleSpec, defaultPackageName } from './NativeModuleGenerator'
export type {
  NativeModuleSpec,
  NativeMethod,
  NativeMethodParam,
  NativeComponentSpec,
  NativeComponentProp,
  GeneratedNativeModule,
  GeneratedNativeFile,
} from './NativeModuleGenerator'
