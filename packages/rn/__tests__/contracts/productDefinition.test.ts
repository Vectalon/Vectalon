import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import type { ProductDefinition } from '../../src/contracts/core.generated'

const bundledCoreRoot = path.resolve(__dirname, '../../dist/node_modules/@vectalon-dev/core')
const requireArtifact = createRequire(__filename)
const bundledCore = requireArtifact(path.join(bundledCoreRoot, 'index.js')) as typeof import('@vectalon-dev/core')
const { CONTRACT_REVISION, validateContract } = bundledCore
const coreDist = path.join(bundledCoreRoot, 'contracts')

describe('shipped ProductDefinition contract', () => {
  test('reads the supported Core fixture from the package artifact', () => {
    const payload: ProductDefinition = JSON.parse(
      readFileSync(path.join(coreDist, 'fixtures/ProductDefinition/valid.json'), 'utf8'),
    )

    expect(validateContract('ProductDefinition', payload)).toEqual({ valid: true, errors: [] })
    expect(CONTRACT_REVISION).toMatch(/^1\.0\.0\+[a-f0-9]{64}$/)
    expect(readFileSync(path.join(bundledCoreRoot, 'core-source-revision.txt'), 'utf8').trim()).toMatch(/^[a-f0-9]{40}$/)
    expect(JSON.parse(readFileSync(path.join(bundledCoreRoot, 'package.json'), 'utf8')).dependencies).toEqual({
      ajv: '^8.18.0',
    })
  })

  test('fails closed for the future-major Core fixture', () => {
    const payload = JSON.parse(
      readFileSync(path.join(coreDist, 'fixtures/ProductDefinition/unknown-version.json'), 'utf8'),
    )

    expect(validateContract('ProductDefinition', payload).errors).toContainEqual({
      path: '/contractVersion',
      code: 'unsupported-version',
    })
  })
})
