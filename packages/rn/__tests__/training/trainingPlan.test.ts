import { buildTrainingPlan, renderTrainingPlan, listBaseModels } from '../../src/training/trainingPlan'
import type { DatasetStats } from '../../src/training/datasetBuilder'

const STATS: DatasetStats = { examples: 11, totalFiles: 22, totalChars: 100000, estimatedTokens: 25000 }

describe('buildTrainingPlan', () => {
  it('defaults to Qwen2.5-Coder-1.5B and scales epochs with dataset size', () => {
    const plan = buildTrainingPlan(STATS)
    expect(plan.baseModel.id).toBe('qwen2.5-coder-1.5b')
    expect(plan.baseModel.hfRepo).toBe('Qwen/Qwen2.5-Coder-1.5B-Instruct')
    expect(plan.hyperparams.epochs).toBe(4) // 5 <= examples < 15

    const small = buildTrainingPlan({ ...STATS, examples: 3 })
    expect(small.hyperparams.epochs).toBe(6)

    const large = buildTrainingPlan({ ...STATS, examples: 30 })
    expect(large.hyperparams.epochs).toBe(3)
  })

  it('supports DeepSeek-Coder-1.3B as an alternative base', () => {
    const plan = buildTrainingPlan(STATS, { baseModel: 'deepseek-coder-1.3b' })
    expect(plan.baseModel.id).toBe('deepseek-coder-1.3b')
    expect(plan.baseModel.hfRepo).toBe('deepseek-ai/deepseek-coder-1.3b-instruct')
    expect(plan.commands.train).toContain('deepseek-ai/deepseek-coder-1.3b-instruct')
  })

  it('carries the LoRA config and command chain', () => {
    const plan = buildTrainingPlan(STATS)
    expect(plan.lora.r).toBe(16)
    expect(plan.lora.alpha).toBe(32)
    expect(plan.lora.targetModules).toContain('q_proj')
    expect(plan.commands.install).toContain('unsloth')
    expect(plan.commands.convert).toContain('llama.cpp')
    expect(plan.commands.eval).toBe('vectalon bench --model local --live --install')
  })

  it('renders a markdown plan with all sections', () => {
    const plan = buildTrainingPlan(STATS)
    const report = renderTrainingPlan(plan)
    expect(report).toContain('## 🎓 RN fine-tuning plan')
    expect(report).toContain('Qwen2.5-Coder-1.5B-Instruct')
    expect(report).toContain('### LoRA config')
    expect(report).toContain('### Hyperparameters')
    expect(report).toContain('### Command chain')
    expect(report).toContain('vectalon bench --model local --live --install')
  })
})

describe('listBaseModels', () => {
  it('lists the supported base models', () => {
    expect(listBaseModels()).toEqual(['qwen2.5-coder-1.5b', 'qwen2.5-coder-3b', 'deepseek-coder-1.3b'])
  })
})
