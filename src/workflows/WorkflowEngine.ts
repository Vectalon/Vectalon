import { writePhaseDocument } from './phases/documentWriter'
import type {
  WorkflowContext,
  WorkflowDefinition,
  WorkflowPhase,
  WorkflowState,
  PhaseResult,
} from '../adapters/types'

interface WorkflowEngineOptions {
  resume?: boolean
  fromPhase?: string
}

export class WorkflowEngine {
  async run(
    definition: WorkflowDefinition,
    context: WorkflowContext,
    options: WorkflowEngineOptions = {}
  ): Promise<WorkflowState> {
    const { state } = context
    state.status = 'running'
    state.updatedAt = Date.now()

    const startIndex = options.fromPhase
      ? definition.phases.findIndex(p => p.id === options.fromPhase)
      : 0

    for (let i = Math.max(0, startIndex); i < definition.phases.length; i++) {
      const phase = definition.phases[i]
      const existing = state.phases.find(p => p.id === phase.id)

      if (options.resume && existing && existing.status === 'completed') {
        continue
      }

      const result = await this.runPhase(phase, context)
      this.writePhaseDocument(context, phase, result)
      this.updatePhaseInState(state, result)
      state.updatedAt = Date.now()

      if (result.status === 'failed') {
        state.status = 'failed'
        return state
      }
    }

    state.status = 'completed'
    state.updatedAt = Date.now()
    return state
  }

  private async runPhase(phase: WorkflowPhase, context: WorkflowContext): Promise<PhaseResult> {
    const running: PhaseResult = {
      id: phase.id,
      name: phase.name,
      description: phase.description,
      status: 'running',
      output: '',
      artifacts: [],
      startedAt: Date.now(),
    }

    try {
      const result = await phase.run({ ...context, state: this.updateRunningPhase(context.state, running) })
      context.outputs[phase.id] = result.output
      return {
        ...result,
        status: result.status === 'failed' ? 'failed' : 'completed',
        completedAt: Date.now(),
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        ...running,
        status: 'failed',
        output: `Phase failed: ${message}`,
        completedAt: Date.now(),
        error: message,
      }
    }
  }

  private writePhaseDocument(context: WorkflowContext, phase: WorkflowPhase, result: PhaseResult): void {
    if (!context.projectRoot) {
      return
    }
    if (typeof result.output !== 'string' || result.output.trim().length === 0) {
      return
    }
    const runId = context.state.id || 'unknown'
    const workflowId = context.state.workflowId || 'workflow'
    try {
      const path = writePhaseDocument(context.projectRoot, workflowId, runId, phase.id, phase.name, result.output)
      result.artifacts.push({
        type: 'document',
        title: phase.name,
        content: result.output,
        path,
      })
    } catch {
      // Non-fatal: document writing failure should not fail the phase
    }
  }

  private updateRunningPhase(state: WorkflowState, running: PhaseResult): WorkflowState {
    const phases = state.phases.filter(p => p.id !== running.id)
    phases.push(running)
    return { ...state, phases }
  }

  private updatePhaseInState(state: WorkflowState, result: PhaseResult): void {
    const phases = state.phases.filter(p => p.id !== result.id)
    phases.push(result)
    state.phases = phases
  }
}
