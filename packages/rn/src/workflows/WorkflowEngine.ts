import { writePhaseDocument } from './phases/documentWriter'
import { reportError } from '../utils/safe'
import type {
  WorkflowContext,
  WorkflowDefinition,
  WorkflowPhase,
  WorkflowState,
  PhaseResult,
} from '../adapters/types'

export interface WorkflowEngineOptions {
  resume?: boolean
  fromPhase?: string
  /**
   * Total attempts per phase (first run counts as 1). Falls back to
   * `context.inputs.maxAttempts`, then 3. When exceeded, the failing phase
   * fails the run.
   */
  maxAttempts?: number
  onPhaseStart?: (phase: WorkflowPhase, attempt: number) => void
  onPhaseComplete?: (phase: WorkflowPhase, result: PhaseResult, attempt: number) => void
  /** Fired when a failed stage is about to be fixed and retried. */
  onPhaseRetry?: (phase: WorkflowPhase, fixerId: string, attempt: number, maxAttempts: number) => void
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

    const maxAttempts =
      options.maxAttempts ??
      (typeof context.inputs.maxAttempts === 'number' && context.inputs.maxAttempts > 0
        ? context.inputs.maxAttempts
        : 3)

    const startIndex = options.fromPhase
      ? definition.phases.findIndex(p => p.id === options.fromPhase)
      : 0

    for (let i = Math.max(0, startIndex); i < definition.phases.length; i++) {
      const phase = definition.phases[i]
      const existing = state.phases.find(p => p.id === phase.id)

      if (options.resume && existing && existing.status === 'completed') {
        continue
      }

      const completed = await this.runStage(phase, definition, context, options, maxAttempts)
      if (!completed) {
        state.status = 'failed'
        return state
      }
      // A self-healed stage re-ran out of order (fixer + retry appended after
      // later phases in state), so re-sort the phase list to definition order
      // — the numbered SDLC summary must read top-to-bottom correctly.
      this.reorderPhasesToDefinition(state, definition)
    }

    state.status = 'completed'
    state.updatedAt = Date.now()
    return state
  }

  /**
   * Run one stage with the self-healing loop: on failure, re-run the fixer
   * phase declared by `definition.healWith`, then retry the stage — up to
   * `maxAttempts` total attempts. Returns false when the stage exhausted its
   * attempts and failed the run.
   */
  private async runStage(
    phase: WorkflowPhase,
    definition: WorkflowDefinition,
    context: WorkflowContext,
    options: WorkflowEngineOptions,
    maxAttempts: number
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      options.onPhaseStart?.(phase, attempt)
      const result = await this.runPhase(phase, context)
      this.writePhaseDocument(context, phase, result)
      this.updatePhaseInState(context.state, result)
      context.state.updatedAt = Date.now()
      options.onPhaseComplete?.(phase, result, attempt)

      if (result.status !== 'failed') {
        return true
      }

      // A failed stage heals by re-running its fixer (e.g. implementation),
      // which regenerates with the failure context, then retrying the stage.
      const fixerId = definition.healWith?.[phase.id]
      if (!fixerId || attempt >= maxAttempts) {
        return false
      }
      const fixer = definition.phases.find(p => p.id === fixerId)
      if (!fixer) {
        return false
      }

      options.onPhaseRetry?.(phase, fixerId, attempt, maxAttempts)
      // Clear the fixer's prior output so it regenerates; the failing stage's
      // output stays in context.outputs[phase.id] so the fixer reads exactly
      // what went wrong (e.g. the verification report) as its heal context.
      delete context.outputs[fixerId]

      options.onPhaseStart?.(fixer, attempt + 1)
      const fixerResult = await this.runPhase(fixer, context)
      this.writePhaseDocument(context, fixer, fixerResult)
      this.updatePhaseInState(context.state, fixerResult)
      context.state.updatedAt = Date.now()
      options.onPhaseComplete?.(fixer, fixerResult, attempt + 1)

      // The fixer itself failing means nothing to retry against.
      if (fixerResult.status === 'failed') {
        return false
      }
    }
    return false
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
    } catch (err) {
      reportError(err, 'WorkflowEngine: writing phase document', 'warn')
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

  /** Sort the state's phase results back into the definition's phase order. */
  private reorderPhasesToDefinition(state: WorkflowState, definition: WorkflowDefinition): void {
    const indexById = new Map(definition.phases.map((p, i) => [p.id, i]))
    state.phases = [...state.phases].sort((a, b) => {
      const ai = indexById.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const bi = indexById.get(b.id) ?? Number.MAX_SAFE_INTEGER
      return ai - bi
    })
  }
}
