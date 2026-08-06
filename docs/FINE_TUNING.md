# Fine-Tuning an RN Code Model

The benchmark suite (`bench/`) is the eval harness, and `vectalon train`
curates the dataset and prints the LoRA plan. The GPU training itself runs
outside the repo — this guide walks the full chain.

## 1. Curate the dataset

```bash
npx vectalon train --plan --base qwen2.5-coder-1.5b
```

Every benchmark scenario that ships a human reference solution becomes one
ChatML conversation: the system message is an RN-expert rule set, the user turn
carries the scenario prompt **plus the fixture project context** (deps,
tsconfig, base URLs), and the assistant turn is the gold reference
implementation. The result is `.vectalon/training/rn-finetune-dataset.jsonl`
plus `manifest.json` with token stats.

Use `--scenarios`/`--references` to point at your own eval pack — teams can
curate a private dataset from their own reference solutions without touching
the shipped scenarios.

## 2. Train (LoRA, Qwen2.5-Coder-1.5B)

The dataset is ChatML JSONL, so any of the standard SFT toolchains work. With
[unsloth](https://github.com/unslothai/unsloth) (requires `trl>=0.9` for
conversation-format datasets):

```bash
pip install unsloth "xformers<0.0.28" "trl>=0.9" peft accelerate bitsandbytes
```

```python
from unsloth import FastLanguageModel
from trl import SFTTrainer
from datasets import load_dataset

model, tokenizer = FastLanguageModel.from_pretrained(
    'Qwen/Qwen2.5-Coder-1.5B-Instruct',
    max_seq_length=4096,
    load_in_4bit=True,
)
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    lora_alpha=32,
    target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
    lora_dropout=0.05,
)

dataset = load_dataset('json', data_files='.vectalon/training/rn-finetune-dataset.jsonl')

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset['train'],
    dataset_text_field='messages',
    max_seq_length=4096,
    args=TrainingArguments(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_ratio=0.03,
        learning_rate=2e-4,
        num_train_epochs=4,          # scaled to dataset size by `vectalon train --plan`
        output_dir='./output',
        logging_steps=10,
    ),
)
trainer.train()
```

For **DeepSeek-Coder-1.3B**, swap the repo id for
`deepseek-ai/deepseek-coder-1.3b-instruct` (note its license).

## 3. Convert to GGUF for local inference

```bash
llama.cpp/convert_hf_to_gguf.py ./output/model \
  --outfile rn-qwen2.5-coder-1.5b-Q4_K_M.gguf --outtype q4_k_m
```

The converted file can be loaded through the existing local model layer
(`vectalon pull` installs the stock preset; drop the fine-tuned GGUF into the
same model store to swap it in).

## 4. Evaluate against the benchmark

The eval harness is the benchmark itself — the dataset was curated from the
same scenarios:

```bash
npx vectalon bench --model local --live --install
```

Scores are reported on three axes (correctness, best-practice adherence,
guardrails) **and relative to the human reference solutions** — the exact
gold answers used in training. A fine-tuned model that memorized the eval set
will score near 100% relative-to-human; compare it against the stock Qwen
baseline to confirm the training actually moved RN-specific knowledge.

## Design notes

- **Deterministic dataset.** No model calls in curation — the prompt/context/
  reference pairing is pure transforms over the validated scenario +
  reference files, so the dataset is reproducible from the repo.
- **Eval parity.** The reference files used for scoring are the same files
  used as training targets, which makes the benchmark the honest check for
  overfitting as well as capability.
- **Scaling epochs to dataset size.** Tiny curated sets (fewer than ~5
  examples) get more passes; the shipped 11-scenario pack gets 4.
