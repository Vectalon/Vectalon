import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildExtensionCapabilityStatus, extensionManifestProjectionErrors } from './capability-projections.mjs'

const here = path.resolve(import.meta.dirname, '..')
const require = createRequire(path.join(here, 'packages/rn/package.json'))
const ts = require('typescript')
const { validateCapabilityCatalog, validateCapabilityTransition, checkCapabilityAvailability } = require('@vectalon-dev/core')
export const CATALOG = 'packages/rn/src/capabilities/catalog.json'
export const INVENTORY = 'packages/rn/src/capabilities/surfaces.json'
export const OWNERSHIP_QUALIFICATIONS = 'capabilities/ownership-qualifications.json'
// Step 5 adoption point: the last released main commit before this catalog existed.
const INITIAL_BASE = '7fa0734f7bd8648aa8be33145a958c1425fe87b1'
const read = (root, file) => readFileSync(path.join(root, file), 'utf8')
const json = (root, file) => JSON.parse(read(root, file))
export const digest = text => `sha256:${createHash('sha256').update(text).digest('hex')}`
const write = (root, file, value) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`) }
function files(root, dir) {
  if (!existsSync(path.join(root, dir))) return []
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(item => {
    if (['node_modules', 'out', '.next', 'dist'].includes(item.name)) return []
    const file = `${dir}/${item.name}`
    return item.isDirectory() ? files(root, file) : [file]
  }).sort()
}
const literal = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined
const PUBLIC_SURFACE_KINDS = new Set(['claims', 'route', 'plan-feature'])

export function explicitOwner(definitions, row) {
  const matches = []
  for (const [id, definition] of Object.entries(definitions)) {
    if (definition[row.kind]?.includes(row.name) || (row.kind === 'extension-handler' && definition.extension?.includes(row.name))) matches.push(id)
  }
  if (matches.length > 1) throw new Error(`ownership: ${row.key} has conflicting explicit owners ${matches.join(', ')}`)
  return matches[0]
}

function publicSurfaceMetadata(capability, productVersion) {
  return {
    capabilityLifecycle: capability.lifecycle,
    capabilityEvidence: capability.evidence
      .filter(evidence => evidence.status === 'passed'
        && evidence.productVersion === productVersion
        && evidence.capabilityVersion === capability.version)
      .map(evidence => evidence.reference)
      .sort(),
  }
}

/** Source declarations, including conditional tools, are counted before availability. */
export function discoverSurfaces(root) {
  const rows = []
  const add = (kind, name, source, extra = {}) => rows.push({ key: `${kind}:${name}`, kind, name, source, ...extra })
  for (const file of files(root, 'packages/rn/src/cli').filter(file => file.endsWith('.ts'))) {
    const ast = ts.createSourceFile(file, read(root, file), ts.ScriptTarget.Latest, true)
    const visit = node => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'command') {
        const declaration = literal(node.arguments[0])
        if (!declaration) throw new Error(`inventory: dynamic CLI registration in ${file} requires an explicit extractor`)
        const name = declaration.split(/\s/)[0]
        // Current registrations are flat; nested registrations retain their chain.
        let parent = node.expression.expression
        const parents = []
        while (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)) {
          if (parent.expression.name.text === 'command') parents.unshift(literal(parent.arguments[0])?.split(/\s/)[0])
          parent = parent.expression.expression
        }
        add('cli', [...parents, name].join(' '), file)
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  for (const file of files(root, 'packages/rn/src/protocol/tools').filter(file => file.endsWith('.ts'))) {
    const ast = ts.createSourceFile(file, read(root, file), ts.ScriptTarget.Latest, true)
    const visit = node => {
      if (ts.isDecorator(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'mcpTool') {
        const args = node.expression.arguments
        const name = literal(args[0])
        if (!name) throw new Error(`inventory: dynamic MCP registration in ${file}`)
        add('mcp', name, file, { requires: literal(args[3]) || null })
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  const extension = json(root, 'packages/rn/extension/package.json')
  for (const command of extension.contributes.commands) add('extension', command.command, 'packages/rn/extension/package.json')
  for (const file of files(root, 'packages/rn/extension/src').filter(file => file.endsWith('.ts'))) {
    const ast = ts.createSourceFile(file, read(root, file), ts.ScriptTarget.Latest, true)
    const visit = node => {
      if (ts.isCallExpression(node) && /(?:^|\.)register(?:Capability)?Command$/.test(node.expression.getText(ast))) {
        const name = literal(node.arguments[0])
        if (name) add('extension-handler', name, file)
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  const exportFile = (file, seen = new Set()) => {
    if (seen.has(file)) return
    seen.add(file)
    const ast = ts.createSourceFile(file, read(root, file), ts.ScriptTarget.Latest, true)
    for (const statement of ast.statements) {
      if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const element of statement.exportClause.elements) if (!element.isTypeOnly) add('api', element.name.text, file)
        } else if (statement.moduleSpecifier) {
          const target = path.posix.join(path.posix.dirname(file), literal(statement.moduleSpecifier))
          const resolved = existsSync(path.join(root, `${target}.ts`)) ? `${target}.ts` : `${target}/index.ts`
          exportFile(resolved, seen)
        }
      } else if (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) add('api', statement.name.text, file)
        if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) add('api', declaration.name.getText(ast), file)
      }
    }
  }
  exportFile('packages/rn/src/index.ts')
  for (const file of files(root, 'apps/website/app').filter(file => /\/(page|route)\.tsx?$/.test(file))) add('route', file.replace('apps/website/app', '').replace(/\/(page|route)\.tsx?$/, '') || '/', file)
  // Public prose is reviewed as documents, not inflated into a capability per string.
  const claims = ['README.md', 'packages/rn/README.md', 'LICENSE-COMMERCIAL',
    ...files(root, 'apps/website/app').filter(file => /page\.tsx$/.test(file)),
    ...files(root, 'apps/website/components').filter(file => /\.tsx$/.test(file)),
    'apps/website/lib/agents.ts']
  for (const file of claims) add('claims', file, file, { digest: digest(read(root, file)), historical: file.includes('/changelog/') })
  const manifest = json(root, 'product-manifest.json')
  for (const [name, status] of Object.entries(manifest.platforms)) add('platform', name, 'product-manifest.json', { status })
  for (const plan of manifest.plans) for (const feature of plan.features) add('plan-feature', `${plan.id}/${feature}`, 'product-manifest.json')
  for (const file of files(root, 'packages/rn/bench').filter(file => file.includes('/scenarios/') && file.endsWith('.json'))) add('benchmark', file, file, { digest: digest(read(root, file)) })
  for (const file of ['packages/rn/src/cli/commands/demo.ts', 'packages/rn/src/cli/commands/salesDemo.ts', ...files(root, 'apps/website/demo').filter(file => /(?:package\.json|README\.md)$/.test(file))]) add('demo', file, file)
  const names = new Set()
  for (const row of rows) { if (names.has(row.key)) throw new Error(`inventory: duplicate surface ${row.key}`); names.add(row.key) }
  return rows.sort((a, b) => a.key.localeCompare(b.key))
}

function fromGit(root, revision, file) {
  return JSON.parse(execFileSync('git', ['show', `${revision}:${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
}

export function validateFreeze(root, { base = 'HEAD', previous, previousSurfaces } = {}) {
  const errors = []
  const catalog = json(root, CATALOG)
  const inventory = json(root, INVENTORY)
  const actual = discoverSurfaces(root)
  const definitions = json(root, 'capabilities/definition.json')
  const ownershipQualifications = json(root, OWNERSHIP_QUALIFICATIONS)
  const declarations = new Map(catalog.capabilities.map(entry => [entry.id, entry]))
  errors.push(...validateCapabilityCatalog(catalog).errors.map(error => `qualification: ${error.path} ${error.code}`))
  const projection = inventory.map(({ capabilityId, capabilityLifecycle, capabilityEvidence, ...surface }) => surface)
  if (JSON.stringify(actual) !== JSON.stringify(projection)) errors.push('inventory: source registrations/claims differ from frozen inventory; review explicit ownership and evidence')
  for (const surface of inventory) if (!declarations.has(surface.capabilityId)) errors.push(`inventory: orphan ${surface.key}`)
  for (const surface of inventory.filter(surface => PUBLIC_SURFACE_KINDS.has(surface.kind))) {
    let expectedOwner
    try { expectedOwner = explicitOwner(definitions, surface) }
    catch (cause) { errors.push(cause.message); continue }
    if (!expectedOwner) errors.push(`ownership: ${surface.key} requires an explicit capability definition`)
    else if (surface.capabilityId !== expectedOwner) errors.push(`ownership: ${surface.key} expected ${expectedOwner}, found ${surface.capabilityId}`)
    const capability = declarations.get(surface.capabilityId)
    if (!capability) continue
    const expected = publicSurfaceMetadata(capability, catalog.productVersion)
    if (surface.capabilityLifecycle !== expected.capabilityLifecycle) errors.push(`ownership: ${surface.key} lifecycle projection differs from ${surface.capabilityId}`)
    if (JSON.stringify(surface.capabilityEvidence) !== JSON.stringify(expected.capabilityEvidence)) errors.push(`ownership: ${surface.key} evidence projection differs from ${surface.capabilityId}`)
    if (capability.implemented && expected.capabilityEvidence.length === 0) errors.push(`ownership: ${surface.key} owner ${surface.capabilityId} has no current passed evidence`)
  }
  const expectedExtensionStatus = buildExtensionCapabilityStatus(catalog, inventory)
  if (JSON.stringify(json(root, 'packages/rn/extension/src/capability-status.generated.json')) !== JSON.stringify(expectedExtensionStatus)) {
    errors.push('projection: extension capability status differs from the catalog and frozen inventory')
  }
  if (JSON.stringify(json(root, 'packages/rn/extension/out/capability-status.generated.json')) !== JSON.stringify(expectedExtensionStatus)) {
    errors.push('projection: packaged extension capability status differs from the catalog and frozen inventory')
  }
  errors.push(...extensionManifestProjectionErrors(json(root, 'packages/rn/extension/package.json'), expectedExtensionStatus))
  const forbiddenClaims = [
    /all current and future Vectalon products/i,
    /cross-project intelligence \+ cloud sync/i,
    /self-hosted deployment \(air-gapped ready\)/i,
    /SSO\s*\/\s*SAML \+ audit trails/i,
    /one license key covers every Vectalon SDK/i,
    /Revocation is instant(?! online)/i,
    /all\s+44\s+deterministic\s+agents[^.\n]*(?:work|run)[^.\n]*fully\s+offline/i,
    /44\s+deterministic\s+agents[^.\n]*all[^.\n]*offline/i,
    /44\s+deterministic\s+commands[\s\S]{0,240}run\s+offline[\s\S]{0,120}free\s+on\s+every\s+tier/i,
    /44\s+deterministic\s+agents[\s\S]{0,180}they\s+run[\s\S]{0,80}offline/i,
    /free\s+on\s+every\s+tier,\s+fully\s+offline/i,
    /deterministic\s+(?:agents?|(?:agent\s+)?commands?)[^.\n]{0,240}(?:(?:work|run)[^.\n]{0,80}fully\s+offline|need(?:s)?\s+no\s+model)/i,
  ]
  for (const surface of inventory.filter(row => row.kind === 'claims' && !row.historical)) {
    const source = read(root, surface.source)
    for (const pattern of forbiddenClaims) if (pattern.test(source)) errors.push(`public-claim: unsupported unconditional promise in ${surface.source}: ${pattern.source}`)
  }
  if (catalog.productVersion !== json(root, 'product-manifest.json').packages.reactNative.version) errors.push('qualification: stale product version')
  for (const entry of catalog.capabilities) {
    for (const reference of [...entry.tests, ...entry.docs]) if (!existsSync(path.join(root, reference))) errors.push(`evidence: missing test/doc ${reference}`)
    for (const evidence of entry.evidence) {
      if (path.isAbsolute(evidence.reference) || evidence.reference.split('/').includes('..')) { errors.push('evidence: unsafe reference'); continue }
      try {
        const contents = read(root, evidence.reference)
        if (!evidence.digest || digest(contents) !== evidence.digest) errors.push(`evidence: stale digest ${entry.id} ${evidence.reference}`)
        const record = JSON.parse(contents)
        if (record.capabilityId !== entry.id || record.kind !== evidence.kind || record.status !== evidence.status
          || record.productVersion !== evidence.productVersion || record.capabilityVersion !== evidence.capabilityVersion) errors.push(`evidence: record mismatch ${entry.id}`)
        if (!record.inputs || !Object.keys(record.inputs).length) errors.push(`evidence: missing inputs ${entry.id}`)
        // Historical evidence proves an earlier released artifact and remains
        // immutable by digest. Only current-version evidence is expected to
        // match the present working tree.
        if (record.productVersion === catalog.productVersion) {
          for (const [file, hash] of Object.entries(record.inputs || {})) if (digest(read(root, file)) !== hash) errors.push(`evidence: stale input ${entry.id} ${file}`)
        }
        if (evidence.kind !== 'implementation' && (!record.command || record.exitCode !== 0 || !record.output)) errors.push(`evidence: missing executed result ${entry.id}`)
      } catch (cause) { errors.push(`evidence: ${entry.id}: ${cause.message}`) }
    }
  }
  let prior = previous
  let priorSurfaces = previousSurfaces
  let resolvedBase = base
  try { resolvedBase = execFileSync('git', ['rev-parse', base], { cwd: root, encoding: 'utf8' }).trim() } catch { /* fromGit reports the actionable history error */ }
  let initialLineage = resolvedBase === INITIAL_BASE
  if (!initialLineage) {
    try { execFileSync('git', ['merge-base', '--is-ancestor', INITIAL_BASE, resolvedBase], { cwd: root, stdio: 'ignore' }); initialLineage = true } catch { /* unrelated history is not an adoption base */ }
  }
  if (!prior) {
    try { prior = fromGit(root, base, CATALOG); priorSurfaces = fromGit(root, base, INVENTORY) }
    catch { if (!initialLineage) errors.push(`history: catalog missing at base ${base}; cannot validate lifecycle history`) }
  }
  if (prior) {
    for (const before of prior.capabilities) {
      const after = declarations.get(before.id)
      if (!after) errors.push(`history: removed identity must remain a tombstone ${before.id}`)
      else {
        errors.push(...validateCapabilityTransition(before, after, { productVersion: catalog.productVersion }).errors.map(error => `history: ${before.id} ${error.code}`))
        if (json(root, 'product-manifest.json').product.releaseStatus !== 'available' && !before.implemented && after.implemented) errors.push(`freeze: newly implemented ${after.id}`)
        for (const evidence of before.evidence.filter(record => record.status === 'passed')) {
          if (!after.evidence.some(record => record.reference === evidence.reference && record.digest === evidence.digest)) {
            errors.push(`history: passed evidence rewritten or dropped ${after.id} ${evidence.reference}`)
          }
        }
      }
    }
    for (const after of catalog.capabilities) if (json(root, 'product-manifest.json').product.releaseStatus !== 'available' && !prior.capabilities.some(before => before.id === after.id) && after.implemented) errors.push(`freeze: newly implemented ${after.id}`)
    const oldKeys = new Set((priorSurfaces || []).map(row => row.key))
    const oldSurfacesByKey = new Map((priorSurfaces || []).map(row => [row.key, row]))
    for (const surface of inventory) {
      const before = oldSurfacesByKey.get(surface.key)
      if (!before || before.capabilityId === surface.capabilityId) continue
      const target = declarations.get(surface.capabilityId)
      const qualification = ownershipQualifications.find(record => (record.key === surface.key || record.keys?.includes(surface.key))
        && record.fromCapabilityId === before.capabilityId
        && record.toCapabilityId === surface.capabilityId
        && record.productVersion === catalog.productVersion
        && record.capabilityVersion === target?.version)
      const evidence = target?.evidence.find(record => record.reference === qualification?.evidenceReference
        && record.status === 'passed'
        && record.productVersion === catalog.productVersion
        && record.capabilityVersion === target.version)
      const plannedQualification = target?.lifecycle === 'planned' && qualification?.evidenceReference === null
      if (!qualification || (!evidence && !plannedQualification)) errors.push(`ownership: ${surface.key} changed ${before.capabilityId} -> ${surface.capabilityId} without explicit current qualification`)
    }
    for (const surface of inventory) if (!oldKeys.has(surface.key) && ['cli', 'mcp', 'extension', 'extension-handler', 'api'].includes(surface.kind)) errors.push(`freeze: new public registration ${surface.key}`)
  }
  const counts = {}
  for (const kind of new Set(inventory.map(row => row.kind))) {
    const rows = inventory.filter(row => row.kind === kind)
    counts[kind] = { declared: rows.length, enabled: rows.filter(row => !row.requires && checkCapabilityAvailability(catalog, { capabilityId: row.capabilityId, productVersion: catalog.productVersion }).available).length }
  }
  return { valid: errors.length === 0, errors, counts }
}

const invoked = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (invoked) {
  const [command = 'check', directory = here, ...args] = process.argv.slice(2)
  const root = path.resolve(directory)
  try {
    if (command === 'inventory') process.stdout.write(`${JSON.stringify(discoverSurfaces(root), null, 2)}\n`)
    else if (command === 'check') {
      const baseIndex = args.indexOf('--base')
      const result = validateFreeze(root, { base: baseIndex >= 0 ? args[baseIndex + 1] : process.env.CAPABILITY_BASE || 'HEAD' })
      if (!result.valid) { process.stderr.write(`${result.errors.join('\n')}\n`); process.exitCode = 1 }
      else process.stdout.write(`Capability freeze and evidence verified. External sub-MCP integrations are third-party, excluded.\n${JSON.stringify(result.counts, null, 2)}\n`)
    } else throw new Error(`Unknown command ${command}`)
  } catch (cause) { process.stderr.write(`${cause.message}\n`); process.exitCode = 1 }
}
