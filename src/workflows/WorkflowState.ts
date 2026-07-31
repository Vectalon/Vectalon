import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { WorkflowState } from '../adapters/types'

export function workflowStateDir(projectRoot: string, workflowId: string): string {
  return join(projectRoot, '.vectalon', 'workflows', workflowId)
}

export function generateWorkflowId(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  const timestamp = Date.now().toString(36)
  return `${slug}-${timestamp}`
}

export function createWorkflowState(
  workflowId: string,
  prompt: string
): WorkflowState {
  return {
    id: generateWorkflowId(prompt),
    workflowId,
    prompt,
    status: 'pending',
    phases: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function saveWorkflowState(projectRoot: string, state: WorkflowState): void {
  const dir = workflowStateDir(projectRoot, state.workflowId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${state.id}.json`), JSON.stringify(state, null, 2))
}

export function loadWorkflowState(
  projectRoot: string,
  workflowId: string,
  stateId: string
): WorkflowState | null {
  const path = join(workflowStateDir(projectRoot, workflowId), `${stateId}.json`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as WorkflowState
}

export function listWorkflowStates(projectRoot: string, workflowId: string): WorkflowState[] {
  const dir = workflowStateDir(projectRoot, workflowId)
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf-8')) as WorkflowState
      } catch {
        return null
      }
    })
    .filter(Boolean) as WorkflowState[]
}
