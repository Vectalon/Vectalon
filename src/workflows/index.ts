export { WorkflowEngine } from './WorkflowEngine'
export * from './WorkflowState'
export type {
  WorkflowState,
  WorkflowContext,
  WorkflowDefinition,
  PhaseResult,
  HealDecision,
  HealFixInfo,
} from '../adapters/types'

import { featureDevelopmentWorkflow } from './definitions/featureDevelopment'
import type { WorkflowDefinition } from '../adapters/types'

const WORKFLOWS: Record<string, WorkflowDefinition> = {
  [featureDevelopmentWorkflow.id]: featureDevelopmentWorkflow,
}

export function listWorkflows(): WorkflowDefinition[] {
  return Object.values(WORKFLOWS)
}

export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return WORKFLOWS[id]
}

export { featureDevelopmentWorkflow }
