import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const here = path.resolve(import.meta.dirname, '..')
const require = createRequire(path.join(here, 'packages/rn/package.json'))
const ts = require('typescript')
const { validateCapabilityCatalog, validateCapabilityTransition, checkCapabilityAvailability } = require('@vectalon-dev/core')
export const CATALOG = 'packages/rn/src/capabilities/catalog.json'
export const INVENTORY = 'packages/rn/src/capabilities/surfaces.json'
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
  const declarations = new Map(catalog.capabilities.map(entry => [entry.id, entry]))
  errors.push(...validateCapabilityCatalog(catalog).errors.map(error => `qualification: ${error.path} ${error.code}`))
  const projection = inventory.map(({ capabilityId, ...surface }) => surface)
  if (JSON.stringify(actual) !== JSON.stringify(projection)) errors.push('inventory: source registrations/claims differ from frozen inventory; review explicit ownership and evidence')
  for (const surface of inventory) if (!declarations.has(surface.capabilityId)) errors.push(`inventory: orphan ${surface.key}`)
  const forbiddenClaims = [
    /all current and future Vectalon products/i,
    /cross-project intelligence \+ cloud sync/i,
    /self-hosted deployment \(air-gapped ready\)/i,
    /SSO\s*\/\s*SAML \+ audit trails/i,
    /one license key covers every Vectalon SDK/i,
    /Revocation is instant(?! online)/i,
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
        for (const [file, hash] of Object.entries(record.inputs || {})) if (digest(read(root, file)) !== hash) errors.push(`evidence: stale input ${entry.id} ${file}`)
        if (evidence.kind !== 'implementation' && (!record.command || record.exitCode !== 0 || !record.output)) errors.push(`evidence: missing executed result ${entry.id}`)
      } catch (cause) { errors.push(`evidence: ${entry.id}: ${cause.message}`) }
    }
  }
  let prior = previous
  let priorSurfaces = previousSurfaces
  if (!prior) {
    try { prior = fromGit(root, base, CATALOG); priorSurfaces = fromGit(root, base, INVENTORY) }
    catch { if (base !== INITIAL_BASE) errors.push(`history: catalog missing at base ${base}; cannot validate lifecycle history`) }
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
