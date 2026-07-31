import type { WorkflowDefinition } from '../../adapters/types'
import { prdPhase } from '../phases/prdPhase'
import { scopePhase } from '../phases/scopePhase'
import { designPhase } from '../phases/designPhase'
import { architecturePhase } from '../phases/architecturePhase'
import { taskPhase } from '../phases/taskPhase'
import { implementationPhase } from '../phases/implementationPhase'
import { verificationPhase } from '../phases/verificationPhase'
import { readinessPhase } from '../phases/readinessPhase'
import { prPhase } from '../phases/prPhase'
import { documentationPhase } from '../phases/documentationPhase'
import { closePhase } from '../phases/closePhase'

export const featureDevelopmentWorkflow: WorkflowDefinition = {
  id: 'feature-development',
  name: 'Feature Development',
  description: 'End-to-end SDLC workflow: PRD, design, architecture, implementation, verification, PR, docs, and board closure.',
  phases: [
    prdPhase,
    scopePhase,
    designPhase,
    architecturePhase,
    taskPhase,
    implementationPhase,
    verificationPhase,
    readinessPhase,
    prPhase,
    documentationPhase,
    closePhase,
  ],
}
