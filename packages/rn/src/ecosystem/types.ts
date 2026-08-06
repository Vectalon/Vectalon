/**
 * Ecosystem catalog types.
 *
 * The catalog indexes external MCP servers, agent skills, developer tools, and
 * repo hooks that make an AI agent (and this harness) competent on React Native
 * projects. Items are categorized and tagged for Expo vs bare RN-CLI projects so
 * `vectalon ecosystem` can recommend only what applies.
 */

export type EcosystemCategory = 'mcp' | 'skill' | 'tool' | 'hook'

/** Which project flavors an ecosystem item applies to. */
export type ProjectFlavor = 'expo' | 'rn-cli' | 'both'

export interface EcosystemItem {
  /** Stable id, e.g. "metro-mcp". */
  id: string
  category: EcosystemCategory
  /** Human-readable name. */
  name: string
  /** One-line description. */
  description: string
  /** Expo, bare RN-CLI, or both. */
  flavor: ProjectFlavor
  /** GitHub repo or docs URL. */
  url: string
  /** How to install/enable. */
  install: string
  /** Capabilities the item provides (for MCPs: the tool names). */
  capabilities: string[]
  /** npm package name, when applicable. */
  packageName?: string
  /** Config file or directory the item writes to, when applicable. */
  configPath?: string
  /** Whether it's enabled by default (never — always opt-in). */
  enabledByDefault?: false
}

export interface EcosystemCatalog {
  items: EcosystemItem[]
  /** Human-readable version of the catalog (bumped when entries change). */
  version: string
}
