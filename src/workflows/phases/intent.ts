import type { WorkflowContext } from '../../adapters/types'
import type { ContextSnapshot } from '../../harness/types'
import type { ModelRouter } from '../../model/ModelRouter'
import { detectConventions } from './helpers'

export type WorkflowIntent =
  | { type: 'add-feature'; feature: string; description: string }
  | { type: 'remove-dependency'; dependency: string; description: string }
  | { type: 'refactor'; target: string; description: string }
  | { type: 'fix'; area: string; description: string }
  | { type: 'unknown'; description: string }

export interface IntentAlternative {
  intent: WorkflowIntent
  reasoning: string
  confidence: number
}

export interface IntentPrediction {
  /** Primary intent used for workflow routing. */
  intent: WorkflowIntent
  /** Every distinct intent the query expresses, ordered by confidence. */
  alternatives: IntentAlternative[]
  reasoning: string
  /** The intent and reasoning always come from the LLM. */
  source: 'llm'
}

export interface IntentPredictionContext {
  prompt: string
  snapshot: ContextSnapshot | null
}

function normalizeFixArea(raw: string): string {
  const area = raw.toLowerCase()
  if (area.includes('lint') || area.includes('eslint')) return 'lint'
  if (area.includes('type')) return 'types'
  if (area.includes('test')) return 'tests'
  if (area.includes('build') || area.includes('compil')) return 'build'
  return 'code'
}

const INTENT_CACHE_KEY = 'intent-prediction'

const INTENT_TYPES = new Set(['add-feature', 'remove-dependency', 'refactor', 'fix', 'unknown'])

interface RawIntentEntry {
  type?: unknown
  feature?: unknown
  dependency?: unknown
  target?: unknown
  area?: unknown
  confidence?: unknown
  reasoning?: unknown
}

function entryToIntent(entry: RawIntentEntry): WorkflowIntent | null {
  switch (entry.type) {
    case 'add-feature':
      return typeof entry.feature === 'string' && entry.feature.trim()
        ? { type: 'add-feature', feature: entry.feature.trim(), description: '' }
        : null
    case 'remove-dependency':
      return typeof entry.dependency === 'string' && entry.dependency.trim()
        ? { type: 'remove-dependency', dependency: normalizeDependencyName(entry.dependency), description: '' }
        : null
    case 'refactor':
      return typeof entry.target === 'string' && entry.target.trim()
        ? { type: 'refactor', target: entry.target.trim(), description: '' }
        : null
    case 'fix':
      return {
        type: 'fix',
        area: normalizeFixArea(typeof entry.area === 'string' ? entry.area : 'code'),
        description: '',
      }
    case 'unknown':
      return { type: 'unknown', description: '' }
    default:
      return null
  }
}

/**
 * Parse the structured-output JSON the model is asked to return for intent
 * detection. Mirrors the zod-style schema validation used in LLM intent
 * detection (see dswithmac.com/posts/intent-detection): only enum values are
 * accepted, entries failing validation are dropped, and invalid payloads
 * return null so callers return the safe 'unknown' default.
 */
export function parseIntentPrediction(content: string): IntentPrediction | null {
  const trimmed = content.trim()
  if (!trimmed) return null

  let jsonText = trimmed
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) jsonText = fence[1].trim()

  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch {
    return null
  }

  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.intents) || obj.intents.length === 0) return null

  const alternatives: IntentAlternative[] = []
  for (const item of obj.intents) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as RawIntentEntry
    if (typeof entry.type !== 'string' || !INTENT_TYPES.has(entry.type)) continue
    const intent = entryToIntent(entry)
    if (!intent) continue
    const confidence =
      typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)
        ? Math.max(0, Math.min(1, entry.confidence))
        : 0
    alternatives.push({
      intent,
      confidence,
      reasoning: typeof entry.reasoning === 'string' ? entry.reasoning : '',
    })
  }

  if (alternatives.length === 0) return null

  // Stable sort: highest confidence first; ties keep the model's order.
  alternatives.sort((a, b) => b.confidence - a.confidence)

  return {
    intent: alternatives[0].intent,
    alternatives,
    reasoning:
      typeof obj.reasoning === 'string' && obj.reasoning.trim()
        ? obj.reasoning.trim()
        : alternatives[0].reasoning,
    source: 'llm',
  }
}

/**
 * Build the intent-detection prompt. Follows the LLM intent-detection pattern:
 * a constrained schema, explicit instructions, project context for disambiguation,
 * multi-intent support, and an explicit safe default ('unknown') for uncertain
 * queries.
 */
export function buildIntentDetectionPrompt(
  prompt: string,
  snapshot: ContextSnapshot | null
): { systemPrompt: string; prompt: string } {
  const conventions = detectConventions(snapshot)
  const components = snapshot?.components?.map(c => c.name).join(', ') || 'none'

  const systemPrompt = [
    'You are an expert React Native workflow router for the Vectalon SDLC harness.',
    "Based on the provided project context and userQuery, predict the user's intent.",
    '',
    '# Instructions',
    "1. Only use the 'type' values specified in the schema: add-feature, remove-dependency, refactor, fix, unknown.",
    "2. add-feature: the user wants NEW code (screen/hook/service). Extract a short 'feature' name (e.g. \"login\").",
    "3. remove-dependency: the user wants an npm package uninstalled. Extract the real package name as 'dependency'.",
    "4. refactor: the user wants existing code restructured. Extract the target module as 'target'.",
    "5. fix: the user wants existing code repaired (lint/type/test/build/bug). Extract 'area' from: lint, types, tests, build, code.",
    '6. A query may express MULTIPLE intents — list every distinct intent, ordered by importance, each with confidence (0..1) and a one-line reasoning.',
    "7. If the userQuery is uncertain, unclear, or irrelevant, return intent type 'unknown'.",
    '8. Return ONLY valid JSON matching the schema below. No markdown, no commentary.',
    '',
    '# Schema',
    '{"intents":[{"type":"add-feature|remove-dependency|refactor|fix|unknown","feature":null,"dependency":null,"target":null,"area":null,"confidence":0.95,"reasoning":"why"}]}',
  ].join('\n')

  const userPrompt = [
    '# Project context',
    `- TypeScript: ${conventions.hasTypeScript ? 'yes' : 'no'}`,
    `- React Navigation: ${conventions.hasNavigation ? 'yes' : 'no'}`,
    `- StyleSheet usage: ${conventions.usesStyleSheet ? 'yes' : 'no'}`,
    `- Existing components: ${components}`,
    '',
    '# User Query',
    prompt,
  ].join('\n')

  return { systemPrompt, prompt: userPrompt }
}

/**
 * Detect intent with the LLM (structured output, temperature 0). The intent and
 * its reasoning ALWAYS come from the model — the deterministic rules are never
 * consulted for routing. When the model is unavailable or cannot produce a valid
 * prediction, the detection prompt's safe default ('unknown') is returned with
 * no fabricated reasoning.
 */
export async function predictIntent(
  modelRouter: ModelRouter,
  ctx: IntentPredictionContext
): Promise<IntentPrediction> {
  const unknown: IntentPrediction = {
    intent: { type: 'unknown', description: '' },
    alternatives: [],
    reasoning: '',
    source: 'llm',
  }

  if (!modelRouter || typeof modelRouter.generate !== 'function') {
    return unknown
  }

  try {
    const { systemPrompt, prompt } = buildIntentDetectionPrompt(ctx.prompt, ctx.snapshot)
    const response = await modelRouter.generate({
      systemPrompt,
      prompt,
      context: ctx.snapshot
        ? `Project: ${ctx.snapshot.project.name}, React Native ${ctx.snapshot.project.reactNativeVersion || 'unknown'}`
        : undefined,
      maxTokens: 256,
      temperature: 0,
    })
    const content = response?.content || ''
    if (content.includes('[Local model fallback') || content.includes('no downloaded model')) {
      return unknown
    }
    return parseIntentPrediction(content) ?? unknown
  } catch {
    return unknown
  }
}

/**
 * Detect intent once per workflow run and memoize the result on the shared
 * context outputs. Phases call this instead of re-detecting from the raw prompt.
 */
export async function getIntent(ctx: Pick<WorkflowContext, 'prompt' | 'snapshot' | 'modelRouter' | 'outputs'>): Promise<IntentPrediction> {
  const cached = ctx.outputs[INTENT_CACHE_KEY]
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as IntentPrediction
      if (parsed && parsed.intent && typeof parsed.intent.type === 'string' && parsed.source) {
        return parsed
      }
    } catch {
      // Stale cache — fall through and re-detect.
    }
  }

  const prediction = await predictIntent(ctx.modelRouter, { prompt: ctx.prompt, snapshot: ctx.snapshot })
  try {
    ctx.outputs[INTENT_CACHE_KEY] = JSON.stringify(prediction)
  } catch {
    // Non-fatal: caching is best-effort.
  }
  return prediction
}

function normalizeDependencyName(name: string): string {
  const knownPrefixes: Record<string, string> = {
    appcenter: 'appcenter',
    'react-native-appcenter': 'appcenter',
    appcenteranalytics: 'appcenter-analytics',
    appcentercrashes: 'appcenter-crashes',
    appcenterpush: 'appcenter-push',
  }

  const clean = name.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  return knownPrefixes[clean] || clean
}

export function intentTitle(intent: WorkflowIntent): string {
  switch (intent.type) {
    case 'add-feature':
      return `Add feature: ${intent.feature}`
    case 'remove-dependency':
      return `Remove dependency: ${intent.dependency}`
    case 'refactor':
      return `Refactor: ${intent.target}`
    case 'fix':
      return `Fix ${intent.area} issues`
    case 'unknown':
      return 'Custom request'
  }
}

export function isRemoveDependency(intent: WorkflowIntent): intent is WorkflowIntent & { type: 'remove-dependency' } {
  return intent.type === 'remove-dependency'
}

export function isAddFeature(intent: WorkflowIntent): intent is WorkflowIntent & { type: 'add-feature' } {
  return intent.type === 'add-feature'
}

export function isRefactor(intent: WorkflowIntent): intent is WorkflowIntent & { type: 'refactor' } {
  return intent.type === 'refactor'
}

export function isFix(intent: WorkflowIntent): intent is WorkflowIntent & { type: 'fix' } {
  return intent.type === 'fix'
}
