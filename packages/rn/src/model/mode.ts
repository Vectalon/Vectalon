/**
 * Vectalon deployment modes — local/self-hosted AI as the differentiator.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Three explicit modes, mapping the ModelRouter's providers onto a privacy
 * ladder an enterprise can buy:
 *
 *   cloud      — Vectalon Cloud / hosted models (OpenAI, Anthropic, Azure,
 *                Groq): source leaves the machine to a third-party API.
 *   private    — company-controlled LLM (Ollama / vLLM on company infra):
 *                source stays inside the company network.
 *   air-gapped — the developer machine itself (local GGUF or WASM): nothing
 *                leaves the machine. Deterministic agents need no model at
 *                all, so the control-plane surface works fully air-gapped.
 *
 * Every mode is enforced, not just labeled: `modeAllowed()` refuses a
 * provider outside the mode, `verifyMode()` checks the configured provider
 * against the declared mode and reports the dataflow, and the CLI exposes
 * the whole ladder so a company that cannot install a generic AI tool can
 * point Vectalon at a company-controlled LLM — or nothing at all.
 */
import { readProjectManifest } from '../projectManifest'
import { resolveProjectModelProvider } from '../projectManifest'
import type { ModelSetupProvider } from './setup'
import { getRemoteProviderInfo } from './setup'

export type DeploymentMode = 'cloud' | 'private' | 'air-gapped'

/** Which providers each mode allows. */
export const MODE_PROVIDERS: Record<DeploymentMode, ModelSetupProvider[]> = {
  cloud: ['openai', 'anthropic', 'azure-openai', 'groq', 'local', 'wasm', 'ollama', 'vllm'],
  private: ['ollama', 'vllm', 'local', 'wasm'],
  'air-gapped': ['local', 'wasm'],
}

/** The default provider for each mode (used by `init --mode`). */
export const MODE_DEFAULT_PROVIDER: Record<DeploymentMode, ModelSetupProvider> = {
  cloud: 'openai',
  private: 'ollama',
  'air-gapped': 'local',
}

export interface ModeDefinition {
  id: DeploymentMode
  label: string
  /** The one-line value proposition. */
  tagline: string
  /** Where inference runs. */
  runsWhere: string
  /** What leaves the environment. */
  leaves: string
  /** What never leaves. */
  stays: string
  /** Providers in this mode. */
  providers: ModelSetupProvider[]
  /** The recommended provider. */
  recommended: ModelSetupProvider
}

export const MODES: Record<DeploymentMode, ModeDefinition> = {
  cloud: {
    id: 'cloud',
    label: 'Cloud',
    tagline: 'Hosted models, zero setup',
    runsWhere: 'Vectalon Cloud / hosted model APIs (OpenAI, Anthropic, Azure, Groq)',
    leaves: 'Prompts and context go to the model provider you chose',
    stays: 'Your repo, reports, and knowledge base stay on your machine',
    providers: MODE_PROVIDERS.cloud,
    recommended: 'openai',
  },
  private: {
    id: 'private',
    label: 'Private',
    tagline: 'Company-controlled LLM',
    runsWhere: 'An Ollama or vLLM server on your own infrastructure',
    leaves: 'Nothing to third parties — requests stay inside your network',
    stays: 'Everything: repo, reports, and inference all inside the company',
    providers: MODE_PROVIDERS.private,
    recommended: 'ollama',
  },
  'air-gapped': {
    id: 'air-gapped',
    label: 'Air-gapped',
    tagline: 'Local model, nothing leaves the machine',
    runsWhere: 'A local GGUF model (Qwen2.5-Coder) or WASM on the developer machine',
    leaves: 'Nothing — inference runs entirely on the machine',
    stays: 'Everything: source, reports, and inference never leave the machine',
    providers: MODE_PROVIDERS['air-gapped'],
    recommended: 'local',
  },
}

export const MODE_IDS: DeploymentMode[] = ['cloud', 'private', 'air-gapped']

/** The mode a single provider belongs to (the innermost that allows it). */
export function modeOfProvider(provider: ModelSetupProvider): DeploymentMode {
  if (MODE_PROVIDERS['air-gapped'].includes(provider)) return 'air-gapped'
  if (MODE_PROVIDERS.private.includes(provider)) return 'private'
  return 'cloud'
}

/** True when a provider is allowed in a mode (the enforcement rule). */
export function modeAllows(mode: DeploymentMode, provider: ModelSetupProvider): boolean {
  return MODE_PROVIDERS[mode].includes(provider)
}

/** True when a mode is a valid deployment-mode id. */
export function isDeploymentMode(value: string): value is DeploymentMode {
  return value === 'cloud' || value === 'private' || value === 'air-gapped'
}

/** Describe the provider's dataflow in one line (for the report). */
export function describeProvider(provider: ModelSetupProvider): string {
  if (provider === 'local') return 'local GGUF model on this machine'
  if (provider === 'wasm') return 'ONNX/WASM model on this machine'
  const info = getRemoteProviderInfo(provider)
  if (!info) return provider
  if (info.baseUrl.startsWith('http://localhost') || info.baseUrl.startsWith('http://127.0.0.1')) {
    return `company-controlled server (${info.label}, ${info.baseUrl})`
  }
  return `hosted model API (${info.label}, ${info.baseUrl})`
}

export interface ModeCheckResult {
  /** The declared mode from `.vectalon/rn-vectalon.json` (default air-gapped). */
  mode: DeploymentMode
  /** The configured provider (default local). */
  provider: ModelSetupProvider
  /** True when the provider is inside the mode's allowed set. */
  compliant: boolean
  /** Why it is not compliant, when it isn't. */
  violation?: string
  /** What leaves the environment under this config. */
  dataflow: string
}

/**
 * Verify the configured provider against the declared mode. Reads the
 * project manifest (written by `vectalon init`); defaults to air-gapped +
 * local when uninitialized — the safest reading.
 */
export function verifyMode(root: string): ModeCheckResult {
  const manifest = readProjectManifest(root)
  const provider = resolveProjectModelProvider(root) as ModelSetupProvider
  const mode: DeploymentMode = manifest?.deploymentMode && isDeploymentMode(manifest.deploymentMode)
    ? manifest.deploymentMode
    : 'air-gapped'
  const compliant = modeAllows(mode, provider)
  return {
    mode,
    provider,
    compliant,
    violation: compliant ? undefined : `${provider} is not allowed in ${mode} mode — allowed: ${MODE_PROVIDERS[mode].join(', ')}`,
    dataflow: describeProvider(provider),
  }
}
