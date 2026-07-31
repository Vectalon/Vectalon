export { WorkflowEngine, WorkflowEngineOptions } from './WorkflowEngine'
export * from './WorkflowState'
export type {
  WorkflowState,
  WorkflowContext,
  WorkflowPhase,
  WorkflowDefinition,
  WorkflowRegistry,
  PhaseResult,
  WorkflowArtifact,
} from '../adapters/types'

import { featureDevelopmentWorkflow } from './definitions/featureDevelopment'
import type { WorkflowDefinition, WorkflowRegistry } from '../adapters/types'

export const WORKFLOWS: WorkflowRegistry = {
  [featureDevelopmentWorkflow.id]: featureDevelopmentWorkflow,
}

export function listWorkflows(): WorkflowDefinition[] {
  return Object.values(WORKFLOWS)
}

export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return WORKFLOWS[id]
}

export { featureDevelopmentWorkflow }
