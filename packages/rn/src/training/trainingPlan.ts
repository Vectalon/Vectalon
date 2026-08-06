import type { DatasetStats } from './datasetBuilder'

/**
 * Fine-tuned RN code model — training plan (Phase VII).
 *
 * Produces a deterministic LoRA fine-tuning plan for the curated dataset:
 * base model selection (Qwen2.5-Coder-1.5B default, DeepSeek-Coder-1.3B
 * supported), hyperparameters, and the exact train → convert → eval command
 * chain. The eval step is the benchmark suite itself — `vectalon bench
 * --model local` scores the fine-tuned model against the same scenarios the
 * dataset was curated from.
 */

export type BaseModelId = 'qwen2.5-coder-1.5b' | 'qwen2.5-coder-3b' | 'deepseek-coder-1.3b'

export interface BaseModelInfo {
  id: BaseModelId
  name: string
  /** HuggingFace repo (unsloth/transformers training target). */
  hfRepo: string
  /** GGUF URI for the local inference preset (post-conversion). */
  ggufUri: string
  license: string
}

export interface LoRAConfig {
  r: number
  alpha: number
  dropout: number
  targetModules: string[]
  /** Bias strategy for LoRA. */
  bias: 'none'
}

export interface TrainingPlan {
  baseModel: BaseModelInfo
  dataset: DatasetStats
  datasetPath: string
  lora: LoRAConfig
  hyperparams: {
    epochs: number
    learningRate: number
    perDeviceBatchSize: number
    gradientAccumulation: number
    maxSeqLength: number
    warmupRatio: number
  }
  commands: {
    install: string
    train: string
    convert: string
    eval: string
  }
}

const BASE_MODELS: Record<BaseModelId, BaseModelInfo> = {
  'qwen2.5-coder-1.5b': {
    id: 'qwen2.5-coder-1.5b',
    name: 'Qwen2.5-Coder-1.5B-Instruct',
    hfRepo: 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
    ggufUri: 'hf:Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
    license: 'Apache-2.0',
  },
  'qwen2.5-coder-3b': {
    id: 'qwen2.5-coder-3b',
    name: 'Qwen2.5-Coder-3B-Instruct',
    hfRepo: 'Qwen/Qwen2.5-Coder-3B-Instruct',
    ggufUri: 'hf:Qwen/Qwen2.5-Coder-3B-Instruct-GGUF:Q4_K_M',
    license: 'Apache-2.0',
  },
  'deepseek-coder-1.3b': {
    id: 'deepseek-coder-1.3b',
    name: 'DeepSeek-Coder-1.3B-Instruct',
    hfRepo: 'deepseek-ai/deepseek-coder-1.3b-instruct',
    ggufUri: 'hf:deepseek-ai/deepseek-coder-1.3b-instruct-GGUF:Q4_K_M',
    license: 'DeepSeek Model License',
  },
}

export const DEFAULT_BASE_MODEL: BaseModelId = 'qwen2.5-coder-1.5b'

/** Build the training plan for the curated dataset. */
export function buildTrainingPlan(stats: DatasetStats, options: { baseModel?: BaseModelId; datasetPath?: string } = {}): TrainingPlan {
  const id: BaseModelId = options.baseModel || DEFAULT_BASE_MODEL
  const baseModel = BASE_MODELS[id]
  const datasetPath = options.datasetPath || '.vectalon/training/rn-finetune-dataset.jsonl'

  // Scale epochs with dataset size: tiny curated sets need more passes.
  const epochs = stats.examples < 5 ? 6 : stats.examples < 15 ? 4 : 3

  const lora: LoRAConfig = {
    r: 16,
    alpha: 32,
    dropout: 0.05,
    targetModules: ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
    bias: 'none',
  }

  return {
    baseModel,
    dataset: stats,
    datasetPath,
    lora,
    hyperparams: {
      epochs,
      learningRate: 2e-4,
      perDeviceBatchSize: 2,
      gradientAccumulation: 4,
      maxSeqLength: 4096,
      warmupRatio: 0.03,
    },
    commands: {
      install: 'pip install unsloth "xformers<0.0.28" "trl>=0.9" peft accelerate bitsandbytes',
      // A complete, runnable LoRA fine-tuning script (ChatML JSONL dataset).
      train: [
        'python - <<\'PY\'',
        'from unsloth import FastLanguageModel',
        'from trl import SFTTrainer, TrainingArguments',
        'from datasets import load_dataset',
        '',
        `model, tokenizer = FastLanguageModel.from_pretrained(`,
        `    '${baseModel.hfRepo}',`,
        '    max_seq_length=4096,',
        '    load_in_4bit=True,',
        ')',
        `model = FastLanguageModel.get_peft_model(`,
        '    model,',
        `    r=${lora.r},`,
        `    lora_alpha=${lora.alpha},`,
        `    target_modules=${JSON.stringify(lora.targetModules)},`,
        `    lora_dropout=${lora.dropout},`,
        ')',
        '',
        `dataset = load_dataset('json', data_files='${datasetPath}')`,
        '',
        'trainer = SFTTrainer(',
        '    model=model,',
        '    tokenizer=tokenizer,',
        "    train_dataset=dataset['train'],",
        "    dataset_text_field='messages',",
        '    max_seq_length=4096,',
        '    args=TrainingArguments(',
        '        per_device_train_batch_size=2,',
        '        gradient_accumulation_steps=4,',
        '        warmup_ratio=0.03,',
        '        learning_rate=2e-4,',
        `        num_train_epochs=${epochs},`,
        "        output_dir='./output',",
        '        logging_steps=10,',
        '    ),',
        ')',
        'trainer.train()',
        'PY',
      ].join('\n'),
      convert: 'llama.cpp/convert_hf_to_gguf.py ./output/model --outfile rn-qwen2.5-coder-1.5b-Q4_K_M.gguf --outtype q4_k_m',
      eval: 'vectalon bench --model local --live --install',
    },
  }
}

/** Render the training plan as a markdown report. */
export function renderTrainingPlan(plan: TrainingPlan): string {
  const lines: string[] = []
  lines.push('## 🎓 RN fine-tuning plan')
  lines.push('')
  lines.push(`**Base model:** ${plan.baseModel.name} (${plan.baseModel.hfRepo}) — ${plan.baseModel.license}`)
  lines.push('')
  lines.push(`**Dataset:** ${plan.dataset.examples} examples · ${plan.dataset.totalFiles} files · ~${plan.dataset.estimatedTokens.toLocaleString()} tokens`)
  lines.push(`**Dataset file:** \`${plan.datasetPath}\``)
  lines.push('')
  lines.push('### LoRA config')
  lines.push('')
  lines.push(`- Rank: ${plan.lora.r} · Alpha: ${plan.lora.alpha} · Dropout: ${plan.lora.dropout}`)
  lines.push(`- Target modules: ${plan.lora.targetModules.join(', ')}`)
  lines.push('')
  lines.push('### Hyperparameters')
  lines.push('')
  lines.push(`- Epochs: ${plan.hyperparams.epochs}`)
  lines.push(`- Learning rate: ${plan.hyperparams.learningRate}`)
  lines.push(`- Batch: ${plan.hyperparams.perDeviceBatchSize} × grad-accum ${plan.hyperparams.gradientAccumulation}`)
  lines.push(`- Max sequence length: ${plan.hyperparams.maxSeqLength}`)
  lines.push('')
  lines.push('### Command chain')
  lines.push('')
  lines.push('```bash')
  lines.push(`# 1. Install the training stack`)
  lines.push(plan.commands.install)
  lines.push('')
  lines.push('# 2. Train (LoRA) — full script; see docs/FINE_TUNING.md for notes')
  lines.push(plan.commands.train)
  lines.push('')
  lines.push('# 3. Convert to GGUF for local inference')
  lines.push(plan.commands.convert)
  lines.push('')
  lines.push('# 4. Evaluate against the benchmark harness (the same scenarios the')
  lines.push('#    dataset was curated from)')
  lines.push(plan.commands.eval)
  lines.push('```')
  lines.push('')
  lines.push('---')
  lines.push('_Deterministic plan — the benchmark suite (bench/) is the eval harness._')
  return lines.join('\n')
}

/** Whether a model id is a supported base model. */
export function isSupportedBaseModel(id: string): id is BaseModelId {
  return id in BASE_MODELS
}

export function listBaseModels(): BaseModelId[] {
  return Object.keys(BASE_MODELS) as BaseModelId[]
}
