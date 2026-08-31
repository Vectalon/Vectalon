/** Reproducible evidence capture. Implementation records are source inspections,
 * never promoted to customer/support/performance proof. Selected fixture workflows
 * earn beta only; their limitations are part of the published outcome. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { discoverSurfaces, digest, explicitOwner, CATALOG, INVENTORY } from './capability-catalog.mjs'

const root = path.resolve(import.meta.dirname, '..')
const read = file => readFileSync(path.join(root, file), 'utf8')
const write = (file, data) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), `${JSON.stringify(data, null, 2)}\n`) }
const definitions = JSON.parse(read('capabilities/definition.json'))
const productVersion = JSON.parse(read('product-manifest.json')).packages.reactNative.version
const prior = existsSync(path.join(root, CATALOG)) ? JSON.parse(read(CATALOG)) : null
function sourceClosure(seeds) {
  const seen = new Set()
  const visit = file => {
    if (seen.has(file)) return
    seen.add(file)
    const source = read(file)
    for (const match of source.matchAll(/(?:from\s+|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[2]))
      for (const candidate of [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`]) {
        if (existsSync(path.join(root, candidate))) { visit(candidate); break }
      }
    }
  }
  seeds.forEach(visit)
  return [...seen].sort()
}
const capabilities = []
for (const [id, definition] of Object.entries(definitions)) {
  const existing = prior?.capabilities.find(entry => entry.id === id)
  const entry = existing || {
    id, version: '1.0.0', lifecycle: definition.planned ? 'planned' : 'experimental', implemented: !definition.planned,
    owner: { name: 'Vectalon RN maintainers', repository: 'Vectalon/Vectalon' },
    outcome: definition.outcome,
    support: { productVersions: { min: productVersion }, plans: ['free', 'individual', 'team', 'enterprise'], platforms: [id.startsWith('sdk.') ? id.slice(4) : 'react-native'], tier: 'community-preview; no SLA' },
    dependencies: id === 'rn.feature.workflow' ? ['rn.generated-file.repair', 'rn.policy.check'] : [],
    failureModes: definition.planned ? [] : ['Missing project, provider, credentials, or native toolchain; operation may be unavailable.', 'Results require human review; fixture evidence is not a production reliability guarantee.'],
    performanceBudget: { metric: 'qualification fixture workflow timeout target (not measured SLA)', limit: 120, unit: 'seconds' },
    tests: (definition.workflows || []).map(file => `packages/rn/${file}`), docs: ['capabilities/README.md'], evidence: [],
  }
  if (!definition.planned) {
    const sourceInputs = Object.fromEntries(sourceClosure(definition.sources).map(file => [file, digest(read(file))]))
    const record = { capabilityId: id, capabilityVersion: entry.version, productVersion, kind: 'implementation', status: 'passed', recordedAt: new Date().toISOString(), inputs: sourceInputs, method: 'Inspect actual source declarations, not customer or GA qualification.' }
    const stem = `${id}.${entry.version}.${productVersion}`
    const reference = `capabilities/evidence/${stem}.implementation.json`
    const existingImplementation = existing?.evidence.find(evidence => evidence.reference === reference)
    if (existingImplementation) {
      const oldRecord = JSON.parse(read(reference))
      if (JSON.stringify(oldRecord.inputs) !== JSON.stringify(sourceInputs)) throw new Error(`${id}: implementation inputs changed; bump capability version before replacing passed evidence`)
      entry.evidence = [...existing.evidence]
    } else {
      write(reference, record)
      entry.evidence = [...(existing?.evidence || []), { kind: record.kind, status: record.status, reference, digest: digest(read(reference)), recordedAt: record.recordedAt, productVersion, capabilityVersion: entry.version }]
    }
    if (definition.workflows && process.argv.includes('--workflows')) {
      const workflowRef = `capabilities/evidence/${stem}.customer-workflow.json`
      const existingWorkflow = existing?.evidence.find(evidence => evidence.reference === workflowRef)
      if (existingWorkflow) {
        const oldRecord = JSON.parse(read(workflowRef))
        const inputs = { ...sourceInputs, ...Object.fromEntries(entry.tests.map(file => [file, digest(read(file))])) }
        if (JSON.stringify(oldRecord.inputs) !== JSON.stringify(inputs)) throw new Error(`${id}: workflow inputs changed; bump capability version before replacing passed evidence`)
        capabilities.push(entry)
        continue
      }
      const args = ['--runInBand', ...definition.workflows]
      const result = spawnSync('pnpm', ['--filter', '@vectalon-dev/rn', 'test', '--', ...args], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, VECTALON_EXPERIMENTAL: '1' } })
      const workflow = { ...record, kind: 'customer-workflow', status: result.status === 0 ? 'passed' : 'failed', command: `pnpm --filter @vectalon-dev/rn test -- ${args.join(' ')}`, exitCode: result.status, output: `${result.stdout || ''}${result.stderr || ''}`.replace(/\u001b\[[0-9;]*m/g, ''), limitations: definition.limitations, inputs: { ...sourceInputs, ...Object.fromEntries(entry.tests.map(file => [file, digest(read(file))])) } }
      write(workflowRef, workflow)
      process.stdout.write(`${id}: ${workflow.status}\n`)
      if (result.status !== 0) { process.stderr.write(workflow.output); process.exitCode = 1; continue }
      entry.evidence.push({ kind: workflow.kind, status: workflow.status, reference: workflowRef, digest: digest(read(workflowRef)), recordedAt: workflow.recordedAt, productVersion, capabilityVersion: entry.version })
      if (!existing || existing.lifecycle === 'experimental') entry.lifecycle = 'beta'
    }
    entry.evidence = [...new Map(entry.evidence.map(evidence => [evidence.reference, evidence])).values()]
  }
  capabilities.push(entry)
}
if (process.exitCode) throw new Error('Qualification failed; catalog was not updated')
write(CATALOG, { contractVersion: '1.0.0', productId: 'rn', productVersion, capabilities })
function owner(row) {
  const declared = explicitOwner(definitions, row)
  if (declared) return declared
  if (row.kind === 'platform') return row.name === 'reactNative' ? 'rn.project.inspect' : `sdk.${row.name}`
  if (['benchmark', 'demo'].includes(row.kind)) return 'rn.evaluation'
  if (row.kind === 'mcp') {
    for (const [id, definition] of Object.entries(definitions)) if (definition.sources?.includes(row.source)) return id
  }
  return 'rn.analysis'
}
const old = existsSync(path.join(root, INVENTORY)) ? JSON.parse(read(INVENTORY)) : []
const byId = new Map(capabilities.map(capability => [capability.id, capability]))
write(INVENTORY, discoverSurfaces(root).map(row => {
  const prior = old.find(surface => surface.key === row.key)
  const capabilityId = owner(row) || prior?.capabilityId
  if (!capabilityId) throw new Error(`${row.key}: no capability owner declared`)
  const surface = { ...row, capabilityId }
  if (['claims', 'route', 'plan-feature'].includes(row.kind)) {
    const capability = byId.get(capabilityId)
    if (!capability) throw new Error(`${row.key}: unknown capability owner ${capabilityId}`)
    surface.capabilityLifecycle = capability.lifecycle
    surface.capabilityEvidence = capability.evidence
      .filter(evidence => evidence.status === 'passed' && evidence.productVersion === productVersion && evidence.capabilityVersion === capability.version)
      .map(evidence => evidence.reference)
      .sort()
  }
  return surface
}))
