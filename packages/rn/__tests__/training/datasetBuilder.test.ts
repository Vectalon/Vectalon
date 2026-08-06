import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { buildFineTuningDataset, writeDatasetJsonl, exampleToJsonl, renderDatasetSummary } from '../../src/training/datasetBuilder'
import { createTempProject, cleanup } from '../helpers/tmp'

const SCENARIO = (id: string) => JSON.stringify({
  id,
  specVersion: 1,
  suite: 'core-ui',
  title: 'Button',
  prompt: 'Create a button component with loading state',
  scaffoldable: true,
  fixtures: {
    'package.json': JSON.stringify({ name: 'app', dependencies: { 'react-native': '0.76.0' } }),
  },
  expect: { files: ['src/Button.tsx'], behaviors: ['StyleSheet'] },
  correctness: { tests: false, typecheck: true, lint: true },
  axes: ['adherence', 'guardrails'],
})

const REFERENCE = (id: string) => JSON.stringify({
  id,
  files: [{ path: 'src/Button.tsx', content: "import { StyleSheet, Pressable } from 'react-native'\nexport const Button = () => <Pressable style={styles.root} />\nconst styles = StyleSheet.create({ root: { padding: 8 } })\n" }],
})

function benchFixture(): string {
  return createTempProject({
    'scenarios/rn-01-button.json': SCENARIO('rn-01-button'),
    'references/rn-01-button.json': REFERENCE('rn-01-button'),
  })
}

describe('buildFineTuningDataset', () => {
  it('curates one ChatML example per scenario with a reference', () => {
    const dir = benchFixture()
    try {
      const result = buildFineTuningDataset({
        scenariosDir: join(dir, 'scenarios'),
        referencesDir: join(dir, 'references'),
      })
      expect(result.examples).toHaveLength(1)
      expect(result.skippedNoReference).toHaveLength(0)

      const ex = result.examples[0]
      expect(ex.id).toBe('rn-01-button')
      expect(ex.messages).toHaveLength(3)
      expect(ex.messages[0].role).toBe('system')
      expect(ex.messages[0].content).toContain('React Native engineer')
      expect(ex.messages[1].role).toBe('user')
      expect(ex.messages[1].content).toContain('Create a button component')
      expect(ex.messages[1].content).toContain('Project files:')
      expect(ex.messages[2].role).toBe('assistant')
      expect(ex.messages[2].content).toContain('src/Button.tsx')
      expect(ex.messages[2].content).toContain('StyleSheet.create')
      expect(ex.files).toEqual(['src/Button.tsx'])
      expect(ex.estimatedTokens).toBeGreaterThan(0)

      expect(result.stats.examples).toBe(1)
      expect(result.stats.totalFiles).toBe(1)
      expect(result.stats.totalChars).toBeGreaterThan(100)
    } finally {
      cleanup(dir)
    }
  })

  it('skips scenarios without a reference and reports problems', () => {
    const dir = createTempProject({
      'scenarios/rn-01-button.json': SCENARIO('rn-01-button'),
      'scenarios/rn-02-orphan.json': SCENARIO('rn-02-orphan'),
      'references/rn-01-button.json': REFERENCE('rn-01-button'),
      'references/bad.json': '{ not json',
    })
    try {
      const result = buildFineTuningDataset({
        scenariosDir: join(dir, 'scenarios'),
        referencesDir: join(dir, 'references'),
      })
      expect(result.examples).toHaveLength(1)
      expect(result.skippedNoReference).toEqual(['rn-02-orphan'])
      expect(result.problems.length).toBeGreaterThan(0)
      expect(result.problems.some(p => p.includes('bad.json'))).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('renders each example as a ChatML JSONL line', () => {
    const dir = benchFixture()
    try {
      const result = buildFineTuningDataset({
        scenariosDir: join(dir, 'scenarios'),
        referencesDir: join(dir, 'references'),
      })
      const line = JSON.parse(exampleToJsonl(result.examples[0]))
      expect(line.messages).toHaveLength(3)
      expect(line.messages[2].role).toBe('assistant')
    } finally {
      cleanup(dir)
    }
  })

  it('writes JSONL + manifest and reports the path', () => {
    const dir = benchFixture()
    try {
      const result = buildFineTuningDataset({
        scenariosDir: join(dir, 'scenarios'),
        referencesDir: join(dir, 'references'),
      })
      const outDir = join(dir, '.vectalon', 'training')
      const jsonlPath = writeDatasetJsonl(result.examples, result.stats, outDir)

      expect(existsSync(jsonlPath)).toBe(true)
      const lines = readFileSync(jsonlPath, 'utf-8').trim().split('\n')
      expect(lines).toHaveLength(1)

      const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8'))
      expect(manifest.format).toBe('chatml-jsonl')
      expect(manifest.stats.examples).toBe(1)

      const summary = renderDatasetSummary(result, jsonlPath)
      expect(summary).toContain('## 🧠 RN fine-tuning dataset')
      expect(summary).toContain('Examples: **1**')
    } finally {
      cleanup(dir)
    }
  })
})
