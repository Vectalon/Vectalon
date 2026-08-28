import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(process.argv[2] || process.cwd())
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'))
const catalog = await read('packages/rn/src/capabilities/catalog.json')
const surfaces = await read('packages/rn/src/capabilities/surfaces.json')
const lifecycle = new Map(catalog.capabilities.map(entry => [entry.id, entry.lifecycle]))

const status = Object.fromEntries(surfaces
  .filter(surface => surface.kind === 'extension' || surface.kind === 'extension-handler')
  .map(surface => [surface.name, lifecycle.get(surface.capabilityId)]).sort(([a], [b]) => a.localeCompare(b)))
await writeFile(path.join(root, 'packages/rn/extension/src/capability-status.generated.json'), `${JSON.stringify(status, null, 2)}\n`)

const extensionFile = 'packages/rn/extension/package.json'
const extension = await read(extensionFile)
for (const command of extension.contributes.commands) {
  const state = status[command.command] || 'unregistered'
  command.title = `[${state}] ${command.title.replace(/^\[[^\]]+\]\s*/, '')}`
  if (state === 'experimental') command.enablement = 'config.vectalon.experimentalCapabilities'
  else if (state === 'planned' || state === 'removed' || state === 'unregistered') command.enablement = 'false'
  else delete command.enablement
}
extension.contributes.configuration.properties['vectalon.experimentalCapabilities'] = {
  type: 'boolean', default: false,
  description: 'Show and allow experimental Vectalon commands. This does not grant paid entitlements.',
}
await writeFile(path.join(root, extensionFile), `${JSON.stringify(extension, null, 2)}\n`)

const counts = {}
for (const kind of [...new Set(surfaces.map(surface => surface.kind))].sort()) {
  const declared = surfaces.filter(surface => surface.kind === kind)
  counts[kind] = {
    declared: declared.length,
    enabledByDefault: declared.filter(surface => ['beta', 'release-candidate', 'available', 'deprecated'].includes(lifecycle.get(surface.capabilityId))).length,
    conditional: declared.filter(surface => surface.requires).length,
  }
}
await writeFile(path.join(root, 'apps/website/lib/capability-inventory.generated.json'), `${JSON.stringify({ productVersion: catalog.productVersion, counts }, null, 2)}\n`)
process.stdout.write('Generated capability projections.\n')
