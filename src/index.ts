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

export { PatternLearner, ProjectMemory } from './memory'
export type { Pattern, PatternStore } from './memory'

export { ArtifactStore, Traceability, RoleEngine, ARTIFACT_TYPES, ARTIFACT_ROLES, ROLE_ARTIFACT_TYPES, checksum } from './knowledge'
export type {
  Artifact,
  ArtifactVersion,
  ArtifactType,
  ArtifactSource,
  ArtifactStatus,
  ArtifactRole,
} from './knowledge'

export { getConfig, setConfig } from './config'
