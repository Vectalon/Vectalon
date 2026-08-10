import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { visibleWidth } from '../table'
import {
  listEcosystemItems,
  getEcosystemItem,
  enableEcosystemItem,
  disableEcosystemItem,
  exportEcosystemConfig,
  readEcosystemConfig,
  detectProjectFlavor,
} from '../../ecosystem'
import type { EcosystemCategory, EcosystemItem, ProjectFlavor } from '../../ecosystem'

interface EcosystemOptions {
  category?: string
  flavor?: string
  enable?: string
  disable?: string
  info?: string
  export?: boolean
  json?: boolean
}

const VALID_CATEGORIES = ['mcp', 'skill', 'tool', 'hook']
const VALID_FLAVORS = ['expo', 'rn-cli']

const CATEGORY_LABELS: Record<EcosystemCategory, string> = {
  mcp: 'MCP servers',
  skill: 'Agent skills',
  tool: 'Tools',
  hook: 'Hooks',
}
const CATEGORY_ORDER: EcosystemCategory[] = ['mcp', 'skill', 'tool', 'hook']

function flavorColor(flavor: ProjectFlavor): string {
  return flavor === 'expo' ? pc.blue(flavor) : flavor === 'rn-cli' ? pc.yellow(flavor) : pc.white(flavor)
}

/** Pad a possibly-ANSI-colored string to `width` visible columns. */
function pad(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - visibleWidth(s)))
}

export function ecosystemCommand(directory: string, options: EcosystemOptions): void {
  const root = resolve(directory || process.cwd())

  if (options.category && !VALID_CATEGORIES.includes(options.category)) {
    logger.error(`Unknown category: ${options.category}`)
    logger.info(`Valid categories: ${VALID_CATEGORIES.join(', ')}`)
    process.exit(1)
  }
  if (options.flavor && !VALID_FLAVORS.includes(options.flavor)) {
    logger.error(`Unknown flavor: ${options.flavor}`)
    logger.info(`Valid flavors: ${VALID_FLAVORS.join(', ')}`)
    process.exit(1)
  }

  if (options.enable) {
    const result = enableEcosystemItem(root, options.enable)
    if (!result.enabled) {
      logger.error(result.message)
      process.exit(1)
    }
    logger.success(result.message)
    logger.dim(`Config written to ${result.path}`)
    return
  }

  if (options.disable) {
    const result = disableEcosystemItem(root, options.disable)
    logger.success(result.message)
    logger.dim(`Config written to ${result.path}`)
    return
  }

  if (options.info) {
    renderInfo(root, options.info)
    return
  }

  if (options.export) {
    const exported = exportEcosystemConfig(root)
    if (options.json) {
      process.stdout.write(JSON.stringify(exported, null, 2) + '\n')
      return
    }
    logger.info('Enabled ecosystem items:')
    logger.dim(`  Config: ${exported.configPath}`)
    if (Object.keys(exported.mcpServers).length > 0) {
      logger.info('')
      logger.info(pc.bold('MCP servers'))
      for (const [id, server] of Object.entries(exported.mcpServers)) {
        const args = server.args?.length ? ` ${server.args.join(' ')}` : ''
        logger.info(`  ${id}: ${server.command}${args}`)
      }
      logger.dim('  → paste the mcpServers map into your agent\u2019s MCP config (Cursor/Claude Code)')
    }
    if (exported.skills.length > 0) {
      logger.info('')
      logger.info(pc.bold('Skills'))
      for (const id of exported.skills) logger.info(`  - ${id}`)
    }
    if (exported.tools.length > 0) {
      logger.info('')
      logger.info(pc.bold('Tools'))
      for (const id of exported.tools) logger.info(`  - ${id}`)
    }
    if (exported.hooks.length > 0) {
      logger.info('')
      logger.info(pc.bold('Hooks'))
      for (const id of exported.hooks) logger.info(`  - ${id}`)
    }
    if (Object.keys(exported.mcpServers).length === 0 && exported.skills.length === 0) {
      logger.warn('Nothing enabled yet. Run `vectalon ecosystem --enable <id>` first.')
    }
    return
  }

  // Default: list the catalog, grouped by category, with the project's
  // enabled items marked. IDs are never truncated — copy them straight from
  // the listing into --enable/--disable/--info.
  const items = listEcosystemItems({ category: options.category, flavor: options.flavor })
  if (items.length === 0) {
    logger.warn('No ecosystem items match that filter.')
    return
  }

  renderList(root, items)
}

function renderList(root: string, items: EcosystemItem[]): void {
  const enabled = new Set(readEcosystemConfig(root).enabled)
  const flavorLabel = detectProjectFlavor(root)

  logger.info(
    pc.bold(`vectalon ecosystem — ${items.length} item(s)`) + pc.dim(` · project flavor: ${flavorLabel}`)
  )
  logger.info('')
  logger.dim('  ✓ enabled in this project · — available to enable')
  logger.info('')

  const idWidth = Math.min(Math.max(...items.map(i => i.id.length), 10), 32)
  const nameWidth = Math.min(Math.max(...items.map(i => i.name.length), 12), 34)

  for (const category of CATEGORY_ORDER) {
    const group = items.filter(i => i.category === category)
    if (group.length === 0) continue
    logger.info(pc.bold(CATEGORY_LABELS[category]) + pc.dim(` (${group.length})`))
    for (const item of group) {
      const on = enabled.has(item.id)
      const mark = on ? pc.green('✓') : pc.dim('—')
      const id = on ? pc.green(item.id) : item.id
      logger.info(
        `  ${mark} ${pad(id, idWidth)}  ${pad(item.name, nameWidth)}  ${pad(flavorColor(item.flavor), 7)} ${pc.dim(item.install)}`
      )
    }
    logger.info('')
  }

  logger.info(pc.bold('Commands'))
  logger.info('  vectalon ecosystem --info <id>    install + capabilities for one item')
  logger.info('  vectalon ecosystem --enable <id>  enable an item (writes .vectalon/ecosystem.json)')
  logger.info('  vectalon ecosystem --disable <id> disable an item')
  logger.info('  vectalon ecosystem --export [--json]  export enabled items as an MCP config fragment')
  logger.info('  vectalon ecosystem --category mcp filter by category (mcp|skill|tool|hook)')
  logger.info('  vectalon ecosystem --flavor expo  filter by project flavor (expo|rn-cli)')
}

function renderInfo(root: string, id: string): void {
  const item = getEcosystemItem(id)
  if (!item) {
    logger.error(`Unknown ecosystem item: ${id}`)
    logger.info('Run `vectalon ecosystem` to list the catalog, or filter with --category / --flavor.')
    process.exit(1)
  }

  const enabled = readEcosystemConfig(root).enabled.includes(id)
  logger.info(pc.bold(item.id) + pc.dim(` — ${item.name}`))
  logger.info('')
  logger.info(`  ${pc.dim('Category:')} ${CATEGORY_LABELS[item.category]}  ${pc.dim('Flavor:')} ${flavorColor(item.flavor)}`)
  logger.info(
    `  ${pc.dim('Status:')} ${enabled ? pc.green('✓ enabled in this project') : pc.dim('— not enabled')}`
  )
  logger.info(`  ${pc.dim('Source:')} ${item.url}`)
  logger.info('')
  logger.info(`  ${item.description}`)
  logger.info('')
  logger.info(pc.bold('  Install'))
  logger.info(`    ${item.install}`)
  if (item.capabilities.length > 0) {
    logger.info('')
    logger.info(pc.bold('  Capabilities'))
    logger.info(`    ${item.capabilities.join(', ')}`)
  }
  logger.info('')
  logger.info(pc.dim(enabled ? '  Disable it:  vectalon ecosystem --disable <id>' : '  Enable it:   vectalon ecosystem --enable <id>'))
}
