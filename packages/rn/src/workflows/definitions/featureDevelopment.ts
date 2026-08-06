import type { WorkflowDefinition } from '../../adapters/types'
import { prdPhase } from '../phases/prdPhase'
import { scopePhase } from '../phases/scopePhase'
import { designPhase } from '../phases/designPhase'
import { architecturePhase } from '../phases/architecturePhase'
import { taskPhase } from '../phases/taskPhase'
import { testPhase } from '../phases/testPhase'
import { implementationPhase } from '../phases/implementationPhase'
import { codeReviewPhase } from '../phases/codeReviewPhase'
import { verificationPhase } from '../phases/verificationPhase'
import { readinessPhase } from '../phases/readinessPhase'
import { prPhase } from '../phases/prPhase'
import { documentationPhase } from '../phases/documentationPhase'
import { closePhase } from '../phases/closePhase'

export const featureDevelopmentWorkflow: WorkflowDefinition = {
  id: 'feature-development',
  name: 'Feature Development',
  description: 'End-to-end SDLC workflow: PRD, design, architecture, TDD tests, implementation, code review, verification, PR, docs, and board closure.',
  phases: [
    prdPhase,
    scopePhase,
    designPhase,
    architecturePhase,
    taskPhase,
    testPhase,
    implementationPhase,
    codeReviewPhase,
    verificationPhase,
    readinessPhase,
    prPhase,
    documentationPhase,
    closePhase,
  ],
}
