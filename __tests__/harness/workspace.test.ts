import { join } from 'path'
import {
  detectWorkspace,
  findWorkspaceRoot,
  expandWorkspaceGlob,
  resolveNodeModulesRoot,
  NO_WORKSPACE,
} from '../../src/harness/workspace'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('workspace detection', () => {
  it('detects a pnpm workspace by walking up from a member package', () => {
    const dir = createTempProject({
      'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n  - "packages/*"\n',
      'package.json': JSON.stringify({ name: 'root', version: '1.0.0', private: true }),
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
      'apps/mobile/package.json': JSON.stringify({ name: 'mobile', version: '1.0.0' }),
      'packages/ui/package.json': JSON.stringify({ name: '@acme/ui', version: '1.0.0' }),
      'packages/core/package.json': JSON.stringify({ name: '@acme/core', version: '1.0.0' }),
    })
    try {
      const ws = detectWorkspace(join(dir, 'apps', 'mobile'))
      expect(ws.isMonorepo).toBe(true)
      expect(ws.manager).toBe('pnpm')
      expect(ws.root).toBe(dir)
      expect(ws.patterns).toEqual(['apps/*', 'packages/*'])
      expect(ws.packages.sort()).toEqual([
        join(dir, 'apps', 'mobile'),
        join(dir, 'packages', 'core'),
        join(dir, 'packages', 'ui'),
      ])
      expect(ws.internalPackages['@acme/ui']).toBe(join(dir, 'packages', 'ui'))
      expect(ws.internalPackages['@acme/core']).toBe(join(dir, 'packages', 'core'))
      expect(ws.internalPackages['mobile']).toBe(join(dir, 'apps', 'mobile'))
      expect(ws.hoistedNodeModules).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('detects a yarn workspaces field (yarn.lock decides the manager)', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'root',
        version: '1.0.0',
        private: true,
        workspaces: ['packages/*'],
      }),
      'yarn.lock': '# yarn lockfile\n',
      'packages/design/package.json': JSON.stringify({ name: '@acme/design', version: '1.0.0' }),
    })
    try {
      const ws = detectWorkspace(join(dir, 'packages', 'design'))
      expect(ws.isMonorepo).toBe(true)
      expect(ws.manager).toBe('yarn')
      expect(ws.internalPackages['@acme/design']).toBe(join(dir, 'packages', 'design'))
    } finally {
      cleanup(dir)
    }
  })

  it('detects an npm workspaces field without lockfile hints', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'root',
        version: '1.0.0',
        private: true,
        workspaces: ['packages/*'],
      }),
      'packages/sdk/package.json': JSON.stringify({ name: 'sdk', version: '1.0.0' }),
    })
    try {
      const ws = detectWorkspace(dir)
      expect(ws.isMonorepo).toBe(true)
      expect(ws.manager).toBe('npm')
    } finally {
      cleanup(dir)
    }
  })

  it('detects a lerna.json workspace', () => {
    const dir = createTempProject({
      'lerna.json': JSON.stringify({ version: 'independent', packages: ['packages/*'] }),
      'package.json': JSON.stringify({ name: 'root', version: '1.0.0', private: true }),
      'packages/api/package.json': JSON.stringify({ name: '@acme/api', version: '1.0.0' }),
    })
    try {
      const ws = detectWorkspace(dir)
      expect(ws.isMonorepo).toBe(true)
      expect(ws.manager).toBe('lerna')
      expect(ws.internalPackages['@acme/api']).toBe(join(dir, 'packages', 'api'))
    } finally {
      cleanup(dir)
    }
  })

  it('detects a turbo.json workspace (patterns from the manifest, packages/* default otherwise)', () => {
    const dir = createTempProject({
      'turbo.json': JSON.stringify({ $schema: 'https://turbo.build/schema.json', tasks: {} }),
      'package.json': JSON.stringify({
        name: 'root',
        version: '1.0.0',
        private: true,
        workspaces: ['apps/*'],
      }),
      'apps/web/package.json': JSON.stringify({ name: 'web', version: '1.0.0' }),
    })
    try {
      const ws = detectWorkspace(dir)
      expect(ws.isMonorepo).toBe(true)
      expect(ws.manager).toBe('turborepo')
      expect(ws.patterns).toEqual(['apps/*'])
      expect(ws.internalPackages['web']).toBe(join(dir, 'apps', 'web'))
    } finally {
      cleanup(dir)
    }
  })

  it('parses pnpm-workspace.yaml items with trailing comments', () => {
    const dir = createTempProject({
      'pnpm-workspace.yaml': [
        'packages:',
        '  - "apps/*" # mobile + web',
        '  - packages/*',
        'settings:',
        '  autoInstallPeers: true',
      ].join('\n'),
      'package.json': JSON.stringify({ name: 'root', version: '1.0.0', private: true }),
      'apps/mobile/package.json': JSON.stringify({ name: 'mobile', version: '1.0.0' }),
    })
    try {
      const ws = detectWorkspace(dir)
      expect(ws.isMonorepo).toBe(true)
      expect(ws.manager).toBe('pnpm')
      expect(ws.patterns).toEqual(['apps/*', 'packages/*'])
      expect(ws.internalPackages['mobile']).toBe(join(dir, 'apps', 'mobile'))
    } finally {
      cleanup(dir)
    }
  })

  it('returns NO_WORKSPACE when no markers exist up the tree', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'standalone', version: '1.0.0' }),
      'src/App.tsx': 'export default function App() { return null }',
    })
    try {
      const ws = detectWorkspace(dir)
      expect(ws).toEqual(NO_WORKSPACE)
      expect(findWorkspaceRoot(dir)).toBeNull()
    } finally {
      cleanup(dir)
    }
  })

  it('does not treat a packageManager:yarn field without workspaces as a monorepo', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'single',
        version: '1.0.0',
        packageManager: 'yarn@4.0.0',
      }),
      'yarn.lock': '# yarn\n',
    })
    try {
      expect(detectWorkspace(dir).isMonorepo).toBe(false)
    } finally {
      cleanup(dir)
    }
  })

  it('expands ** recursively and * one level', () => {
    const dir = createTempProject({
      'apps/mobile/package.json': JSON.stringify({ name: 'mobile', version: '1.0.0' }),
      'apps/web/package.json': JSON.stringify({ name: 'web', version: '1.0.0' }),
      'apps/web/admin/package.json': JSON.stringify({ name: 'admin', version: '1.0.0' }),
      'libs/foo/package.json': JSON.stringify({ name: 'foo', version: '1.0.0' }),
      'not-a-package/readme.md': 'x',
    })
    try {
      const apps = expandWorkspaceGlob(dir, 'apps/*').sort()
      expect(apps).toEqual([join(dir, 'apps', 'mobile'), join(dir, 'apps', 'web')])
      const deep = expandWorkspaceGlob(dir, '**')
      expect(deep).toContain(join(dir, 'apps', 'mobile'))
      expect(deep).toContain(join(dir, 'apps', 'web'))
      expect(deep).toContain(join(dir, 'apps', 'web', 'admin'))
      expect(deep).toContain(join(dir, 'libs', 'foo'))
      // Only directories with package.json survive — `apps` itself and
      // non-package dirs are not workspace members.
      expect(deep).not.toContain(join(dir, 'apps'))
      expect(deep).not.toContain(join(dir, 'not-a-package'))
    } finally {
      cleanup(dir)
    }
  })

  it('resolveNodeModulesRoot points at the hoisted store in a workspace', () => {
    const dir = createTempProject({
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
      'package.json': JSON.stringify({ name: 'root', version: '1.0.0', private: true }),
      'node_modules/react-native/package.json': JSON.stringify({ name: 'react-native', version: '0.76.0' }),
      'packages/mobile/package.json': JSON.stringify({ name: 'mobile', version: '1.0.0' }),
    })
    try {
      expect(resolveNodeModulesRoot(join(dir, 'packages', 'mobile'))).toBe(join(dir, 'node_modules'))
    } finally {
      cleanup(dir)
    }
  })

  it('resolveNodeModulesRoot falls back to the local store for standalone projects', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'standalone', version: '1.0.0' }),
    })
    try {
      expect(resolveNodeModulesRoot(dir)).toBe(join(dir, 'node_modules'))
    } finally {
      cleanup(dir)
    }
  })
})
