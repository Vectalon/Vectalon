import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildExtensionCapabilityStatus, projectExtensionManifest } from './capability-projections.mjs'

const root = path.resolve(process.argv[2] || process.cwd())
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'))
const catalog = await read('packages/rn/src/capabilities/catalog.json')
const surfaces = await read('packages/rn/src/capabilities/surfaces.json')
const lifecycle = new Map(catalog.capabilities.map(entry => [entry.id, entry.lifecycle]))
const status = buildExtensionCapabilityStatus(catalog, surfaces)
const sourceStatus = `${JSON.stringify(status, null, 2)}\n`
// TypeScript copies imported JSON into out/ with four-space indentation.
// Match that byte-for-byte so generation and extension compilation are stable.
const packagedStatus = `${JSON.stringify(status, null, 4)}\n`
await Promise.all([
  writeFile(path.join(root, 'packages/rn/extension/src/capability-status.generated.json'), sourceStatus),
  writeFile(path.join(root, 'packages/rn/extension/out/capability-status.generated.json'), packagedStatus),
])

const extensionFile = 'packages/rn/extension/package.json'
const extension = projectExtensionManifest(await read(extensionFile), status)
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
