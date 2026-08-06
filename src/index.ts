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
export { ensureCiConfigs, generateEasWorkflow, generateGithubActionsWorkflow } from './adapters/ciTemplates'
export type { CiTemplateOptions, GeneratedCiFile } from './adapters/ciTemplates'
export { ensureReleaseConfigs, generateEasReleaseWorkflow, generateGithubReleaseWorkflow } from './adapters/releaseTemplates'
export type { ReleaseTemplateOptions, GeneratedReleaseFile } from './adapters/releaseTemplates'
export { planRelease, renderReleasePlan, parseGitLog, detectBumpType, bumpVersion } from './sdlc/ReleasePlanner'
export type { ReleasePlan, ParsedCommit, BumpType } from './sdlc/ReleasePlanner'
export { monitorRelease, analyzeCrashRate, renderMonitorReport } from './sdlc/CrashMonitor'
export type { CrashMonitorOptions, CrashSpike, MonitorResult } from './sdlc/CrashMonitor'
export {
  buildFineTuningDataset,
  writeDatasetJsonl,
  renderDatasetSummary,
  exampleToJsonl,
} from './training/datasetBuilder'
export type { TrainingExample, DatasetBuildOptions, DatasetStats, DatasetBuildResult } from './training/datasetBuilder'
export { buildTrainingPlan, renderTrainingPlan, listBaseModels } from './training/trainingPlan'
export type { TrainingPlan, LoRAConfig, BaseModelId, BaseModelInfo } from './training/trainingPlan'
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

export { safe, safeAsync, bestEffort, bestEffortAsync, ok, err, toError, reportError } from './utils/safe'
export type { Result } from './utils/safe'
