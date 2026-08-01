import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { removeUnusedImportsFromProject, removeUnusedImportsFromFile } from '../../src/utils/unusedImports'

describe('unusedImports', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-imports-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('removes an unused named import from a TypeScript file', () => {
    const file = join(tmpDir, 'Example.ts')
    const original = [
      "import { View, Text } from 'react-native';",
      "import { unusedHelper } from './helpers';",
      '',
      'export function Example() {',
      '  return <View><Text>Hi</Text></View>;',
      '}',
    ].join('\n')

    writeFileSync(file, original)
    const result = removeUnusedImportsFromFile(file)
    const updated = readFileSync(file, 'utf-8')

    expect(result.changed).toBe(true)
    expect(result.removed.length).toBe(1)
    expect(updated).toContain("import { View, Text } from 'react-native';")
    expect(updated).not.toContain("import { unusedHelper } from './helpers';")
  })

  it('keeps imports that are used', () => {
    const file = join(tmpDir, 'Used.ts')
    const original = [
      "import { usedHelper } from './helpers';",
      '',
      'export function Example() {',
      '  return usedHelper();',
      '}',
    ].join('\n')

    writeFileSync(file, original)
    const result = removeUnusedImportsFromFile(file)
    const updated = readFileSync(file, 'utf-8')

    expect(result.changed).toBe(false)
    expect(updated).toContain("import { usedHelper } from './helpers';")
  })

  it('removes unused default imports', () => {
    const file = join(tmpDir, 'Default.ts')
    const original = [
      "import React from 'react';",
      "import logo from './logo';",
      '',
      'export function Example() {',
      '  return <div />;',
      '}',
    ].join('\n')

    writeFileSync(file, original)
    const result = removeUnusedImportsFromFile(file)
    const updated = readFileSync(file, 'utf-8')

    expect(result.changed).toBe(true)
    expect(updated).not.toContain("import logo from './logo';")
  })

  it('keeps side-effect imports', () => {
    const file = join(tmpDir, 'SideEffect.ts')
    const original = [
      "import './polyfills';",
      '',
      'export function Example() { return null; }',
    ].join('\n')

    writeFileSync(file, original)
    const result = removeUnusedImportsFromFile(file)
    const updated = readFileSync(file, 'utf-8')

    expect(result.changed).toBe(false)
    expect(updated).toContain("import './polyfills';")
  })

  it('scans a project directory and only reports changed files', () => {
    const srcDir = join(tmpDir, 'src')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(join(srcDir, 'Dirty.ts'), "import { unused } from './x';\nexport const a = 1;\n")
    writeFileSync(join(srcDir, 'Clean.ts'), "import { used } from './x';\nexport const b = used;\n")

    const results = removeUnusedImportsFromProject(srcDir)
    const changed = results.filter(r => r.changed)

    expect(changed).toHaveLength(1)
    expect(changed[0].file).toContain('Dirty.ts')
  })
})
