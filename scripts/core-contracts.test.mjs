import assert from 'node:assert/strict'
import test from 'node:test'

import { checkCoreContractProjections } from './core-contracts.mjs'

test('RN and website generated types match the pinned Core registry', async () => {
  const result = await checkCoreContractProjections(process.cwd())

  assert.deepEqual(result, { valid: true, errors: [] })
})
