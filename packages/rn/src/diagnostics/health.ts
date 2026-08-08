/**
 * Deep /health checks (P0-4)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Replaces the "GET /health exists" liveness check with structured checks:
 * model provider reachable, artifact store writable, sub-MCP clients
 * responsive, and `vectalon init` config valid. Aggregates into a
 * `healthy | degraded | critical` status + `checks[]` array that the VS Code
 * extension surfaces in the status-bar tooltip.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import pkg from '../../package.json'
import { readProjectManifest } from '../projectManifest'
import { getRemoteProviderInfo, isRemoteKeyMissing } from '../model/setup'
import { hasDownloadedModel } from '../model/local/ModelStore'
import { getDefaultPreset } from '../model/local/presets'
import { wasmCacheReady } from '../model/local/wasmPresets'
import { reportError } from '../utils/safe'
import type { ModelRouter } from '../model/ModelRouter'
import type { ArtifactStore } from '../knowledge/ArtifactStore'
import type { McpClientHandle } from '../protocol/subMcp'
import type { CheckStatus, HealthCheck, HealthReport } from './types'

export interface HealthCheckInputs {
  root: string
  version?: string
  modelRouter?: ModelRouter
  artifactStore?: ArtifactStore | null
  /** null/undefined = no sub-MCP servers configured (check omitted). */
  subMcpClients?: McpClientHandle[] | null
  /** Injectable fetch (tests). */
  fetchFn?: typeof fetch
  /** Model reachability probe timeout (default 2500ms). */
  probeTimeoutMs?: number
}

const PROBE_TIMEOUT_MS = 2500

/** Aggregate status: any fail → critical, any warn → degraded, else healthy. */
export function aggregateHealth(checks: HealthCheck[]): HealthReport['status'] {
  if (checks.some(c => c.status === 'fail')) return 'critical'
  if (checks.some(c => c.status === 'warn')) return 'degraded'
  return 'healthy'
}

/** Probe whether the configured remote model provider is reachable. */
async function probeRemoteProvider(baseUrl: string, fetchFn: typeof fetch, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetchFn(baseUrl, { signal: AbortSignal.timeout(timeoutMs) })
    // Any HTTP response (even 404/401) proves reachability; only a network
    // failure means the provider is down.
    void res
    return true
  } catch {
    return false
  }
}

/** Check the model provider: key present + (for keyless/remote) reachable. */
async function checkModelProvider(inputs: HealthCheckInputs): Promise<HealthCheck> {
  if (!inputs.modelRouter) {
    return { name: 'model-provider', status: 'warn', detail: 'no model router configured — tools will use deterministic fallbacks' }
  }
  const provider = inputs.modelRouter.getProviderId?.() || 'unknown'
  const info = getRemoteProviderInfo(provider)
  if (info) {
    if (info.apiKeyEnv && isRemoteKeyMissing(provider)) {
      return { name: 'model-provider', status: 'warn', detail: `${provider} configured but ${info.apiKeyEnv} is not set` }
    }
    const reachable = await probeRemoteProvider(info.baseUrl, inputs.fetchFn || globalThis.fetch, inputs.probeTimeoutMs ?? PROBE_TIMEOUT_MS)
    return reachable
      ? { name: 'model-provider', status: 'ok', detail: `${provider} reachable at ${info.baseUrl}` }
      : { name: 'model-provider', status: 'fail', detail: `${provider} unreachable at ${info.baseUrl}` }
  }
  // Local / WASM providers: only a downloaded model or cached WASM weights can
  // answer real inference.
  const ready = hasDownloadedModel(getDefaultPreset().id) || wasmCacheReady()
  return ready
    ? { name: 'model-provider', status: 'ok', detail: `${provider} model available` }
    : { name: 'model-provider', status: 'warn', detail: `${provider}: no model downloaded yet — run \`vectalon pull\`` }
}

/** Check the artifact store: can the knowledge base actually write? */
function checkArtifactStore(inputs: HealthCheckInputs): HealthCheck {
  if (!inputs.artifactStore) {
    return { name: 'artifact-store', status: 'warn', detail: 'no artifact store configured — knowledge tools are disabled' }
  }
  const probePath = join(inputs.root, '.vectalon', '.health-probe')
  try {
    mkdirSync(join(inputs.root, '.vectalon'), { recursive: true })
    writeFileSync(probePath, 'ok')
    rmSync(probePath, { force: true })
    return { name: 'artifact-store', status: 'ok', detail: 'knowledge base writable' }
  } catch (err) {
    reportError(err, 'health: artifact store write probe')
    return { name: 'artifact-store', status: 'fail', detail: `.vectalon/ is not writable — ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Check sub-MCP clients: every started server should have advertised tools. */
function checkSubMcp(inputs: HealthCheckInputs): HealthCheck | null {
  if (inputs.subMcpClients === undefined || inputs.subMcpClients === null) return null
  if (inputs.subMcpClients.length === 0) {
    return { name: 'sub-mcp', status: 'ok', detail: 'no sub-MCP servers configured' }
  }
  const unresponsive = inputs.subMcpClients.filter(c => c.tools.length === 0)
  return unresponsive.length === 0
    ? { name: 'sub-mcp', status: 'ok', detail: `${inputs.subMcpClients.length} sub-MCP server(s) responding` }
    : {
        name: 'sub-mcp',
        status: 'warn',
        detail: `${unresponsive.length} of ${inputs.subMcpClients.length} sub-MCP server(s) did not advertise tools`,
      }
}

/** Check the project config written by `vectalon init`. */
function checkProjectConfig(inputs: HealthCheckInputs): HealthCheck {
  if (!existsSync(join(inputs.root, '.vectalon'))) {
    return { name: 'project-config', status: 'fail', detail: 'no .vectalon/ directory — run `vectalon init` first' }
  }
  const manifest = readProjectManifest(inputs.root)
  if (!manifest) {
    return { name: 'project-config', status: 'warn', detail: '.vectalon/rn-vectalon.json missing or corrupt' }
  }
  return { name: 'project-config', status: 'ok', detail: `vectalon init valid (${manifest.version}, provider ${manifest.modelProvider || 'local'})` }
}

/**
 * Collect the full deep-health report. Deterministic where possible; the only
 * network is the optional model reachability probe.
 */
export async function collectHealthReport(inputs: HealthCheckInputs): Promise<HealthReport> {
  const checks: HealthCheck[] = [
    checkProjectConfig(inputs),
    checkArtifactStore(inputs),
    await checkModelProvider(inputs),
  ]
  const subMcp = checkSubMcp(inputs)
  if (subMcp) checks.push(subMcp)

  return {
    status: aggregateHealth(checks),
    checks,
    timestamp: Date.now(),
    version: inputs.version || pkg.version,
  }
}

export type { CheckStatus, HealthCheck, HealthReport }
