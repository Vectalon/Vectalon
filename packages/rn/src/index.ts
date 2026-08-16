/**
 * @vectalon/rn — React Native adaptive AI harness
 * Business Source License 1.1 (BSL-1.1)
 * © 2026 Vectalon. Commercial use requires a paid license.
 * See LICENSE for details.
 */

// Re-export core interfaces for convenience
export type { Tier, TierCheck, Product, Feature } from '@vectalon-dev/core'
export { requireTier } from '@vectalon-dev/core'

export { Scanner, ContextEngine, parseSource, analyzeSourceFile, walk, buildKnowledgeGraph, extractExpoRoutes, computeReRenderImpact } from './harness'
export { detectWorkspace, findWorkspaceRoot, resolveNodeModulesRoot } from './harness'
export type { ProjectInfo, FileNode, ComponentInfo, ContextSnapshot } from './harness'
export type { WorkspaceInfo, WorkspaceManager } from './harness'
export type { PlatformSuffix, ImportInfo, ExportInfo, HookCall, NavigatorInfo, NavigationInfo, ComponentDef, SourceAnalysis } from './harness'
export type { GraphComponent, GraphEdge, GraphHookUsage, GraphNavigator, GraphNativeModule, GraphStore, GraphExpoRoute, ReRenderImpact, RNGraph } from './harness'

export { ModelRouter, WasmProvider, wasmZeroConfigEnabled } from './model'
export { getWasmPreset, wasmDtype, wasmCacheDir, wasmCacheReady, WASM_MODEL_PRESETS } from './model'
export type { ModelConfig, ModelRequest, ModelResponse, ModelProviderType } from './model'
export type { WasmModelPreset, WasmProviderOptions } from './model'

export { MCPServer } from './protocol'
export type { AgentTool, ToolCall, ToolResult, ProtocolType } from './protocol'

export { ComponentGenerator, TestWriter, DebugAnalyzer, LintFixer } from './sdlc'
export {
  RequirementWriter,
  StoryWriter,
  AcceptanceCriteriaWriter,
  GapAnalyzer,
  SWOTAnalyzer,
  SupportTicketAnalyzer,
} from './sdlc'
export {
  TestPlanWriter,
  TestCaseWriter,
  BugTriageAnalyzer,
  RootCauseAnalyzer,
  CodeReviewAnalyzer,
  RefactorSuggester,
} from './sdlc'
export {
  reviewCodeWithLLM,
  parseLLMReview,
  buildLLMReviewPrompt,
  formatLLMReview,
  fixCodeWithLLM,
  buildFixPrompt,
  extractFixedCode,
} from './sdlc'
export type {
  LLMCodeReview,
  LLMReviewFinding,
  LLMReviewOptions,
  FixCodeOptions,
  ReviewSeverity,
} from './sdlc'
export {
  ADRWriter,
  TradeoffAnalyzer,
  ThreatModeler,
  AccessibilityChecker,
  DesignSystemExtractor,
  WireframeGenerator,
} from './sdlc'
export {
  ReleaseNoteWriter,
  IncidentAnalyzer,
  RunbookWriter,
  KpiReportAnalyzer,
} from './sdlc'
export type {
  PRDInput,
  UserStoryCard,
  StoryInput,
  GapInput,
  GapAnalysis,
  SWOTInput,
  SWOTAnalysis,
  TicketTheme,
  TicketAnalysis,
} from './sdlc'
export type {
  TestPlanInput,
  CriteriaStep,
  BugTriage,
  TriageSeverity,
  TriagePriority,
  RootCauseResult,
  ReviewFinding,
  RefactorSuggestion,
} from './sdlc'
export type {
  ADRInput,
  TradeoffOption,
  TradeoffRanking,
  TradeoffResult,
  Threat,
  AccessibilityFinding,
  DesignToken,
  DesignSystem,
  WireframeSection,
  WireframeSectionType,
} from './sdlc'
export type {
  ReleaseNoteInput,
  ReleaseNoteCategory,
  IncidentInput,
  IncidentAnalysis,
  RunbookInput,
  KpiMetric,
  KpiResult,
  KpiResultMetric,
  KpiStatus,
  CrashRootCauseResult,
  CrashFacts,
  TelemetryKpiOptions,
} from './sdlc'
export { TelemetryIngestionService, DEFAULT_TELEMETRY_DIRS } from './knowledge'
export { parseTelemetryContent, parseSentryExport, parseCrashlyticsReport, detectTelemetryFormat } from './knowledge'
export type { TelemetryEvent, ParsedCrash, ParsedTrace, ParsedAnalyticsEvent, TelemetryFormat, TelemetryIngestResult } from './knowledge'

export { PatternLearner, ProjectMemory } from './memory'
export type { Pattern, PatternStore } from './memory'

export { ArtifactStore, TeamStore, KnowledgeIndex, Traceability, RoleEngine, ARTIFACT_TYPES, ARTIFACT_ROLES, ROLE_ARTIFACT_TYPES, checksum } from './knowledge'
export { cosineSimilarity, HashEmbeddingProvider } from './knowledge'
export { OpenAIEmbeddingProvider, OpenAICompatibleEmbeddingProvider, createRemoteEmbeddingProvider } from './knowledge'
export {
  SOURCE_CONFIDENCE,
  STATUS_CONFIDENCE,
  stalenessDate,
  recencyFactor,
  computeConfidence,
  artifactProvenance,
  confidenceFactor,
  rankByConfidence,
  patternProvenance,
} from './knowledge'
export type { Provenance, ProvenanceOptions, PatternSource } from './knowledge'
export { ArtifactSync, readSyncConfig, writeSyncConfig, createArtifactSync, DEFAULT_SYNC_BRANCH } from './knowledge'
export type { EmbeddingProvider, RemoteEmbeddingProvider } from './knowledge'
export type { ArtifactSyncConfig, SyncResult, SyncOptions } from './knowledge'
export type {
  Artifact,
  ArtifactVersion,
  ArtifactType,
  ArtifactSource,
  ArtifactStatus,
  ArtifactRole,
  ProjectRegistration,
  TeamSearchQuery,
  TeamSearchResult,
  ProjectSummary,
  TeamContextOptions,
  TeamStoreOptions,
  IndexedArtifact,
  KnowledgeSearchOptions,
  KnowledgeSearchResult,
} from './knowledge'

export { getConfig, setConfig } from './config'

export {
  startDaemon,
  stopDaemon,
  daemonStatus,
  isDaemonRunning,
  readDaemonState,
  daemonStatePath,
  PROBE_INTERVAL_MS,
  MetroEventHandler,
  DaemonServer,
  runProbeCycle,
  discoverHermesTargets,
  classifyJsThread,
  measureJsThreadLatency,
  defaultWsFactory,
  diffBundleComposition,
  proactiveBundleTip,
  writeMetroReporter,
  buildMetroReporterSource,
  hasMetroReporter,
  metroReporterPath,
  wireMetroReporter,
} from './daemon'
export type {
  MetroEvent,
  IngestResult,
  HermesTarget,
  JsThreadHealth,
  ProbeResult,
  DaemonStatus,
  BundleCompositionDelta,
  WsCtor,
  WsInstance,
  MeasureOptions,
  ProbeCycleOptions,
  StartDaemonOptions,
  DaemonStateFile,
  WireResult,
} from './daemon'

export {
  ECOSYSTEM_CATALOG,
  ECOSYSTEM_ITEMS,
  getEcosystemItem,
  listEcosystemItems,
  readEcosystemConfig,
  writeEcosystemConfig,
  enableEcosystemItem,
  disableEcosystemItem,
  exportEcosystemConfig,
} from './ecosystem'
export type { EcosystemCategory, EcosystemItem, EcosystemCatalog, ProjectFlavor, EcosystemConfig, EcosystemExport } from './ecosystem'

export { detectProjectTooling } from './adapters'
export {
  ensureCiConfigs,
  generateEasWorkflow,
  generateGithubActionsWorkflow,
  generateAzurePipeline,
  generateGitlabCi,
  generateBitbucketPipelines,
  detectCiProvider,
  detectCiProviderFromEnv,
  PROVIDER_PATHS,
} from './adapters/ciTemplates'
export type { CiTemplateOptions, GeneratedCiFile } from './adapters/ciTemplates'
export { ensureReleaseConfigs, generateEasReleaseWorkflow, generateGithubReleaseWorkflow } from './adapters/releaseTemplates'
export type { ReleaseTemplateOptions, GeneratedReleaseFile } from './adapters/releaseTemplates'
export { planRelease, renderReleasePlan, parseGitLog, detectBumpType, bumpVersion } from './sdlc/ReleasePlanner'

export {
  FEATURE_CATALOG,
  getFeatureCheck,
  listFeatureChecks,
  categorizeChecks,
  runSelfTest,
  totalsForRuns,
  ActivityTracer,
  Sandbox,
  createTracedRunner,
  LiveProgressReporter,
  renderTerminalReport,
  renderTerminalSummary,
  renderActivityLog,
  renderHtmlReport,
  renderJsonReport,
  SELF_TEST_CATEGORIES,
} from './selftest'
export type { SelfTestProgressHooks, LiveProgressReporterOptions, ModelProviderChoice } from './selftest'
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
} from './selftest'
export type { ReleasePlan, ParsedCommit, BumpType } from './sdlc/ReleasePlanner'
export { deriveFromGitHistory, parseCommitHistory, renderGitDerivation, isBreaking } from './sdlc/GitHistoryDeriver'
export type { GitDerivation, GitDerivationOptions, GitDerivationStats, DerivedCommit, DerivedAdr, DerivationCategory } from './sdlc/GitHistoryDeriver'
export { monitorRelease, analyzeCrashRate, renderMonitorReport } from './sdlc/CrashMonitor'
export type { CrashMonitorOptions, CrashSpike, MonitorResult } from './sdlc/CrashMonitor'
export {
  bucketCrashSeries,
  deriveAnomalyBaseline,
  detectCrashAnomaly,
  recordCrashBaseline,
  getLatestCrashBaseline,
  monitorReleaseAnomaly,
  renderAnomalyReport,
} from './sdlc/CrashAnomalyDetector'
export type {
  CrashRateSample,
  CrashAnomalyBaseline,
  CrashAnomalyOptions,
  CrashAnomalyResult,
  AnomalyMonitorResult,
} from './sdlc/CrashAnomalyDetector'
export { DeviceController, detectDevicePlatform } from './adapters'
export type { DeviceControllerOptions, DeviceActionResult, DevicePlatform } from './adapters'
export { MaestroFlowWriter } from './sdlc'
export type { MaestroFlowOptions } from './sdlc'

export { WorkflowEngine, getWorkflow, listWorkflows, createWorkflowState, featureDevelopmentWorkflow } from './workflows'
export { MAX_REVIEW_ATTEMPTS } from './workflows/phases/codeReviewPhase'
export { loadFailedHeals, recordFailedHeals, formatFailedHeals } from './workflows/phases/healMemory'
export type { FailedHealRecord } from './workflows/phases/healMemory'
export type { WorkflowDefinition, WorkflowContext, WorkflowState, PhaseResult, HealDecision, HealFixInfo } from './workflows'

export { createAdapters } from './adapters'
export type { AdapterRegistry, ProjectManagementAdapter, GitAdapter, TestRunnerAdapter, SimulatorAdapter, DesignAdapter } from './adapters'

export {
  SCENARIO_SPEC_VERSION,
  validateScenario,
  loadScenarios,
  defaultScenariosDir,
  AXIS_WEIGHTS,
  CORRECTNESS_WEIGHTS,
  compositeScore,
  guardrailPassRate,
  guardrailPerFile,
  deterministicGenerate,
  runScenario,
  runBenchmark,
  runBenchmarkFromDir,
  shouldRunScenario,
  benchmarkSnapshot,
  loadReferences,
  defaultReferencesDir,
  createModelGenerate,
  rubricChecks,
  runRubric,
  rubricAdherence,
  formatRubricResult,
  formatBenchmarkReport,
} from './bench'
export type {
  BenchAxes,
  BenchScenario,
  BenchScenarioExpect,
  BenchScenarioCorrectness,
  BenchGeneratedFile,
  ScenarioGuardrailFile,
  BenchAxisScores,
  BenchScenarioRun,
  BenchReferenceScore,
  BenchSuiteSummary,
  BenchSummary,
  BenchRunOptions,
  LoadScenariosResult,
  ReferenceSolution,
  LoadReferencesResult,
  ModelGenerateOptions,
  RubricCheck,
  RubricCheckResult,
  RubricFileResult,
  RubricResult,
} from './bench'

export {
  runUpgrade,
  planUpgrade,
  detectVersions,
  resolveTarget,
  analyzeUpgradeImpact,
  summarizeImpact,
  applyUpgradeCodemods,
  applyEditsToContent,
  verifyUpgrade,
  renderUpgradeReport,
  MIGRATION_CATALOG,
  RN_REACT_PAIRS,
  EXPO_SDK_RN_PAIRS,
  KNOWN_RN_MINORS,
  LATEST_KNOWN_RN,
} from './upgrade'
export type {
  UpgradeReport,
  UpgradeRunOptions,
  DetectedVersions,
  MigrationStep,
  ImpactFinding,
  CatalogEntry,
  CodemodEdit,
  VerifyResult,
  RiskLevel,
  StepKind,
} from './upgrade'

export {
  runSandboxed,
  scrubEnv,
  detectBackend,
  resetBackendCache,
  buildMacProfile,
  buildBwrapArgs,
  buildLimitWrapper,
  buildShellArgs,
  renderSandboxResult,
} from './sandbox'
export type {
  SandboxOptions,
  SandboxResult,
  IsolationLevel,
  SandboxBackend,
  ScrubEnvOptions,
  ScrubEnvResult,
} from './sandbox'

export {
  renderInSandbox,
  compileSource,
  resolveProjectBabel,
  buildHarnessScript,
  buildShimFile,
  renderRenderResult,
  stringifyRenderTree,
  RENDER_MARKER,
  SHIM_SOURCE,
} from './render'
export type {
  RenderFile,
  RenderOptions,
  RenderResult,
  RenderNode,
  ConsoleLogEntry,
  CompiledFile,
  TranspilerKind,
  RendererKind,
} from './render'

export {
  parseCpuProfile,
  analyzeCpuProfile,
  analyzeHeapSnapshot,
  analyzeHermesRuntime,
  renderPerfReport,
  recordPerfBaseline,
  getLatestPerfBaseline,
  compareToBaseline,
  renderBaselineComparison,
} from './perf'
export type {
  PerfAnalysis,
  PerfFinding,
  PerfBaselineSummary,
  PerfCompareResult,
  PerfAnalyzeOptions,
  CpuProfileStats,
  HeapStats,
  BlockingEvent,
} from './perf'

export { safe, safeAsync, bestEffort, bestEffortAsync, ok, err, toError, reportError } from './utils/safe'
export type { Result } from './utils/safe'

export * from './diagnostics'

export { readProjectIntel, buildApplicationModel, renderApplicationModel, INTEL_MAX_AGE_DEFAULT_MS } from './intel/model'
export type { ProjectIntelAccess, ApplicationModel } from './intel/model'

export { runFix, verdictOf, renderFixMarkdown, writeFixReport, fixDocsDir } from './fix'
export type { FixReport, FixFinding, FixEdit, FixOptions, FixVerdict, FixEvidence, FixVerification } from './fix'

export { MODES, MODE_IDS, MODE_PROVIDERS, MODE_DEFAULT_PROVIDER, modeOfProvider, modeAllows, isDeploymentMode, verifyMode, describeProvider } from './model/mode'
export type { DeploymentMode, ModeDefinition, ModeCheckResult } from './model/mode'

export { runScore, aggregateOverall, buildRecommendations, renderScoreMarkdown, writeScoreReport, scoreDocsDir, findingKey, priorityOf, verdictOf as scoreVerdictOf, readHistory, writeHistory, collectSourceAndTests } from './score'
export type { ScoreReport, ScoreDimension, ScoreFinding, ScoreOptions, ScorePriority, ScoreRecommendation, ScoreVerdict, ScoreHistory, ScoreHistoryEntry } from './score'

