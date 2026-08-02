export { Scanner, ContextEngine } from './harness'
export type { ProjectInfo, FileNode, ComponentInfo, ContextSnapshot } from './harness'

export { ModelRouter } from './model'
export type { ModelConfig, ModelRequest, ModelResponse, ModelProviderType } from './model'

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
} from './sdlc'

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

export { WorkflowEngine, getWorkflow, listWorkflows, createWorkflowState, featureDevelopmentWorkflow } from './workflows'
export { MAX_REVIEW_ATTEMPTS } from './workflows/phases/codeReviewPhase'
export { loadFailedHeals, recordFailedHeals, formatFailedHeals } from './workflows/phases/healMemory'
export type { FailedHealRecord } from './workflows/phases/healMemory'
export type { WorkflowDefinition, WorkflowContext, WorkflowState, PhaseResult, HealDecision, HealFixInfo } from './workflows'

export { createAdapters } from './adapters'
export type { AdapterRegistry, ProjectManagementAdapter, GitAdapter, TestRunnerAdapter, SimulatorAdapter, DesignAdapter } from './adapters'
