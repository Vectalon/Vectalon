import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { impactCommand } from '../../src/cli/commands/impact'
import { impactDocsDir } from '../../src/harness'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

describe('impactCommand', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
    dir = createTempProject({
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n  - "apps/*"\n',
      'package.json': JSON.stringify({ name: 'root', version: '1.0.0', private: true }),
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
      'packages/ui/package.json': JSON.stringify({ name: '@acme/ui', version: '1.0.0' }),
      'packages/ui/src/Button.tsx': 'export const Button = () => null\n',
      'apps/mobile/package.json': JSON.stringify({ name: '@acme/mobile', version: '1.0.0', dependencies: { '@acme/ui': '1.0.0' } }),
      'apps/mobile/src/HomeScreen.tsx': [
        "import React from 'react'",
        "import { View } from 'react-native'",
        "import { Button } from '@acme/ui'",
        'export default function HomeScreen() {',
        '  return <View><Button label="Go" /></View>',
        '}',
        '',
      ].join('\n'),
    })
    configDir = useTempConfig()
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  it('prints the impact report to stdout', async () => {
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await impactCommand(dir, { changed: 'packages/ui/src/Button.tsx' })
    const written = out.mock.calls.map(c => String(c[0])).join('')
    expect(written).toContain('## 🌐 Cross-package impact analysis')
    expect(written).toContain('apps/mobile/src/HomeScreen.tsx')
    expect(written).toContain('### Re-render impact')
  })

  it('prints JSON when --json is passed', async () => {
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await impactCommand(dir, { changed: 'packages/ui/src/Button.tsx', json: true })
    const written = out.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(written)
    expect(parsed.changedPackages).toEqual(['@acme/ui'])
    expect(parsed.affectedPackages).toEqual(['@acme/mobile'])
  })

  it('does not post a PR comment without --pr', async () => {
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await impactCommand(dir, { changed: 'packages/ui/src/Button.tsx' })
    // Report printed to stdout, no 'would comment' dry-run log emitted.
    expect(out.mock.calls.map(c => String(c[0])).join('')).toContain('Cross-package impact')
    expect(err.mock.calls.map(c => String(c[0])).join('')).not.toContain('would comment')
  })

  it('--pr --dry-run simulates the PR comment via the console adapter', async () => {
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await impactCommand(dir, { changed: 'packages/ui/src/Button.tsx', pr: 42, dryRun: true })
    const stderr = err.mock.calls.map(c => String(c[0])).join('')
    expect(stderr).toContain('Git: would comment on PR #42')
    expect(stderr).toContain('Cross-package impact')
  })

  it('writes the impact doc to docs/vectalon/impact by default', async () => {
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await impactCommand(dir, { changed: 'packages/ui/src/Button.tsx' })
    // The doc tree exists under the tracked docs dir.
    expect(existsSync(join(dir, 'docs', 'vectalon', 'impact'))).toBe(true)
    const written = err.mock.calls.map(c => String(c[0])).join('')
    expect(written).toContain('Impact doc:')
    expect(written).toContain('docs/vectalon/impact')
  })

  it('honors --out for the doc location', async () => {
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await impactCommand(dir, { changed: 'packages/ui/src/Button.tsx', out: 'reports' })
    const files: string[] = []
    const walk = (d: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, entry.name)
        if (entry.isDirectory()) walk(p)
        else files.push(p)
      }
    }
    walk(join(dir, 'reports'))
    expect(files.length).toBeGreaterThan(0)
    expect(readFileSync(files[0], 'utf-8')).toContain('Cross-package impact analysis')
    // The default tree is not created when --out is given.
    expect(existsSync(impactDocsDir(dir))).toBe(false)
  })

  it('does not write the doc in --dry-run', async () => {
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await impactCommand(dir, { changed: 'packages/ui/src/Button.tsx', dryRun: true })
    expect(existsSync(impactDocsDir(dir))).toBe(false)
  })
})
