import type { AdapterRegistry } from './types'
import { createProjectManagementAdapter } from './projectManagement'
import { createGitAdapter } from './git'
import { createTestRunnerAdapter } from './testRunner'
import { createSimulatorAdapter } from './simulator'
import { createDesignAdapter } from './design'

export * from './types'

export function createAdapters(config: {
  projectManagement?: Record<string, unknown>
  git?: Record<string, unknown>
  testRunner?: Record<string, unknown>
  simulator?: Record<string, unknown>
  design?: Record<string, unknown>
}): AdapterRegistry {
  return {
    projectManagement: createProjectManagementAdapter(config.projectManagement || {}),
    git: createGitAdapter(config.git || {}),
    testRunner: createTestRunnerAdapter(config.testRunner || {}),
    simulator: createSimulatorAdapter(config.simulator || {}),
    design: createDesignAdapter(config.design || {}),
  }
}
