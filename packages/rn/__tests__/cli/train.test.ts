import { existsSync } from 'fs'
import { join } from 'path'
import { trainCommand } from '../../src/cli/commands/train'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

const SCENARIO = JSON.stringify({
  id: 'rn-01-button',
  specVersion: 1,
  suite: 'core-ui',
  title: 'Button',
  prompt: 'Create a button component with loading state',
  scaffoldable: true,
  fixtures: { 'package.json': JSON.stringify({ name: 'app', dependencies: { 'react-native': '0.76.0' } }) },
  expect: { files: ['src/Button.tsx'], behaviors: ['StyleSheet'] },
  correctness: { tests: false, typecheck: true, lint: true },
  axes: ['adherence', 'guardrails'],
})

const REFERENCE = JSON.stringify({
  id: 'rn-01-button',
  files: [{ path: 'src/Button.tsx', content: 'export const Button = () => null\n' }],
})

function benchDir(): string {
  return createTempProject({
    '.vectalon/snapshot.json': '{}',
    'bench/scenarios/rn-01-button.json': SCENARIO,
    'bench/references/rn-01-button.json': REFERENCE,
  })
}

describe('trainCommand', () => {
  let configDir: string

  beforeEach(() => {
    configDir = useTempConfig()
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(configDir)
  })

  const args = { scenarios: 'bench/scenarios', references: 'bench/references' }

  it('builds the dataset and writes JSONL under the project', async () => {
    const dir = benchDir()
    try {
      const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
      await trainCommand(dir, args)
      const written = out.mock.calls.map(c => String(c[0])).join('')
      expect(written).toContain('## 🧠 RN fine-tuning dataset')
      expect(written).toContain('Examples: **1**')
      expect(existsSync(join(dir, '.vectalon', 'training', 'rn-finetune-dataset.jsonl'))).toBe(true)
      expect(existsSync(join(dir, '.vectalon', 'training', 'manifest.json'))).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('--plan prints the LoRA training plan too', async () => {
    const dir = benchDir()
    try {
      const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
      await trainCommand(dir, { ...args, plan: true })
      const written = out.mock.calls.map(c => String(c[0])).join('')
      expect(written).toContain('## 🎓 RN fine-tuning plan')
      expect(written).toContain('vectalon bench --model local --live --install')
    } finally {
      cleanup(dir)
    }
  })

  it('--base deepseek-coder-1.3b selects the alternative base model', async () => {
    const dir = benchDir()
    try {
      const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
      await trainCommand(dir, { ...args, plan: true, base: 'deepseek-coder-1.3b' })
      const written = out.mock.calls.map(c => String(c[0])).join('')
      expect(written).toContain('DeepSeek-Coder-1.3B-Instruct')
    } finally {
      cleanup(dir)
    }
  })

  it('exits with code 1 on an unknown base model', async () => {
    const dir = benchDir()
    try {
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((() => { throw new Error('exit called') }) as unknown as (code?: string | number | null) => never)
      await expect(trainCommand(dir, { base: 'gpt-4o' })).rejects.toThrow('exit called')
      expect(exitSpy).toHaveBeenCalledWith(1)
    } finally {
      cleanup(dir)
    }
  })

  it('exits with code 1 when the project is not initialized', async () => {
    const dir = createTempProject({ 'package.json': '{}' })
    try {
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((() => { throw new Error('exit called') }) as unknown as (code?: string | number | null) => never)
      await expect(trainCommand(dir, {})).rejects.toThrow('exit called')
      expect(exitSpy).toHaveBeenCalledWith(1)
    } finally {
      cleanup(dir)
    }
  })
})
