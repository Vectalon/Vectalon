import { ContextEngine } from '../../harness/ContextEngine'
import { ProjectMemory } from '../../memory/ProjectMemory'
import { PatternLearner } from '../../memory/PatternLearner'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { logger } from '../logger'
import { applyEcosystemRecommendations, recommendEcosystemSetup } from '../../ecosystem'
import pc from 'picocolors'

export async function initCommand(rootDir: string, _options: Record<string, unknown>): Promise<void> {
  const root = rootDir || process.cwd()

  logger.info('Scanning React Native project...')
  const engine = new ContextEngine(root)
  const snapshot = engine.init()

  if (!snapshot.project.reactNativeVersion) {
    logger.warn('no react-native dependency detected in package.json.')
    logger.dim('         rn-vectalon is designed for React Native projects (>= 0.72.0).')
  }

  logger.info(`Found ${snapshot.components.length} component(s)`)

  const memory = new ProjectMemory(root)
  const learner = new PatternLearner(memory)
  learner.learnFromComponents(snapshot.components)
  engine.attachPatternStore(memory)

  const vectalonDir = join(root, '.vectalon')

  writeFileSync(
    join(vectalonDir, 'rn-vectalon.json'),
    JSON.stringify({
      version: '0.1.0',
      projectName: snapshot.project.name,
      rnVersion: snapshot.project.reactNativeVersion,
      tooling: snapshot.project.tooling,
      expoSdkVersion: snapshot.project.expoSdkVersion,
      initializedAt: Date.now(),
      modelProvider: 'local',
      autoLearn: true,
    }, null, 2)
  )

  // Detect the project flavor and auto-enable the ecosystem items that apply.
  const flavor = snapshot.project.tooling
  if (flavor === 'expo') {
    logger.info(pc.cyan(`Detected Expo project${snapshot.project.expoSdkVersion ? ` (SDK ${snapshot.project.expoSdkVersion})` : ''} — setting up Expo-aware tooling...`))
  } else {
    logger.info(pc.cyan('Detected React Native CLI (bare) project — setting up RN-CLI-aware tooling...'))
  }

  const result = applyEcosystemRecommendations(root, flavor)
  const recommended = recommendEcosystemSetup(flavor)
  const byCategory = (category: string) => recommended.filter(i => i.category === category).map(i => i.id)

  const mcpIds = byCategory('mcp')
  const skillIds = byCategory('skill')
  const hookIds = byCategory('hook')
  const toolIds = byCategory('tool')

  if (mcpIds.length > 0) {
    logger.info(pc.bold(`  MCP servers enabled (${mcpIds.length}): ${mcpIds.join(', ')}`))
  }
  if (skillIds.length > 0) {
    logger.info(pc.bold(`  Skills enabled (${skillIds.length}): ${skillIds.join(', ')}`))
  }
  if (hookIds.length > 0) {
    logger.info(pc.bold(`  Hooks enabled (${hookIds.length}): ${hookIds.join(', ')}`))
  }
  if (toolIds.length > 0) {
    logger.info(pc.bold(`  Tools enabled (${toolIds.length}): ${toolIds.join(', ')}`))
  }
  logger.dim('  Model: local provider configured — run `vectalon pull` to download Qwen2.5-Coder and enable code generation.')
  logger.dim(`  Config written to ${result.path}`)
  logger.dim('  Run `vectalon ecosystem --export` to emit the enabled MCP servers as an agent config fragment.')

  logger.success('rn-vectalon initialized.')
  logger.dim(`  Created .vectalon/ with project context, memory store, and ${result.enabled.length} enabled ecosystem item(s)`)
}
