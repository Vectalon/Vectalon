import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildExtensionCapabilityStatus,
  projectExtensionManifest,
} from './capability-projections.mjs'

const capability = {
  id: 'rn.old-command',
  version: '2.1.0',
  lifecycle: 'deprecated',
  implemented: true,
  support: {
    plans: ['individual', 'team'],
    tier: 'maintenance-only',
  },
  deprecation: {
    noticeVersion: '2.0.0',
    noticeReference: 'docs/deprecations/old-command.md',
    migrationReference: 'docs/migrations/new-command.md',
    removalVersion: '3.0.0',
    licenseEffect: 'Existing licenses retain use until removal.',
  },
}

test('extension projection carries deprecation migration, removal, and license metadata', () => {
  const projection = buildExtensionCapabilityStatus(
    { capabilities: [capability] },
    [{ kind: 'extension', name: 'vectalon.oldCommand', capabilityId: capability.id }],
  )

  assert.deepEqual(projection['vectalon.oldCommand'], {
    capabilityId: 'rn.old-command',
    capabilityVersion: '2.1.0',
    lifecycle: 'deprecated',
    implemented: true,
    plans: ['individual', 'team'],
    supportTier: 'maintenance-only',
    deprecation: capability.deprecation,
  })
})

test('extension manifest keeps deprecated commands enabled and visibly labelled', () => {
  const manifest = {
    contributes: {
      commands: [{ command: 'vectalon.oldCommand', title: 'Old command' }],
      configuration: { properties: {} },
    },
  }
  const projection = buildExtensionCapabilityStatus(
    { capabilities: [capability] },
    [{ kind: 'extension', name: 'vectalon.oldCommand', capabilityId: capability.id }],
  )

  const projected = projectExtensionManifest(manifest, projection)

  assert.deepEqual(projected.contributes.commands[0], {
    command: 'vectalon.oldCommand',
    title: '[deprecated] Old command',
  })
})
