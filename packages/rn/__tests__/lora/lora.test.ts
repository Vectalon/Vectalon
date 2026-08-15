/**
 * vectalon lora — LoRA Training Readiness Agent (Roadmap 089) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { runLoraScan, parseLoraConfig, estimateVramGb, paramsOfModel, writeLoraReport } from '../../src/lora'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('lora: parseLoraConfig', () => {
  it('parses JSON config', () => {
    const cfg = parseLoraConfig(JSON.stringify({ dataset: 'data.jsonl', model: 'llama-3.1-8b', r: 16, alpha: 32, bits: 4, outputDir: 'out', useWandb: true }))
    expect(cfg.datasetPath).toBe('data.jsonl')
    expect(cfg.baseModel).toBe('llama-3.1-8b')
    expect(cfg.r).toBe(16)
    expect(cfg.bits).toBe(4)
    expect(cfg.useWandb).toBe(true)
  })

  it('parses YAML-subset config', () => {
    const cfg = parseLoraConfig('dataset: data.jsonl\nmodel: qwen2.5-7b\nr: 8\nload_in_4bit: true\n')
    expect(cfg.datasetPath).toBe('data.jsonl')
    expect(cfg.baseModel).toBe('qwen2.5-7b')
    expect(cfg.r).toBe(8)
    expect(cfg.bits).toBe(4)
  })

  it('returns an empty config for unreadable input', () => {
    expect(parseLoraConfig('{not json')).toEqual({})
  })
})

describe('lora: paramsOfModel + estimateVramGb', () => {
  it('extracts params from the model id', () => {
    expect(paramsOfModel('llama-3.1-8b')).toBe(8)
    expect(paramsOfModel('meta-llama/Llama-3.1-70B-Instruct')).toBe(70)
    expect(paramsOfModel('qwen2.5-7b')).toBe(7)
    expect(paramsOfModel('some-unknown-model')).toBeUndefined()
  })

  it('estimates VRAM that scales with params and bits', () => {
    const q4 = estimateVramGb(8, 4)
    const q16 = estimateVramGb(8, 16)
    expect(q16).toBeGreaterThan(q4)
    expect(q4).toBeGreaterThan(0)
  })
})

describe('lora: runLoraScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('passes when the config and dataset are ready', () => {
    dir = createTempProject({
      'package.json': '{}',
      '.vectalon/lora/config.json': JSON.stringify({ dataset: 'train.jsonl', model: 'llama-3.1-8b', r: 16, alpha: 32, bits: 4, outputDir: 'out' }),
      'train.jsonl': JSON.stringify({ instruction: 'x', output: 'y' }) + '\n',
    })
    const report = runLoraScan(dir)
    expect(report.checks.find(c => c.id === 'config')?.status).toBe('pass')
    expect(report.checks.find(c => c.id === 'dataset')?.status).toBe('pass')
    expect(report.checks.find(c => c.id === 'model')?.status).toBe('pass')
    expect(report.checks.find(c => c.id === 'vram')?.status).toBe('pass')
    expect(report.checks.find(c => c.id === 'hyperparams')?.status).toBe('pass')
    expect(report.findings.filter(f => f.severity === 'error')).toHaveLength(0)
  })

  it('errors when the config is missing', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runLoraScan(dir)
    expect(report.checks.find(c => c.id === 'config')?.status).toBe('fail')
    expect(report.verdict).toBe('changes-requested')
  })

  it('errors on a missing dataset and warns on a big model', () => {
    dir = createTempProject({
      'package.json': '{}',
      '.vectalon/lora/config.json': JSON.stringify({ dataset: 'nope.jsonl', model: 'llama-3.1-70b', r: 8, alpha: 16, bits: 4, outputDir: 'out' }),
    })
    const report = runLoraScan(dir)
    expect(report.checks.find(c => c.id === 'dataset')?.status).toBe('fail')
    expect(report.checks.find(c => c.id === 'vram')?.status).toBe('warn')
    expect(report.verdict).toBe('changes-requested')
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runLoraScan(dir)
    const { mdPath, jsonPath } = writeLoraReport(dir, report)
    expect(mdPath).toContain('lora')
    expect(jsonPath).toContain('report.json')
  })
})
