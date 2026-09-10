import { readFileSync } from 'fs'
import { join } from 'path'

describe('release Core checkout build contract', () => {
  it('installs and builds each exact private Core checkout before RN bundles it', () => {
    const workflow = readFileSync(join(__dirname, '../../../../.github/workflows/publish.yml'), 'utf8')
    const blocks = workflow.split('- name: Install and build frozen Core checkout')

    // Both independent jobs start from a fresh checkout whose dist directory
    // is absent at the pinned revision. The explicit local install/build is
    // therefore part of the artifact boundary, not a cache-dependent accident.
    expect(blocks).toHaveLength(3)
    for (const block of blocks.slice(1)) {
      const beforeRnBundle = block.slice(0, block.indexOf('pnpm turbo run build --filter=@vectalon-dev/rn'))
      expect(beforeRnBundle).toContain('npm ci --prefix packages/core/src')
      expect(beforeRnBundle).toContain('npm run build --prefix packages/core/src')
      expect(beforeRnBundle).toContain('generate-license-keyset.js packages/core/src')
    }
    expect(workflow).toContain('ref: ${{ env.VECTALON_CORE_RELEASE_REF }}')
    expect(workflow).toContain('ref: ${{ needs.bench-gate.outputs.core-sha }}')
  })
})
