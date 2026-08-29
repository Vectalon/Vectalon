import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  extensionCommandDecision,
  extensionCommandDecisionFrom,
  extensionCommandLabel,
} = require('../packages/rn/extension/out/capabilityAvailability.js')

test('packaged extension fails closed for experimental and unknown commands', () => {
  assert.deepEqual(extensionCommandDecision('vectalon.archiveBuild', false), {
    available: false,
    reason: 'experimental-opt-in-required',
  })
  assert.deepEqual(extensionCommandDecision('vectalon.notRegistered', true), {
    available: false,
    reason: 'unknown-capability',
  })
})

test('packaged extension labels commands from projected lifecycle records', () => {
  assert.equal(extensionCommandLabel('vectalon.checkGuardrails'), '[beta]')
  assert.equal(extensionCommandLabel('vectalon.archiveBuild'), '[experimental]')
})

test('packaged extension returns deprecation migration, removal, and license guidance', () => {
  const decision = extensionCommandDecisionFrom({
    'vectalon.oldCommand': {
      capabilityId: 'rn.old-command',
      capabilityVersion: '2.1.0',
      lifecycle: 'deprecated',
      implemented: true,
      plans: ['individual'],
      supportTier: 'maintenance-only',
      deprecation: {
        noticeVersion: '2.0.0',
        noticeReference: 'docs/deprecations/old-command.md',
        migrationReference: 'docs/migrations/new-command.md',
        removalVersion: '3.0.0',
        licenseEffect: 'Existing licenses retain use until removal.',
      },
    },
  }, 'vectalon.oldCommand', false)

  assert.equal(decision.available, true)
  assert.equal(decision.reason, 'deprecated')
  assert.match(decision.warning, /docs\/migrations\/new-command\.md/)
  assert.match(decision.warning, /Remove in 3\.0\.0/)
  assert.match(decision.warning, /Existing licenses retain use until removal\./)
})
