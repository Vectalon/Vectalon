import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { listEcosystemItems } from './catalog'
import type { EcosystemItem, ProjectFlavor } from './types'

export interface EcosystemConfig {
  version: string
  enabled: string[]
}

const DEFAULT_CONFIG: EcosystemConfig = { version: '1.0.0', enabled: [] }

function configPath(root: string): string {
  return join(root, '.vectalon', 'ecosystem.json')
}

/** Read the project's enabled ecosystem items (.vectalon/ecosystem.json). */
export function readEcosystemConfig(root: string): EcosystemConfig {
  try {
    if (existsSync(configPath(root))) {
      const raw = JSON.parse(readFileSync(configPath(root), 'utf-8')) as Partial<EcosystemConfig>
      return {
        version: raw.version || DEFAULT_CONFIG.version,
        enabled: Array.isArray(raw.enabled) ? raw.enabled : [],
      }
    }
  } catch {
    // Corrupt config — fall back to empty
  }
  // Fresh copies every call: never share DEFAULT_CONFIG.enabled (a later
  // applyEcosystemRecommendations would push into the same array reference,
  // leaking one project's items into the next init in the same process).
  return { version: DEFAULT_CONFIG.version, enabled: [] }
}

/** Write the enabled set back to .vectalon/ecosystem.json. */
export function writeEcosystemConfig(root: string, config: EcosystemConfig): string {
  mkdirSync(join(root, '.vectalon'), { recursive: true })
  const path = configPath(root)
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n')
  return path
}

export function enableEcosystemItem(root: string, id: string): { enabled: boolean; path: string; message: string } {
  const item = listEcosystemItems().find(i => i.id === id)
  if (!item) {
    return { enabled: false, path: configPath(root), message: `Unknown ecosystem item: ${id}. Run \`vectalon ecosystem\` to list items.` }
  }
  const config = readEcosystemConfig(root)
  if (!config.enabled.includes(id)) {
    config.enabled.push(id)
  }
  const path = writeEcosystemConfig(root, config)
  return { enabled: true, path, message: `Enabled ${id} (${item.name}). See ${item.url} for setup.` }
}

export function disableEcosystemItem(root: string, id: string): { enabled: boolean; path: string; message: string } {
  const config = readEcosystemConfig(root)
  const before = config.enabled.length
  config.enabled = config.enabled.filter(i => i !== id)
  if (config.enabled.length === before) {
    return { enabled: false, path: configPath(root), message: `${id} was not enabled.` }
  }
  const path = writeEcosystemConfig(root, config)
  return { enabled: false, path, message: `Disabled ${id}.` }
}

/**
 * Recommended ecosystem items for each project flavor. `both` is the baseline
 * every RN project benefits from; the flavor sets add the Expo- or RN-CLI-
 * specific MCPs/skills/tools on top. Used by `vectalon init` to auto-setup a
 * project, and by `vectalon ecosystem` as the default recommendation.
 */
const RECOMMENDED_IDS: Record<ProjectFlavor, string[]> = {
  both: [
    'metro-mcp',
    'react-native-mcp',
    'react-native-guide-mcp',
    'callstack-agent-skills',
    'senaiverse-rn-agents',
    'react-native-expert',
    'android-e2e-testing',
    'expo-module',
    'repomix',
    'maestro',
    'detox',
    'flashlist',
    'reactotron',
    'rn-devtools',
    'zustand',
    'mmkv',
    'secure-store',
    'reanimated',
    'gesture-handler',
    'husky',
    'lint-staged',
    'lefthook',
  ],
  expo: [
    'expo-mcp',
    'expo-skills',
    'expo-router',
    'expo-ui',
    'expo-tailwind-setup',
    'expo-data-fetching',
    'expo-dev-client',
    'expo-dom',
    'expo-upgrade',
    'expo-project-structure',
    'expo-doctor',
    'eas-cli',
  ],
  'rn-cli': [
    'react-native-upgrader-mcp',
    'rn-diff-purge',
    'expo-brownfield',
    'flipper',
    'fastlane',
  ],
}

/** The ecosystem items recommended for a project flavor (baseline + flavor set). */
export function recommendEcosystemSetup(flavor: ProjectFlavor): EcosystemItem[] {
  const ids = new Set([...RECOMMENDED_IDS.both, ...RECOMMENDED_IDS[flavor]])
  return listEcosystemItems().filter(i => ids.has(i.id))
}

/**
 * Enable every item recommended for the flavor in one write, returning the new
 * enabled list and config path. Existing enabled items are preserved.
 */
export function applyEcosystemRecommendations(root: string, flavor: ProjectFlavor): { enabled: string[]; path: string } {
  const config = readEcosystemConfig(root)
  for (const item of recommendEcosystemSetup(flavor)) {
    if (!config.enabled.includes(item.id)) config.enabled.push(item.id)
  }
  const path = writeEcosystemConfig(root, config)
  return { enabled: config.enabled, path }
}

/**
 * Match installed npm packages against the ecosystem catalog's packageName
 * fields. Items like Zustand, MMKV, Gesture Handler, Reanimated, FlashList,
 * Detox, Husky etc. are auto-detected from package.json so init can enable
 * exactly the tooling the project already uses.
 */
export function detectEcosystemItemsFromDependencies(
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>
): EcosystemItem[] {
  const installed = new Set([
    ...Object.keys(dependencies || {}),
    ...Object.keys(devDependencies || {}),
  ])
  return listEcosystemItems().filter(i => !!i.packageName && installed.has(i.packageName))
}

/** Batch-enable a list of item ids in one write, preserving existing items. */
export function enableEcosystemItems(root: string, ids: string[]): { enabled: string[]; path: string } {
  const config = readEcosystemConfig(root)
  for (const id of ids) {
    if (!config.enabled.includes(id)) config.enabled.push(id)
  }
  const path = writeEcosystemConfig(root, config)
  return { enabled: config.enabled, path }
}

export interface EcosystemExport {
  mcpServers: Record<string, { command: string; args?: string[] }>
  skills: string[]
  tools: string[]
  hooks: string[]
  configPath: string
}

/**
 * Build an MCP client config fragment for all enabled MCP items, plus the list
 * of enabled skills/tools/hooks. The mcpServers map is shaped like the JSON
 * Cursor/Claude Code expect in their MCP config files so `vectalon ecosystem
 * export` can be dropped straight into an agent's config.
 */
export function exportEcosystemConfig(root: string): EcosystemExport {
  const config = readEcosystemConfig(root)
  const items = listEcosystemItems().filter(i => config.enabled.includes(i.id))

  const mcpServers: Record<string, { command: string; args?: string[] }> = {}
  const skills: string[] = []
  const tools: string[] = []
  const hooks: string[] = []

  for (const item of items) {
    if (item.category === 'mcp') {
      const [command, ...rest] = item.install.split(' ')
      mcpServers[item.id] = rest.length > 0 ? { command, args: rest } : { command }
    } else if (item.category === 'skill') {
      skills.push(item.id)
    } else if (item.category === 'tool') {
      tools.push(item.id)
    } else {
      hooks.push(item.id)
    }
  }

  return {
    mcpServers,
    skills,
    tools,
    hooks,
    configPath: configPath(root),
  }
}
