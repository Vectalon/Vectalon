/**
 * Vectalon RN — Project harness and scanning
 * Business Source License 1.1 (BSL-1.1)
 */

export { Scanner } from './Scanner'
export { ContextEngine } from './ContextEngine'
export { parseSource, analyzeSourceFile, walk } from './AstScanner'
export { buildKnowledgeGraph, extractExpoRoutes, computeReRenderImpact } from './KnowledgeGraph'
export { detectWorkspace, findWorkspaceRoot, resolveNodeModulesRoot, NO_WORKSPACE } from './workspace'
export { analyzeCrossPackageImpact, renderImpactReport, impactDocsDir, writeImpactDoc } from './impact'
export type { CrossPackageImpact, ImpactedFile, E2EFlowHit, ReRenderScreen } from './impact'
export { coverageDocsDir, coverageGapsDocPath, appendCoverageGapEntry, readCoverageGapsDoc, parseCoverageGapsDoc, summarizeCoverageGaps } from './coverageDashboard'
export type { CoverageGapEntry, ScreenCoverageSummary } from './coverageDashboard'
export type { WorkspaceInfo, WorkspaceManager } from './workspace'
export type { ProjectInfo, FileNode, ComponentInfo, ContextSnapshot } from './types'
export type { EngineeringProfile as EngineeringProfileType } from '@vectalon-dev/core'
export type {
  PlatformSuffix,
  ImportInfo,
  ExportInfo,
  HookCall,
  NavigatorInfo,
  NavigationInfo,
  ComponentDef,
  SourceAnalysis,
  StoreDef,
  StoreKind,
  StoreUsage,
  StoreConsumerHook,
} from './AstScanner'
export type {
  GraphComponent,
  GraphEdge,
  GraphHookUsage,
  GraphNavigator,
  GraphNativeModule,
  GraphStore,
  GraphExpoRoute,
  ReRenderImpact,
  RNGraph,
} from './KnowledgeGraph'
