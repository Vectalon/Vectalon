import type { ModelPreset } from './presets'
import { getDownloadedModel } from './ModelStore'

export interface InferenceOptions {
  systemPrompt?: string
  prompt: string
  temperature?: number
  maxTokens?: number
}

export interface InferenceResult {
  content: string
  modelId: string
  tokensUsed?: number
}

export async function runInference(modelId: string, options: InferenceOptions): Promise<InferenceResult> {
  const model = getDownloadedModel(modelId)
  if (!model) {
    throw new Error(`Model ${modelId} is not downloaded. Run 'vectalon pull' first.`)
  }

  try {
    const nlc = await import('node-llama-cpp')
    const llama = await nlc.getLlama()
    const llamaModel = await llama.loadModel({ modelPath: model.filePath })
    const context = await llamaModel.createContext()
    const session = new nlc.LlamaChatSession({
      contextSequence: context.getSequence(),
    })

    const response = await session.prompt(options.prompt, {
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 2048,
    })

    return {
      content: response,
      modelId,
    }
  } catch (err) {
    throw new Error(`Inference failed for model ${modelId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function runInferenceWithPreset(
  preset: ModelPreset,
  options: InferenceOptions
): Promise<InferenceResult> {
  return runInference(preset.id, options)
}
