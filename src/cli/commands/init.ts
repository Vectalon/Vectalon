import { ContextEngine } from '../../harness/ContextEngine'
import { ProjectMemory } from '../../memory/ProjectMemory'
import { PatternLearner } from '../../memory/PatternLearner'
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'

export async function initCommand(rootDir: string, _options: Record<string, unknown>): Promise<void> {
  const root = rootDir || process.cwd()

  process.stderr.write('  Scanning React Native project...\n')
  const engine = new ContextEngine(root)
  const snapshot = engine.init()

  process.stderr.write(`  Found ${snapshot.components.length} components\n`)

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

  const gitignorePath = join(root, '.gitignore')
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, 'utf-8')
    if (!gitignore.includes('.vectalon/')) {
      writeFileSync(gitignorePath, gitignore + '\n# rn-vectalon context\n.vectalon/\n')
    }
  }

  process.stderr.write('  rn-vectalon initialized.\n')
  process.stderr.write(`  Created .vectalon/ with project context and memory store\n`)
}
