import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const script = path.join(root, 'scripts/capability-catalog.mjs')
const check = dir => spawnSync(process.execPath, [script, 'check', dir, '--base', '7fa0734f7bd8648aa8be33145a958c1425fe87b1'], { encoding: 'utf8' })

test('the committed inventory and evidence pass the executable release gate', () => {
  const result = check(root)
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

for (const mutation of ['registration', 'mcp-registration', 'extension-registration', 'api-registration', 'claim', 'evidence', 'missing-evidence', 'promotion']) {
  test(`release gate rejects ${mutation} tampering`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vectalon-freeze-test-'))
    try {
      for (const name of ['packages/rn/src', 'packages/rn/extension', 'packages/rn/bench', 'packages/rn/README.md', 'apps/website/app', 'apps/website/components', 'apps/website/lib', 'capabilities', 'README.md', 'LICENSE-COMMERCIAL', 'product-manifest.json']) {
        await cp(path.join(root, name), path.join(dir, name), { recursive: true, filter: source => !source.includes('/node_modules') && !source.includes('/out/') })
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
      } else {
        const file = path.join(dir, 'packages/rn/src/capabilities/catalog.json')
        const catalog = JSON.parse(await readFile(file, 'utf8'))
        const entry = catalog.capabilities.find(capability => capability.id === 'rn.policy.check')
        if (mutation === 'promotion') entry.lifecycle = 'available'
        else if (mutation === 'evidence') entry.evidence[0].digest = '0'.repeat(64)
        else entry.evidence[0].reference = 'capabilities/evidence/missing.json'
        await writeFile(file, JSON.stringify(catalog))
      }
      const result = check(dir)
      assert.equal(result.status, 1)
      assert.match(result.stderr, /inventory|evidence|qualification|insufficient-evidence|public-claim/)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
}
