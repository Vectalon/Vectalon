const disabledLifecycles = new Set(['planned', 'removed'])

export function buildExtensionCapabilityStatus(catalog, surfaces) {
  const capabilities = new Map(catalog.capabilities.map(capability => [capability.id, capability]))
  const commands = new Map()
  for (const surface of surfaces.filter(surface => surface.kind === 'extension' || surface.kind === 'extension-handler')) {
    const prior = commands.get(surface.name)
    if (prior && prior !== surface.capabilityId) throw new Error(`extension command ${surface.name} has conflicting owners`)
    commands.set(surface.name, surface.capabilityId)
  }
  return Object.fromEntries([...commands].sort(([a], [b]) => a.localeCompare(b)).map(([command, capabilityId]) => {
    const capability = capabilities.get(capabilityId)
    if (!capability) throw new Error(`extension command ${command} has unknown owner ${capabilityId}`)
    return [command, {
      capabilityId,
      capabilityVersion: capability.version,
      lifecycle: capability.lifecycle,
      implemented: capability.implemented,
      plans: [...capability.support.plans],
      supportTier: capability.support.tier,
      deprecation: capability.deprecation || null,
    }]
  }))
}

export function commandEnablement(record) {
  if (!record || !record.implemented || disabledLifecycles.has(record.lifecycle)) return 'false'
  if (record.lifecycle === 'experimental') return 'config.vectalon.experimentalCapabilities'
  return undefined
}

export function projectExtensionManifest(manifest, status) {
  const projected = structuredClone(manifest)
  for (const command of projected.contributes.commands) {
    const record = status[command.command]
    const state = record?.lifecycle || 'unregistered'
    command.title = `[${state}] ${command.title.replace(/^\[[^\]]+\]\s*/, '')}`
    const enablement = commandEnablement(record)
    if (enablement) command.enablement = enablement
    else delete command.enablement
  }
  projected.contributes.configuration.properties['vectalon.experimentalCapabilities'] = {
    type: 'boolean',
    default: false,
    description: 'Show and allow experimental Vectalon commands. This does not grant paid entitlements.',
  }
  return projected
}

export function extensionManifestProjectionErrors(manifest, status) {
  const errors = []
  for (const command of manifest.contributes.commands) {
    const record = status[command.command]
    const state = record?.lifecycle || 'unregistered'
    const expectedEnablement = commandEnablement(record)
    if (command.enablement !== expectedEnablement) errors.push(`projection: extension manifest enablement differs for ${command.command}`)
    if (!command.title.startsWith(`[${state}] `)) errors.push(`projection: extension manifest lifecycle label differs for ${command.command}`)
  }
  const expectedConfiguration = {
    type: 'boolean',
    default: false,
    description: 'Show and allow experimental Vectalon commands. This does not grant paid entitlements.',
  }
  if (JSON.stringify(manifest.contributes.configuration.properties['vectalon.experimentalCapabilities']) !== JSON.stringify(expectedConfiguration)) {
    errors.push('projection: extension manifest experimental configuration differs')
  }
  return errors
}
