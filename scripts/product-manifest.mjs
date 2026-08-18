import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const error = (code, file, message) => ({ code, file, message })

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

function required(value, field, errors, file) {
  if (value === undefined || value === null || value === '') {
    errors.push(error('schema', file, `missing required field: ${field}`))
  }
}

function validateSchema(manifest, file) {
  const errors = []
  if (manifest.schemaVersion !== 1) {
    errors.push(error('schema-version', file, `expected schemaVersion 1, found ${String(manifest.schemaVersion)}`))
  }
  required(manifest.product?.name, 'product.name', errors, file)
  required(manifest.packages?.reactNative?.version, 'packages.reactNative.version', errors, file)
  required(manifest.packages?.core?.version, 'packages.core.version', errors, file)
  required(manifest.capabilities?.benchmarkScenarios, 'capabilities.benchmarkScenarios', errors, file)
  if (!Array.isArray(manifest.plans) || manifest.plans.length === 0) {
    errors.push(error('schema', file, 'plans must contain at least one plan'))
  } else {
    manifest.plans.forEach((plan, index) => {
      const prefix = `plans[${index}]`
      for (const field of ['id', 'name', 'engineTier', 'price', 'cadence', 'checkout']) {
        required(plan?.[field], `${prefix}.${field}`, errors, file)
      }
      if (typeof plan?.trialEligible !== 'boolean') {
        errors.push(error('schema', file, `${prefix}.trialEligible must be a boolean`))
      }
      if (!Array.isArray(plan?.features) || plan.features.length === 0) {
        errors.push(error('schema', file, `${prefix}.features must be a non-empty array`))
      }
    })
  }
  required(manifest.license?.id, 'license.id', errors, file)
  required(manifest.license?.freeCommercialDevelopers, 'license.freeCommercialDevelopers', errors, file)
  required(manifest.license?.changeDate, 'license.changeDate', errors, file)
  required(manifest.license?.changeLicense, 'license.changeLicense', errors, file)
  required(manifest.license?.vscodeExtension, 'license.vscodeExtension', errors, file)
  if (!Array.isArray(manifest.validation?.documents)) {
    errors.push(error('schema', file, 'validation.documents must be an array'))
  }
  return errors
}

export function renderRnPlanProjection(manifest) {
  return `${JSON.stringify(manifest.plans, null, 2)}\n`
}

function factValue(manifest, name) {
  if (name === 'rn-version') return manifest.packages.reactNative.version
  if (name === 'core-version') return manifest.packages.core.version
  if (name === 'benchmark-scenarios') return String(manifest.capabilities.benchmarkScenarios)
  if (name === 'deterministic-commands') return String(manifest.capabilities.deterministicCommands)
  if (name === 'mcp-tools') return String(manifest.capabilities.mcpTools)
  if (name === 'license-id') return manifest.license.id
  if (name === 'license-change-date') return manifest.license.changeDate
  if (name.endsWith('-price')) {
    return manifest.plans.find(plan => plan.id === name.slice(0, -'-price'.length))?.price
  }
  return undefined
}

function validateMarkedFacts(manifest, relativeFile, source) {
  const errors = []
  const document = manifest.validation.documents.find(entry => entry.path === relativeFile)
  if (!document) return errors

  for (const name of document.facts) {
    const expected = factValue(manifest, name)
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matches = [...source.matchAll(new RegExp(`<!--\\s*product-fact:${escaped}\\s*-->([\\s\\S]*?)<!--\\s*\\/product-fact\\s*-->`, 'g'))]
    if (matches.length === 0) {
      errors.push(error('fact-missing', relativeFile, `missing product fact marker: ${name}`))
      continue
    }
    if (matches.length > 1) {
      errors.push(error('fact-duplicate', relativeFile, `duplicate product fact marker: ${name}`))
    }
    const stale = matches.find(match => match[1].trim() !== String(expected))
    if (stale) {
      errors.push(error('fact-stale', relativeFile, `product fact ${name}: expected ${String(expected)}, found ${stale[1].trim()}`))
    }
  }

  const starts = [...source.matchAll(/<!--\s*product-fact:([^\s]+)\s*-->/g)]
  const complete = [...source.matchAll(/<!--\s*product-fact:[^\s]+\s*-->[\s\S]*?<!--\s*\/product-fact\s*-->/g)]
  if (starts.length !== complete.length) {
    errors.push(error('fact-malformed', relativeFile, 'one or more product fact markers are not closed'))
  }
  return errors
}

export async function validateProductManifest(root, options = {}) {
  const manifestFile = path.join(root, 'product-manifest.json')
  let manifest
  try {
    manifest = await json(manifestFile)
  } catch (cause) {
    return { valid: false, errors: [error('manifest-read', 'product-manifest.json', `cannot read manifest: ${cause.message}`)] }
  }

  const errors = validateSchema(manifest, 'product-manifest.json')
  if (errors.length > 0) return { valid: false, errors }

  const rnPackage = await json(path.join(root, 'packages/rn/package.json'))
  const corePackage = await json(path.join(root, 'packages/core/package.json'))
  if (rnPackage.version !== manifest.packages.reactNative.version) {
    errors.push(error('package-version', 'packages/rn/package.json', `RN version: expected ${manifest.packages.reactNative.version}, found ${rnPackage.version}`))
  }
  if (corePackage.version !== manifest.packages.core.version) {
    errors.push(error('package-version', 'packages/core/package.json', `core version: expected ${manifest.packages.core.version}, found ${corePackage.version}`))
  }

  const scenarios = (await readdir(path.join(root, 'packages/rn/bench/scenarios'))).filter(name => name.endsWith('.json'))
  if (scenarios.length !== manifest.capabilities.benchmarkScenarios) {
    errors.push(error('benchmark-count', 'packages/rn/bench/scenarios', `benchmark scenarios: expected ${manifest.capabilities.benchmarkScenarios}, found ${scenarios.length}`))
  }

  const actualCounts = options.actualCounts
  if (actualCounts) {
    for (const key of ['deterministicCommands', 'mcpTools']) {
      if (actualCounts[key] !== manifest.capabilities[key]) {
        errors.push(error('capability-count', 'product-manifest.json', `${key}: expected ${manifest.capabilities[key]}, found ${actualCounts[key]}`))
      }
    }
  }

  const licenseText = await readFile(path.join(root, 'LICENSE'), 'utf8')
  const licenseIdentifier = manifest.license.id === 'BSL-1.1' ? 'Business Source License 1.1' : manifest.license.id
  if (!licenseText.includes(licenseIdentifier)) {
    errors.push(error('license-id', 'LICENSE', `expected license identifier ${manifest.license.id}`))
  }
  if (!new RegExp(`Change Date:\\s+${manifest.license.changeDate.replaceAll('-', '\\-')}`).test(licenseText)) {
    errors.push(error('license-change-date', 'LICENSE', `expected change date ${manifest.license.changeDate}`))
  }
  if (!new RegExp(`Change License:\\s+${manifest.license.changeLicense}`).test(licenseText)) {
    errors.push(error('license-change-license', 'LICENSE', `expected change license ${manifest.license.changeLicense}`))
  }
  const developerGrant = new RegExp(`commercial(?: use)? (?:for )?teams with ${manifest.license.freeCommercialDevelopers} or fewer developers`, 'i')
  if (!developerGrant.test(licenseText)) {
    errors.push(error('license-use-grant', 'LICENSE', `expected free commercial grant for teams with ${manifest.license.freeCommercialDevelopers} or fewer developers`))
  }
  const extensionPackage = await json(path.join(root, 'packages/rn/extension/package.json'))
  if (extensionPackage.license !== manifest.license.vscodeExtension) {
    errors.push(error('extension-license', 'packages/rn/extension/package.json', `expected ${manifest.license.vscodeExtension}, found ${String(extensionPackage.license)}`))
  }

  const rnPlanProjection = await json(path.join(root, 'packages/rn/src/billing/product-plans.generated.json'))
  if (JSON.stringify(rnPlanProjection) !== JSON.stringify(manifest.plans)) {
    errors.push(error('rn-plan-projection', 'packages/rn/src/billing/product-plans.generated.json', 'published RN pricing projection differs from product-manifest.json'))
  }

  for (const document of manifest.validation.documents) {
    const source = await readFile(path.join(root, document.path), 'utf8')
    errors.push(...validateMarkedFacts(manifest, document.path, source))
  }

  return { valid: errors.length === 0, errors }
}

export async function runProductCheck(root = process.cwd()) {
  const result = await validateProductManifest(root)
  if (result.valid) {
    process.stdout.write('Product manifest is consistent.\n')
    return 0
  }
  for (const issue of result.errors) {
    process.stderr.write(`[${issue.code}] ${issue.file}: ${issue.message}\n`)
  }
  return 1
}

const invoked = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (invoked) {
  process.exitCode = await runProductCheck(path.resolve(process.argv[2] || process.cwd()))
}
