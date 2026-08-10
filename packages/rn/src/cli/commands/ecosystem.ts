import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { renderTable } from '../table'
import { listEcosystemItems, getEcosystemItem, enableEcosystemItem, disableEcosystemItem, exportEcosystemConfig, readEcosystemConfig, detectProjectFlavor } from '../../ecosystem'

interface EcosystemOptions {
  category?: string
  flavor?: string
  enable?: string
  disable?: string
  export?: boolean
  json?: boolean
}

const VALID_CATEGORIES = ['mcp', 'skill', 'tool', 'hook']
const VALID_FLAVORS = ['expo', 'rn-cli']

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
      logger.dim('  → paste the mcpServers map into your agent\'s MCP config (Cursor/Claude Code)')
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

  // Default: list the catalog, optionally filtered, with the project's enabled
  // items marked so users can see at a glance what's on and what's not.
  const items = listEcosystemItems({ category: options.category, flavor: options.flavor })
  if (items.length === 0) {
    logger.warn('No ecosystem items match that filter.')
    return
  }

  const enabled = new Set(readEcosystemConfig(root).enabled)
  const flavorLabel = detectProjectFlavor(root)
  const rows = items.map(item => {
    const flavorColor = item.flavor === 'expo' ? pc.blue : item.flavor === 'rn-cli' ? pc.yellow : pc.white
    return [
      enabled.has(item.id) ? pc.green('✓ enabled') : pc.dim('—'),
      item.id,
      item.category,
      item.name,
      flavorColor(item.flavor),
      item.description,
    ]
  })

  logger.info(pc.bold(`Ecosystem catalog v1.0.0 — ${items.length} item(s) · project flavor: ${flavorLabel}`))
  logger.info('')
  process.stdout.write(renderTable(rows as Array<Array<string | number>>, { head: ['Enabled', 'ID', 'Category', 'Name', 'Flavor', 'Description'] }) + '\n')
  logger.info('')
  logger.info('Usage:')
  logger.info('  vectalon ecosystem --enable <id>     enable an item (writes .vectalon/ecosystem.json)')
  logger.info('  vectalon ecosystem --disable <id>    disable an item')
  logger.info('  vectalon ecosystem --export [--json] export enabled items as an MCP config fragment')
  logger.info('  vectalon ecosystem --category mcp    filter by category (mcp|skill|tool|hook)')
  logger.info('  vectalon ecosystem --flavor expo     filter by project flavor (expo|rn-cli)')

  const details = items.filter(i => i.capabilities.length > 0)
  if (details.length > 0) {
    logger.info('')
    logger.info(pc.bold('Capabilities & install:'))
    for (const item of details) {
      logger.info(`  ${pc.cyan(item.id)} — ${item.install}`)
      logger.dim(`    ${item.capabilities.slice(0, 6).join(', ')}${item.capabilities.length > 6 ? ', …' : ''}`)
    }
  }
}

/** Resolve an ecosystem item by id for use in the interactive menu. */
export function getEcosystemItemForCli(id: string) {
  return getEcosystemItem(id)
}
