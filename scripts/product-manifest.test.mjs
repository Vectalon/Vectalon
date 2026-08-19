import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { renderRnPlanProjection, validateProductManifest } from './product-manifest.mjs'

async function fixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'vectalon-product-manifest-'))
  await mkdir(path.join(root, 'packages/rn/bench/scenarios'), { recursive: true })
  await mkdir(path.join(root, 'packages/rn/extension'), { recursive: true })
  await mkdir(path.join(root, 'packages/rn/src/billing'), { recursive: true })
  await mkdir(path.join(root, 'packages/core'), { recursive: true })
  await mkdir(path.join(root, 'docs'), { recursive: true })

  const manifest = {
    contractVersion: '1.0.0',
    schemaVersion: 1,
    product: { id: 'vectalon', name: 'Vectalon', releaseStatus: 'beta', flagship: 'react-native' },
    packages: {
      reactNative: { name: '@vectalon-dev/rn', version: '1.2.3', status: 'available' },
      core: { name: '@vectalon-dev/core', version: '0.4.5', distribution: 'bundled-private-runtime', contractRevision: `1.0.0+${'a'.repeat(64)}` },
    },
    platforms: { reactNative: 'beta', ios: 'coming-soon', android: 'coming-soon', flutter: 'coming-soon', python: 'coming-soon' },
    capabilities: { benchmarkScenarios: 2, deterministicCommands: 3, mcpTools: 4 },
    plans: [
      {
        id: 'individual',
        name: 'Individual',
        engineTier: 'pro',
        price: { currency: 'USD', minorUnits: 1900 },
        seatQuantity: { minimum: 1, maximum: 1, unit: 'developer' },
        billingCadence: 'monthly',
        taxTreatment: 'exclusive',
        trialEligibility: { eligible: true, durationDays: 14 },
        gracePolicy: { offlineDays: 7, paymentFailureDays: 3 },
        productScope: ['rn'],
        checkout: 'checkout',
        features: ['Local AI'],
      },
    ],
    license: { id: 'BSL-1.1', freeCommercialDevelopers: 3, changeDate: '2030-08-06', changeLicense: 'MIT', vscodeExtension: 'MIT' },
    validation: {
      documents: [
        { path: 'docs/product.md', facts: ['rn-version', 'individual-price'] },
      ],
    },
    ...overrides,
  }

  await writeFile(path.join(root, 'product-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const projection = manifest.plans.every(plan => plan.price && plan.seatQuantity && plan.trialEligibility)
    ? renderRnPlanProjection(manifest)
    : '[]\n'
  await writeFile(path.join(root, 'packages/rn/src/billing/product-plans.generated.json'), projection)
  await writeFile(path.join(root, 'packages/rn/package.json'), '{"name":"@vectalon-dev/rn","version":"1.2.3"}\n')
  await writeFile(path.join(root, 'packages/core/package.json'), '{"name":"@vectalon-dev/core","version":"0.4.5"}\n')
  await writeFile(path.join(root, 'packages/rn/extension/package.json'), '{"license":"MIT"}\n')
  await writeFile(path.join(root, 'packages/rn/bench/scenarios/rn-01.json'), '{}\n')
  await writeFile(path.join(root, 'packages/rn/bench/scenarios/rn-02.json'), '{}\n')
  await writeFile(path.join(root, 'LICENSE'), 'Business Source License 1.1\nChange Date: 2030-08-06\nChange License: MIT\nAdditional Use Grant: commercial teams with 3 or fewer developers.\n')
  await writeFile(path.join(root, 'docs/product.md'), '<!-- product-fact:rn-version -->1.2.3<!-- /product-fact -->\n<!-- product-fact:individual-price -->$19<!-- /product-fact -->\n')
  return root
}

test('accepts a repository whose manifest, artifacts, and marked facts agree', async () => {
  const root = await fixture()
  const result = await validateProductManifest(root, { actualCounts: { deterministicCommands: 3, mcpTools: 4 } })
  assert.deepEqual(result, { valid: true, errors: [] })
})

test('reports stale package and benchmark facts together', async () => {
  const root = await fixture()
  await writeFile(path.join(root, 'packages/rn/package.json'), '{"name":"@vectalon-dev/rn","version":"1.2.4"}\n')
  await writeFile(path.join(root, 'packages/rn/bench/scenarios/rn-03.json'), '{}\n')

  const result = await validateProductManifest(root, { actualCounts: { deterministicCommands: 3, mcpTools: 4 } })

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors.map(error => error.code), ['package-version', 'benchmark-count'])
  assert.match(result.errors[0].message, /expected 1\.2\.3, found 1\.2\.4/)
  assert.match(result.errors[1].message, /expected 2, found 3/)
})

test('rejects missing, duplicate, malformed, and stale fact markers', async () => {
  const root = await fixture()
  await writeFile(path.join(root, 'docs/product.md'), [
    '<!-- product-fact:rn-version -->0.0.0<!-- /product-fact -->',
    '<!-- product-fact:rn-version -->1.2.3<!-- /product-fact -->',
    '<!-- product-fact:broken -->value',
  ].join('\n'))

  const result = await validateProductManifest(root, { actualCounts: { deterministicCommands: 3, mcpTools: 4 } })

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors.map(error => error.code), ['fact-duplicate', 'fact-stale', 'fact-missing', 'fact-malformed'])
})

test('is read-only even when validation fails', async () => {
  const root = await fixture()
  const target = path.join(root, 'docs/product.md')
  await writeFile(target, '<!-- product-fact:rn-version -->stale<!-- /product-fact -->\n')
  const before = await readFile(target, 'utf8')

  await validateProductManifest(root, { actualCounts: { deterministicCommands: 99, mcpTools: 99 } })

  assert.equal(await readFile(target, 'utf8'), before)
})

test('fails closed for an unknown schema version', async () => {
  const root = await fixture({ contractVersion: '2.0.0' })

  const result = await validateProductManifest(root, { actualCounts: { deterministicCommands: 3, mcpTools: 4 } })

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors.map(error => error.code), ['unsupported-version'])
})

test('requires explicit money, seats, billing, tax, trial, grace, and product scope', async () => {
  const root = await fixture({
    plans: [{
      id: 'individual',
      name: 'Individual',
      engineTier: 'pro',
      checkout: 'checkout',
      features: ['Local AI'],
    }],
  })

  const result = await validateProductManifest(root)

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors.map(issue => issue.path), [
    '/plans/0/price',
    '/plans/0/seatQuantity',
    '/plans/0/billingCadence',
    '/plans/0/taxTreatment',
    '/plans/0/trialEligibility',
    '/plans/0/gracePolicy',
    '/plans/0/productScope',
  ])
})

test('accepts additive product fields for forward-compatible v1 payloads', async () => {
  const root = await fixture({ additiveField: { safelyIgnored: true } })

  const result = await validateProductManifest(root, { actualCounts: { deterministicCommands: 3, mcpTools: 4 } })

  assert.equal(result.valid, true)
})

test('rejects license identifier, change date, grant, and extension-license drift', async () => {
  const root = await fixture()
  await writeFile(path.join(root, 'LICENSE'), 'Some other license\nChange Date: 2031-01-01\nChange License: Apache-2.0\n')
  await writeFile(path.join(root, 'packages/rn/extension/package.json'), '{"license":"BSL-1.1"}\n')

  const result = await validateProductManifest(root, { actualCounts: { deterministicCommands: 3, mcpTools: 4 } })

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors.map(error => error.code), [
    'license-id',
    'license-change-date',
    'license-change-license',
    'license-use-grant',
    'extension-license',
  ])
})

test('rejects a stale published RN pricing projection', async () => {
  const root = await fixture()
  await writeFile(path.join(root, 'packages/rn/src/billing/product-plans.generated.json'), '[]\n')

  const result = await validateProductManifest(root, { actualCounts: { deterministicCommands: 3, mcpTools: 4 } })

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors.map(error => error.code), ['rn-plan-projection'])
})

test('rejects malformed plan and license fields with precise paths', async () => {
  const root = await fixture({
    plans: [{ id: '', name: 'Individual', features: 'not-an-array' }],
    license: { id: 'BSL-1.1' },
  })

  const result = await validateProductManifest(root)

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors.map(issue => issue.path), [
    '/plans/0/engineTier',
    '/plans/0/price',
    '/plans/0/seatQuantity',
    '/plans/0/billingCadence',
    '/plans/0/taxTreatment',
    '/plans/0/trialEligibility',
    '/plans/0/gracePolicy',
    '/plans/0/productScope',
    '/plans/0/checkout',
    '/plans/0/id',
    '/plans/0/features',
    '/license/freeCommercialDevelopers',
    '/license/changeDate',
    '/license/changeLicense',
    '/license/vscodeExtension',
  ])
})

test('renders the RN plan projection deterministically', () => {
  const manifest = {
    plans: [{
      id: 'individual', name: 'Individual', engineTier: 'pro',
      price: { currency: 'USD', minorUnits: 1900 },
      seatQuantity: { minimum: 1, maximum: 1, unit: 'developer' },
      billingCadence: 'monthly', checkout: 'checkout',
      trialEligibility: { eligible: true }, features: ['Local AI'],
    }],
  }
  assert.equal(renderRnPlanProjection(manifest), `${JSON.stringify([{
    id: 'individual', name: 'Individual', engineTier: 'pro', price: '$19',
    cadence: '/developer/month', checkout: 'checkout', trialEligible: true,
    features: ['Local AI'],
  }], null, 2)}\n`)
})
