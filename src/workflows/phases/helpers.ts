import type { PhaseResult, WorkflowArtifact } from '../../adapters/types'

export function phaseResult(
  id: string,
  name: string,
  description: string,
  output: string,
  artifacts: WorkflowArtifact[] = []
): PhaseResult {
  return {
    id,
    name,
    description,
    status: 'completed',
    output,
    artifacts,
  }
}

export function failedPhase(
  id: string,
  name: string,
  description: string,
  error: string
): PhaseResult {
  return {
    id,
    name,
    description,
    status: 'failed',
    output: error,
    artifacts: [],
    error,
  }
}

export function detectConventions(snapshot: import('../../harness/types').ContextSnapshot | null): {
  hasTypeScript: boolean
  hasNavigation: boolean
  usesStyleSheet: boolean
  packageName: string
  platforms: string[]
} {
  const components = snapshot?.components || []
  const project = snapshot?.project
  return {
    hasTypeScript: !!project?.hasTypeScript,
    hasNavigation: components.some(c => c.usesNavigation),
    usesStyleSheet: components.some(c => c.usesStyleSheet),
    packageName: project?.name || 'app',
    platforms: project?.platforms || [],
  }
}

export function fileExtension(hasTypeScript: boolean): string {
  return hasTypeScript ? 'ts' : 'js'
}

export function jsxExtension(hasTypeScript: boolean): string {
  return hasTypeScript ? 'tsx' : 'jsx'
}

const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from'])

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 0 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 5)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
    .replace(/^[0-9]+/, '')
    .slice(0, 30)
}
