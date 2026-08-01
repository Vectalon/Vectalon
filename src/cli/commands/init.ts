import { ContextEngine } from '../../harness/ContextEngine'
import { ProjectMemory } from '../../memory/ProjectMemory'
import { PatternLearner } from '../../memory/PatternLearner'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { logger } from '../logger'

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
      initializedAt: Date.now(),
      modelProvider: 'local',
      autoLearn: true,
    }, null, 2)
  )

  logger.success('rn-vectalon initialized.')
  logger.dim(`  Created .vectalon/ with project context and memory store`)
}
