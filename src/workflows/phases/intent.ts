export type WorkflowIntent =
  | { type: 'add-feature'; feature: string; description: string }
  | { type: 'remove-dependency'; dependency: string; description: string }
  | { type: 'refactor'; target: string; description: string }
  | { type: 'unknown'; description: string }

export function detectIntent(prompt: string): WorkflowIntent {
  const lower = prompt.toLowerCase()

  // Specific refactor patterns that should be caught before generic removal/add-feature patterns
  const unusedImportsMatch = lower.match(
    /(?:remove|clean(?:\s+up)?|delete|fix)\s+(?:all\s+)?unused\s+(?:imports|import\s+statements)/i
  )
  if (unusedImportsMatch) {
    return {
      type: 'refactor',
      target: 'remove-unused-imports',
      description: prompt,
    }
  }

  const refactorMatch = lower.match(
    /(?:refactor|rewrite|migrate|convert|modernize|restructure|optimize)\s+(?:the\s+)?(?:file\s+)?(?:component\s+)?(?:screen\s+)?(?:module\s+)?(?:unused\s+)?['"]?([a-z0-9_/.-]+)['"]?/i
  )
  if (refactorMatch) {
    return {
      type: 'refactor',
      target: refactorMatch[1],
      description: prompt,
    }
  }

  const removeMatch = lower.match(
    /(?:remove|uninstall|delete|drop|stop using|get rid of|clean up|clean)\s+(?:using\s+)?(?:the\s+)?(?:package\s+)?(?:library\s+)?(?:module\s+)?['"]?([a-z0-9_-]+)['"]?/i
  )
  if (removeMatch) {
    return {
      type: 'remove-dependency',
      dependency: normalizeDependencyName(removeMatch[1]),
      description: prompt,
    }
  }

  const addFeatureMatch = prompt.match(
    /(?:create|add|implement|build|generate)\s+(?:a\s+)?(?:new\s+)?(.+)/i
  )
  if (addFeatureMatch) {
    return {
      type: 'add-feature',
      feature: addFeatureMatch[1].trim().replace(/[.!?]$/, ''),
      description: prompt,
    }
  }

  return {
    type: 'unknown',
    description: prompt,
  }
}

function normalizeDependencyName(name: string): string {
  const knownPrefixes: Record<string, string> = {
    appcenter: 'appcenter',
    'react-native-appcenter': 'appcenter',
    appcenteranalytics: 'appcenter-analytics',
    appcentercrashes: 'appcenter-crashes',
    appcenterpush: 'appcenter-push',
  }

  const clean = name.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  return knownPrefixes[clean] || clean
}

export function intentTitle(intent: WorkflowIntent): string {
  switch (intent.type) {
    case 'add-feature':
      return `Add feature: ${intent.feature}`
    case 'remove-dependency':
      return `Remove dependency: ${intent.dependency}`
    case 'refactor':
      return `Refactor: ${intent.target}`
    case 'unknown':
      return 'Custom request'
  }
}

export function isRemoveDependency(intent: WorkflowIntent): intent is WorkflowIntent & { type: 'remove-dependency' } {
  return intent.type === 'remove-dependency'
}

export function isAddFeature(intent: WorkflowIntent): intent is WorkflowIntent & { type: 'add-feature' } {
  return intent.type === 'add-feature'
}

export function isRefactor(intent: WorkflowIntent): intent is WorkflowIntent & { type: 'refactor' } {
  return intent.type === 'refactor'
}
