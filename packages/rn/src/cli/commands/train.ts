import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { logger } from '../logger'
import { buildFineTuningDataset, writeDatasetJsonl, renderDatasetSummary } from '../../training/datasetBuilder'
import { buildTrainingPlan, renderTrainingPlan, listBaseModels } from '../../training/trainingPlan'

interface TrainOptions {
  build?: boolean
  plan?: boolean
  out?: string
  base?: string
  scenarios?: string
  references?: string
  json?: boolean
}

/**
 * `vectalon train [directory]` — curate the RN fine-tuning dataset from the
 * benchmark's reference solutions and produce the LoRA training plan.
 *
 * The GPU training itself runs outside the repo (see the plan's command
 * chain); this command produces the dataset + the deterministic plan, and the
 * benchmark suite is the eval harness.
 */
export async function trainCommand(directory: string, options: TrainOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  if (!existsSync(join(root, '.vectalon'))) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  const outDir = options.out ? resolve(root, options.out) : join(root, '.vectalon', 'training')
  const base = (options.base as string) || undefined
  if (base && !listBaseModels().includes(base as never)) {
    logger.error(`Unknown base model: ${base}. Supported: ${listBaseModels().join(', ')}`)
    process.exit(1)
  }

  const dataset = buildFineTuningDataset({
    scenariosDir: options.scenarios ? resolve(root, options.scenarios) : undefined,
    referencesDir: options.references ? resolve(root, options.references) : undefined,
  })
  const jsonlPath = writeDatasetJsonl(dataset.examples, dataset.stats, outDir)

  if (options.plan) {
    const plan = buildTrainingPlan(dataset.stats, { baseModel: (base as never) || undefined, datasetPath: jsonlPath })
    if (options.json) {
      logger.out(JSON.stringify({ dataset: dataset.stats, plan }, null, 2) + '\n')
      return
    }
    logger.out(renderDatasetSummary(dataset, jsonlPath) + '\n\n')
    logger.out(renderTrainingPlan(plan) + '\n')
    return
  }

  if (options.json) {
    logger.out(JSON.stringify({ stats: dataset.stats, jsonlPath, problems: dataset.problems, skipped: dataset.skippedNoReference }, null, 2) + '\n')
    return
  }

  logger.out(renderDatasetSummary(dataset, jsonlPath) + '\n')
  if (dataset.examples.length === 0) {
    logger.warn('No examples — ensure bench/scenarios + bench/references exist and are valid.')
    return
  }
  logger.info('Run `vectalon train --plan` for the LoRA fine-tuning plan (train → convert → eval).')
}
