import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const require = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)
const { CONTRACT_REVISION, generateContractTypes } = require('../packages/core/dist/index.js')
const targets = [
  'packages/rn/src/contracts/core.generated.ts',
  'apps/website/lib/core-contracts.generated.ts',
]

export async function generateCoreContractProjections(root) {
  const generated = generateContractTypes()
  await Promise.all(targets.map(async target => {
    const file = path.join(root, target)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, generated)
  }))
}

export async function checkCoreContractProjections(root) {
  const errors = []
  const generated = generateContractTypes()
  for (const target of targets) {
    const actual = await readFile(path.join(root, target), 'utf8').catch(() => '')
    if (actual !== generated) errors.push(`${target} is stale`)
  }

  const product = JSON.parse(await readFile(path.join(root, 'product-manifest.json'), 'utf8'))
  if (product.packages?.core?.contractRevision !== CONTRACT_REVISION) {
    errors.push('product-manifest.json does not pin the bundled Core contract revision')
  }
  const sourceRevision = (await readFile(path.join(root, 'packages/core/core-source-revision.txt'), 'utf8')).trim()
  if (!/^[a-f0-9]{40}$/.test(sourceRevision)) errors.push('packages/core/core-source-revision.txt is not a full commit SHA')
  if (process.env.CORE_REPO_DIR) {
    const coreRoot = path.resolve(root, process.env.CORE_REPO_DIR)
    const { stdout } = await execFileAsync('git', ['-C', coreRoot, 'rev-parse', 'HEAD'])
    if (stdout.trim() !== sourceRevision) errors.push('Bundled Core checkout does not match core-source-revision.txt')
    const [sourceManifest, bundledManifest] = await Promise.all([
      readFile(path.join(coreRoot, 'contracts/registry-manifest.json')),
      readFile(path.join(root, 'packages/core/dist/contracts/registry-manifest.json')),
    ])
    if (!sourceManifest.equals(bundledManifest)) errors.push('Bundled Core contracts differ from the pinned Core commit')
  }
  return { valid: errors.length === 0, errors }
}

async function main() {
  const root = path.resolve(process.argv[3] ?? process.cwd())
  if (process.argv[2] === 'generate') {
    await generateCoreContractProjections(root)
    process.stdout.write('Generated Core contract projections.\n')
    return
  }
  const result = await checkCoreContractProjections(root)
  if (!result.valid) {
    result.errors.forEach(issue => process.stderr.write(`${issue}\n`))
    process.exitCode = 1
  } else {
    process.stdout.write('Core contract projections are current.\n')
  }
}

const invoked = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (invoked) await main()
