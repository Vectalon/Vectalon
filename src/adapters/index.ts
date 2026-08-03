import type { AdapterRegistry } from './types'
import { createProjectManagementAdapter } from './projectManagement'
import { createGitAdapter } from './git'
import { createTestRunnerAdapter } from './testRunner'
import { createSimulatorAdapter } from './simulator'
import { createDesignAdapter } from './design'

export * from './types'
export { detectProjectTooling } from './simulator'

export interface CreateAdaptersOptions {
  root?: string
  dryRun?: boolean
  projectManagement?: Record<string, unknown>
  git?: Record<string, unknown>
  testRunner?: Record<string, unknown>
  simulator?: Record<string, unknown>
  design?: Record<string, unknown>
}

export function createAdapters(options: CreateAdaptersOptions = {}): AdapterRegistry {
  const root = options.root || process.cwd()
  const dryRun = options.dryRun === true

  const baseConfig = { root, dryRun }

  return {
    projectManagement: createProjectManagementAdapter(options.projectManagement || {}),
    git: createGitAdapter({ ...baseConfig, ...(options.git || {}) }),
    testRunner: createTestRunnerAdapter({ ...baseConfig, ...(options.testRunner || {}) }),
    simulator: createSimulatorAdapter({ ...baseConfig, ...(options.simulator || {}) }),
    design: createDesignAdapter(options.design || {}),
  }
}
