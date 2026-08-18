import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { renderRnPlanProjection } from './product-manifest.mjs'

const root = path.resolve(process.argv[2] || process.cwd())
const manifest = JSON.parse(await readFile(path.join(root, 'product-manifest.json'), 'utf8'))
await writeFile(
  path.join(root, 'packages/rn/src/billing/product-plans.generated.json'),
  renderRnPlanProjection(manifest),
)
process.stdout.write('Generated product projections.\n')
