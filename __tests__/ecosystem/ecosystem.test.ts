import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  ECOSYSTEM_CATALOG,
  ECOSYSTEM_ITEMS,
  listEcosystemItems,
  getEcosystemItem,
  readEcosystemConfig,
  enableEcosystemItem,
  disableEcosystemItem,
  exportEcosystemConfig,
  recommendEcosystemSetup,
  applyEcosystemRecommendations,
} from '../../src/ecosystem'

describe('ecosystem catalog', () => {
  it('contains MCPs, skills, tools, and hooks', () => {
    const categories = new Set(ECOSYSTEM_ITEMS.map(i => i.category))
    expect(categories.has('mcp')).toBe(true)
    expect(categories.has('skill')).toBe(true)
    expect(categories.has('tool')).toBe(true)
    expect(categories.has('hook')).toBe(true)
  })

  it('includes the key React Native MCP servers found in the ecosystem research', () => {
    const mcpIds = ECOSYSTEM_ITEMS.filter(i => i.category === 'mcp').map(i => i.id)
    expect(mcpIds).toEqual(expect.arrayContaining(['metro-mcp', 'expo-mcp', 'react-native-mcp', 'react-native-guide-mcp', 'react-native-upgrader-mcp']))
  })

  it('includes RN best-practice skills and tooling', () => {
    const skills = ECOSYSTEM_ITEMS.filter(i => i.category === 'skill').map(i => i.id)
    expect(skills).toEqual(expect.arrayContaining(['expo-skills', 'callstack-agent-skills']))
    const tools = ECOSYSTEM_ITEMS.filter(i => i.category === 'tool').map(i => i.id)
    expect(tools).toEqual(expect.arrayContaining(['maestro', 'detox', 'repomix']))
  })

  it('separates expo vs rn-cli flavors', () => {
    expect(getEcosystemItem('expo-mcp')?.flavor).toBe('expo')
    expect(getEcosystemItem('react-native-upgrader-mcp')?.flavor).toBe('rn-cli')
    expect(getEcosystemItem('metro-mcp')?.flavor).toBe('both')
  })

  it('lists items filtered by category and flavor', () => {
    expect(listEcosystemItems({ category: 'mcp' })).toHaveLength(5)
    expect(listEcosystemItems({ flavor: 'expo' }).every(i => i.flavor === 'expo' || i.flavor === 'both')).toBe(true)
  })

  it('catalog has a version', () => {
    expect(ECOSYSTEM_CATALOG.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('recommends Expo-specific items for expo projects and RN-CLI items for bare projects', () => {
    const expoIds = recommendEcosystemSetup('expo').map(i => i.id)
    expect(expoIds).toEqual(expect.arrayContaining(['expo-mcp', 'expo-skills', 'expo-doctor', 'expo-router', 'expo-ui', 'eas-cli', 'metro-mcp']))
    expect(expoIds).not.toEqual(expect.arrayContaining(['react-native-upgrader-mcp', 'rn-diff-purge', 'fastlane', 'flipper']))

    const rnCliIds = recommendEcosystemSetup('rn-cli').map(i => i.id)
    expect(rnCliIds).toEqual(expect.arrayContaining(['react-native-upgrader-mcp', 'rn-diff-purge', 'expo-brownfield', 'flipper', 'fastlane', 'metro-mcp']))
    expect(rnCliIds).not.toEqual(expect.arrayContaining(['expo-mcp', 'expo-skills', 'expo-doctor', 'expo-router']))
  })
})

describe('ecosystem config', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-eco-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('starts with nothing enabled', () => {
    const config = readEcosystemConfig(dir)
    expect(config.enabled).toEqual([])
  })

  it('enables and disables items, persisting to .vectalon/ecosystem.json', () => {
    const enabled = enableEcosystemItem(dir, 'metro-mcp')
    expect(enabled.enabled).toBe(true)
    expect(existsSync(join(dir, '.vectalon', 'ecosystem.json'))).toBe(true)
    expect(readEcosystemConfig(dir).enabled).toEqual(['metro-mcp'])

    const disabled = disableEcosystemItem(dir, 'metro-mcp')
    expect(disabled.enabled).toBe(false)
    expect(readEcosystemConfig(dir).enabled).toEqual([])
  })

  it('rejects unknown item ids', () => {
    const result = enableEcosystemItem(dir, 'does-not-exist')
    expect(result.enabled).toBe(false)
  })

  it('exports enabled MCP servers, skills, tools, and hooks', () => {
    enableEcosystemItem(dir, 'metro-mcp')
    enableEcosystemItem(dir, 'expo-skills')
    enableEcosystemItem(dir, 'husky')

    const exported = exportEcosystemConfig(dir)
    expect(exported.mcpServers['metro-mcp'].command).toBe('npx')
    expect(exported.skills).toContain('expo-skills')
    expect(exported.hooks).toContain('husky')
    expect(exported.configPath).toContain('.vectalon')
  })

  it('applies flavor recommendations in a single write, preserving existing items', () => {
    enableEcosystemItem(dir, 'flashlist')

    const result = applyEcosystemRecommendations(dir, 'expo')
    expect(result.enabled).toEqual(expect.arrayContaining(['flashlist', 'expo-mcp', 'expo-skills', 'expo-doctor', 'expo-router', 'expo-ui', 'eas-cli']))
    expect(readEcosystemConfig(dir).enabled).toEqual(result.enabled)
  })
})
