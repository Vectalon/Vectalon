import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const script = path.join(root, 'scripts/capability-catalog.mjs')
const initialBase = '7fa0734f7bd8648aa8be33145a958c1425fe87b1'
const check = (dir, base = initialBase) => spawnSync(process.execPath, [script, 'check', dir, '--base', base], { encoding: 'utf8' })

test('the committed inventory and evidence pass the executable release gate', () => {
  const result = check(root)
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

for (const mutation of [
  'registration',
  'mcp-registration',
  'extension-registration',
  'api-registration',
  'claim',
  'offline-claim',
  'ownership',
  'ownership-qualification',
  'public-lifecycle',
  'public-evidence',
  'extension-projection',
  'extension-enablement',
  'evidence',
  'missing-evidence',
  'promotion',
]) {
  test(`release gate rejects ${mutation} tampering`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vectalon-freeze-test-'))
    try {
      for (const name of ['.git', 'packages/rn/src', 'packages/rn/extension', 'packages/rn/bench', 'packages/rn/__tests__', 'packages/rn/README.md', 'apps/website/app', 'apps/website/components', 'apps/website/lib', 'capabilities', 'README.md', 'LICENSE-COMMERCIAL', 'product-manifest.json']) {
        await cp(path.join(root, name), path.join(dir, name), {
          recursive: true,
          filter: source => !source.includes('/node_modules')
            && (!source.includes('/out/') || source.endsWith('/out/capability-status.generated.json')),
        })
      }
      if (mutation === 'registration') {
        const file = path.join(dir, 'packages/rn/src/cli/index.ts')
        await writeFile(file, (await readFile(file, 'utf8')).replace('return program', "program.command('unregistered-outcome').action(() => {})\n  return program"))
      } else if (mutation === 'mcp-registration') {
        const file = path.join(dir, 'packages/rn/src/protocol/tools/CoreTools.ts')
        await writeFile(file, `${await readFile(file, 'utf8')}\nclass Unregistered { @mcpTool('unregistered_tool', 'x', {}) run() {} }\n`)
      } else if (mutation === 'extension-registration') {
        const file = path.join(dir, 'packages/rn/extension/package.json')
        const extension = JSON.parse(await readFile(file, 'utf8'))
        extension.contributes.commands.push({ command: 'vectalon.unregistered', title: 'Unregistered' })
        await writeFile(file, JSON.stringify(extension))
      } else if (mutation === 'api-registration') {
        const file = path.join(dir, 'packages/rn/src/index.ts')
        await writeFile(file, `${await readFile(file, 'utf8')}\nexport const unregisteredApi = true\n`)
      } else if (mutation === 'claim') {
        const file = path.join(dir, 'README.md')
        await writeFile(file, `${await readFile(file, 'utf8')}\nAll current and future Vectalon products\n`)
      } else if (mutation === 'offline-claim') {
        const file = path.join(dir, 'apps/website/app/page.tsx')
        await writeFile(file, `${await readFile(file, 'utf8')}\nAll 44 deterministic agents work fully offline.\n`)
      } else if (mutation === 'ownership') {
        const file = path.join(dir, 'packages/rn/src/capabilities/surfaces.json')
        const surfaces = JSON.parse(await readFile(file, 'utf8'))
        surfaces.find(surface => surface.key === 'claims:apps/website/app/agents/page.tsx').capabilityId = 'rn.commercial-information'
        await writeFile(file, JSON.stringify(surfaces))
      } else if (mutation === 'ownership-qualification') {
        const definitionFile = path.join(dir, 'capabilities/definition.json')
        const definitions = JSON.parse(await readFile(definitionFile, 'utf8'))
        definitions['rn.analysis'].claims = definitions['rn.analysis'].claims.filter(name => name !== 'apps/website/app/agents/page.tsx')
        definitions['rn.evaluation'].claims.push('apps/website/app/agents/page.tsx')
        await writeFile(definitionFile, JSON.stringify(definitions))
        const surfaceFile = path.join(dir, 'packages/rn/src/capabilities/surfaces.json')
        const surfaces = JSON.parse(await readFile(surfaceFile, 'utf8'))
        const surface = surfaces.find(item => item.key === 'claims:apps/website/app/agents/page.tsx')
        surface.capabilityId = 'rn.evaluation'
        surface.capabilityLifecycle = 'experimental'
        surface.capabilityEvidence = ['capabilities/evidence/rn.evaluation.1.0.0.0.16.0.implementation.json']
        await writeFile(surfaceFile, JSON.stringify(surfaces))
      } else if (mutation === 'public-lifecycle' || mutation === 'public-evidence') {
        const file = path.join(dir, 'packages/rn/src/capabilities/surfaces.json')
        const surfaces = JSON.parse(await readFile(file, 'utf8'))
        const surface = surfaces.find(item => item.key === 'claims:apps/website/app/agents/page.tsx')
        if (mutation === 'public-lifecycle') surface.capabilityLifecycle = 'available'
        else surface.capabilityEvidence = []
        await writeFile(file, JSON.stringify(surfaces))
      } else if (mutation === 'extension-projection') {
        const file = path.join(dir, 'packages/rn/extension/src/capability-status.generated.json')
        const status = JSON.parse(await readFile(file, 'utf8'))
        status['vectalon.archiveBuild'] = 'available'
        await writeFile(file, JSON.stringify(status))
      } else if (mutation === 'extension-enablement') {
        const file = path.join(dir, 'packages/rn/extension/package.json')
        const extension = JSON.parse(await readFile(file, 'utf8'))
        delete extension.contributes.commands.find(command => command.command === 'vectalon.archiveBuild').enablement
        await writeFile(file, JSON.stringify(extension))
      } else {
        const file = path.join(dir, 'packages/rn/src/capabilities/catalog.json')
        const catalog = JSON.parse(await readFile(file, 'utf8'))
        const entry = catalog.capabilities.find(capability => capability.id === 'rn.policy.check')
        if (mutation === 'promotion') entry.lifecycle = 'available'
        else if (mutation === 'evidence') entry.evidence[0].digest = '0'.repeat(64)
        else entry.evidence[0].reference = 'capabilities/evidence/missing.json'
        await writeFile(file, JSON.stringify(catalog))
      }
      const result = check(dir, mutation === 'ownership-qualification' ? 'HEAD' : initialBase)
      assert.equal(result.status, 1)
      const expectedError = {
        ownership: /ownership: claims:apps\/website\/app\/agents\/page\.tsx/,
        'ownership-qualification': /ownership: claims:apps\/website\/app\/agents\/page\.tsx changed rn\.commercial-information -> rn\.evaluation without explicit current qualification/,
        'public-lifecycle': /ownership: claims:apps\/website\/app\/agents\/page\.tsx lifecycle projection differs/,
        'public-evidence': /ownership: claims:apps\/website\/app\/agents\/page\.tsx evidence projection differs/,
        'extension-projection': /projection: extension capability status/,
        'extension-enablement': /projection: extension manifest enablement/,
        'offline-claim': /public-claim: unsupported unconditional promise/,
      }[mutation] || /inventory|evidence|qualification|insufficient-evidence|public-claim/
      assert.match(result.stderr, expectedError)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
}
