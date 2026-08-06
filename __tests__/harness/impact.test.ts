import { join } from 'path'
import { analyzeCrossPackageImpact, renderImpactReport } from '../../src/harness/impact'
import { createTempProject, cleanup } from '../helpers/tmp'

function workspaceFixture(): string {
  return createTempProject({
    'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n  - "packages/*"\n',
    'package.json': JSON.stringify({ name: 'acme-root', version: '1.0.0', private: true }),
    'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
    'packages/ui/package.json': JSON.stringify({ name: '@acme/ui', version: '1.0.0' }),
    'packages/ui/src/Button.tsx': [
      "import React from 'react'",
      "import { View, Text, StyleSheet } from 'react-native'",
      'export function Button({ label }: { label: string }) {',
      '  return <View style={styles.root}><Text>{label}</Text></View>',
      '}',
      'const styles = StyleSheet.create({ root: { padding: 8 } })',
      '',
    ].join('\n'),
    'apps/mobile/package.json': JSON.stringify({
      name: '@acme/mobile',
      version: '1.0.0',
      dependencies: { '@acme/ui': '1.0.0', 'react-native': '0.76.0' },
    }),
    'apps/mobile/src/screens/HomeScreen.tsx': [
      "import React from 'react'",
      "import { View } from 'react-native'",
      "import { Button } from '@acme/ui'",
      'export default function HomeScreen() {',
      '  return <View><Button label="Go" /></View>',
      '}',
      '',
    ].join('\n'),
    'apps/mobile/src/navigation/AppNavigator.tsx': [
      "import React from 'react'",
      "import { createNativeStackNavigator } from '@react-navigation/native-stack'",
      "import HomeScreen from '../screens/HomeScreen'",
      'const Stack = createNativeStackNavigator()',
      'export default function AppNavigator() {',
      '  return (',
      '    <Stack.Navigator>',
      '      <Stack.Screen name="Home" component={HomeScreen} />',
      '    </Stack.Navigator>',
      '  )',
      '}',
      '',
    ].join('\n'),
    'apps/mobile/.maestro/home.yaml': [
      'appId: com.acme.mobile',
      '---',
      'name: Home flow',
      'tests:',
      '  - launchApp',
      '  - assertVisible: "Home"',
      '',
    ].join('\n'),
    'apps/admin/package.json': JSON.stringify({
      name: '@acme/admin',
      version: '1.0.0',
      dependencies: { '@acme/ui': '1.0.0' },
    }),
    'apps/admin/src/Dashboard.tsx': [
      "import React from 'react'",
      "import { View } from 'react-native'",
      "import { Button } from '@acme/ui'",
      'export default function Dashboard() {',
      '  return <View><Button label="Save" /></View>',
      '}',
      '',
    ].join('\n'),
    // Unrelated package that does not import @acme/ui — must not appear.
    'apps/api/package.json': JSON.stringify({ name: '@acme/api', version: '1.0.0' }),
    'apps/api/src/server.ts': 'export const port = 4000\n',
  })
}

describe('analyzeCrossPackageImpact', () => {
  it('finds consumers across packages when a shared package changes', () => {
    const dir = workspaceFixture()
    try {
      const impact = analyzeCrossPackageImpact(dir, ['packages/ui/src/Button.tsx'])

      expect(impact.isMonorepo).toBe(true)
      expect(impact.manager).toBe('pnpm')
      expect(impact.changedPackages).toEqual(['@acme/ui'])

      const paths = impact.affectedFiles.map(f => f.path)
      expect(paths).toContain('apps/mobile/src/screens/HomeScreen.tsx')
      expect(paths).toContain('apps/admin/src/Dashboard.tsx')
      // Unrelated package untouched.
      expect(paths.some(p => p.includes('apps/api'))).toBe(false)

      expect(impact.affectedPackages).toEqual(expect.arrayContaining(['@acme/mobile', '@acme/admin']))
      expect(impact.affectedPackages).not.toContain('@acme/api')

      // Screens: the two consumer files are default-export components.
      expect(impact.affectedScreens).toEqual(expect.arrayContaining(['HomeScreen', 'Dashboard']))

      // Navigator referencing the affected screen.
      expect(impact.affectedNavigators.some(n => n.includes('AppNavigator'))).toBe(true)

      // Re-render: both consumers render the changed Button binding.
      const rerenders = impact.reRenderScreens.map(r => r.screen)
      expect(rerenders).toEqual(expect.arrayContaining(['HomeScreen', 'Dashboard']))
      expect(impact.reRenderScreens.every(r => r.component === 'Button')).toBe(true)

      // E2E flow references the Home route (matches the route name token).
      expect(impact.e2eFlows.length).toBe(1)
      expect(impact.e2eFlows[0].path).toBe('apps/mobile/.maestro/home.yaml')
      expect(impact.e2eFlows[0].screen).toBe('Home')


      expect(impact.summary.files).toBe(2)
      expect(impact.summary.screens).toBe(2)
      expect(impact.summary.navigators).toBe(1)
      expect(impact.summary.e2eFlows).toBe(1)
    } finally {
      cleanup(dir)
    }
  })

  it('finds no consumers for an isolated change', () => {
    const dir = workspaceFixture()
    try {
      const impact = analyzeCrossPackageImpact(dir, ['apps/api/src/server.ts'])
      expect(impact.affectedFiles).toHaveLength(0)
      expect(impact.summary.files).toBe(0)
    } finally {
      cleanup(dir)
    }
  })

  it('flags same-package files that directly import the changed file', () => {
    const dir = createTempProject({
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
      'package.json': JSON.stringify({ name: 'root', version: '1.0.0', private: true }),
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
      'packages/ui/package.json': JSON.stringify({ name: '@acme/ui', version: '1.0.0' }),
      'packages/ui/src/Button.tsx': 'export const Button = () => null\n',
      'packages/ui/src/ButtonGroup.tsx': "import { Button } from './Button'\nexport const ButtonGroup = () => <Button />\n",
    })
    try {
      const impact = analyzeCrossPackageImpact(dir, ['packages/ui/src/Button.tsx'])
      expect(impact.affectedFiles.map(f => f.path)).toContain('packages/ui/src/ButtonGroup.tsx')
      expect(impact.affectedPackages).toEqual(['@acme/ui'])
    } finally {
      cleanup(dir)
    }
  })

  it('detects Expo routes inside workspace member apps and ignores unrelated navigator routes in E2E matching', () => {
    const dir = createTempProject({
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n  - "apps/*"\n',
      'package.json': JSON.stringify({ name: 'root', version: '1.0.0', private: true }),
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
      'packages/ui/package.json': JSON.stringify({ name: '@acme/ui', version: '1.0.0' }),
      'packages/ui/src/Button.tsx': 'export const Button = () => null\n',
      'apps/mobile/package.json': JSON.stringify({ name: '@acme/mobile', version: '1.0.0', dependencies: { '@acme/ui': '1.0.0' } }),
      // Expo Router member app — app dir sits inside the member package.
      'apps/mobile/app/index.tsx': [
        "import React from 'react'",
        "import { View } from 'react-native'",
        "import { Button } from '@acme/ui'",
        'export default function HomeScreen() {',
        '  return <View><Button label="Go" /></View>',
        '}',
        '',
      ].join('\n'),
      'apps/mobile/.maestro/home.yaml': 'appId: com.acme.mobile\n---\ntests:\n  - launchApp\n  - assertVisible: "HomeScreen"\n',
      // Unrelated package with its own navigator + flow referencing a route
      // that is NOT affected — must not be flagged.
      'apps/api/package.json': JSON.stringify({ name: '@acme/api', version: '1.0.0' }),
      'apps/api/src/navigation/ApiNavigator.tsx': [
        "import React from 'react'",
        "import { createNativeStackNavigator } from '@react-navigation/native-stack'",
        'const Stack = createNativeStackNavigator()',
        'export default function ApiNavigator() {',
        '  return <Stack.Navigator><Stack.Screen name="Settings" component={SettingsScreen} /></Stack.Navigator>',
        '}',
        '',
      ].join('\n'),
      'apps/api/src/navigation/SettingsScreen.tsx': 'export default function SettingsScreen() { return null }\n',
      'apps/api/.maestro/settings.yaml': 'appId: com.acme.api\n---\ntests:\n  - assertVisible: "Settings"\n',
    })
    try {
      const impact = analyzeCrossPackageImpact(dir, ['packages/ui/src/Button.tsx'])
      // Route file inside the member app detected as a screen.
      expect(impact.affectedScreens).toContain('HomeScreen')
      // Only the affected app's flow is flagged; the unrelated Settings flow is not.
      expect(impact.e2eFlows.map(f => f.path)).toEqual(['apps/mobile/.maestro/home.yaml'])
    } finally {
      cleanup(dir)
    }
  })

  it('handles standalone (non-workspace) projects', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
      'src/HomeScreen.tsx': [
        "import React from 'react'",
        "import { View } from 'react-native'",
        "import { Button } from './Button'",
        'export default function HomeScreen() {',
        '  return <View><Button label="Go" /></View>',
        '}',
        '',
      ].join('\n'),
      'src/Button.tsx': "import React from 'react'\nexport const Button = () => null\n",
    })
    try {
      const impact = analyzeCrossPackageImpact(dir, ['src/Button.tsx'])
      expect(impact.isMonorepo).toBe(false)
      expect(impact.affectedFiles.map(f => f.path)).toContain('src/HomeScreen.tsx')
      expect(impact.reRenderScreens.some(r => r.screen === 'HomeScreen')).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('resolves changed files given as absolute paths', () => {
    const dir = workspaceFixture()
    try {
      const abs = join(dir, 'packages', 'ui', 'src', 'Button.tsx')
      const impact = analyzeCrossPackageImpact(dir, [abs])
      expect(impact.changedFiles).toEqual(['packages/ui/src/Button.tsx'])
      expect(impact.summary.files).toBe(2)
    } finally {
      cleanup(dir)
    }
  })
})

describe('renderImpactReport', () => {
  it('renders a markdown PR comment with all sections', () => {
    const dir = workspaceFixture()
    try {
      const impact = analyzeCrossPackageImpact(dir, ['packages/ui/src/Button.tsx'])
      const report = renderImpactReport(impact)

      expect(report).toContain('## 🌐 Cross-package impact analysis')
      expect(report).toContain('Workspace: pnpm')
      expect(report).toContain('**Changed packages:** `@acme/ui`')
      expect(report).toContain('### Affected files')
      expect(report).toContain('apps/mobile/src/screens/HomeScreen.tsx')
      expect(report).toContain('### Screens & routes touched')
      expect(report).toContain('### Navigation stacks')
      expect(report).toContain('### Re-render impact')
      expect(report).toContain('renders `Button`')
      expect(report).toContain('### E2E flows to run')
      expect(report).toContain('apps/mobile/.maestro/home.yaml')
      expect(report).toContain('_Generated deterministically from AST analysis — no model calls._')
    } finally {
      cleanup(dir)
    }
  })

  it('reports isolation for changes with no consumers', () => {
    const dir = workspaceFixture()
    try {
      const impact = analyzeCrossPackageImpact(dir, ['apps/api/src/server.ts'])
      expect(renderImpactReport(impact)).toContain('No cross-package consumers found')
    } finally {
      cleanup(dir)
    }
  })

  it('asks for changed files when none were provided', () => {
    const dir = workspaceFixture()
    try {
      const impact = analyzeCrossPackageImpact(dir, [])
      expect(renderImpactReport(impact)).toContain('No changed files were provided')
    } finally {
      cleanup(dir)
    }
  })
})
