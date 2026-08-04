import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { initCommand } from '../../src/cli/commands/init'
import { serveCommand } from '../../src/cli/commands/serve'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

describe('initCommand', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
    dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0' },
      }),
      '.gitignore': 'node_modules\n',
    })
    configDir = useTempConfig()
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  it('scans the project and writes snapshot, context, and manifest files', async () => {
    await initCommand(dir, {})

    expect(existsSync(join(dir, '.vectalon', 'snapshot.json'))).toBe(true)
    expect(existsSync(join(dir, '.vectalon', 'context.md'))).toBe(true)

    const manifest = JSON.parse(readFileSync(join(dir, '.vectalon', 'rn-vectalon.json'), 'utf-8'))
    expect(manifest.projectName).toBe('app')
    expect(manifest.rnVersion).toBe('0.72.0')
  })

  it('adds .vectalon/ to the project .gitignore so the runtime workspace stays untracked', async () => {
    await initCommand(dir, {})
    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('.vectalon/')
    // existing entries are preserved
    expect(gitignore).toContain('node_modules')
  })

  it('creates a .gitignore when the project has none and does not duplicate entries', async () => {
    const noIgnoreDir = createTempProject({
      'package.json': JSON.stringify({ name: 'bare', version: '1.0.0', dependencies: {} }),
    })
    await initCommand(noIgnoreDir, {})
    const gitignore = readFileSync(join(noIgnoreDir, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('.vectalon/')
    // idempotent: a second init does not append a duplicate
    await initCommand(noIgnoreDir, {})
    const again = readFileSync(join(noIgnoreDir, '.gitignore'), 'utf-8')
    const matches = again.split('\n').filter(l => l.trim() === '.vectalon/').length
    expect(matches).toBe(1)
    cleanup(noIgnoreDir)
  })

  it('warns when the target project does not have react-native in dependencies', async () => {
    const dirNoRN = createTempProject({
      'package.json': JSON.stringify({ name: 'plain-node', version: '1.0.0', dependencies: {} }),
      '.gitignore': 'node_modules\n',
    })
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await initCommand(dirNoRN, {})

    expect(write).toHaveBeenCalledWith(expect.stringContaining('no react-native dependency detected'))
    cleanup(dirNoRN)
  })

  it('detects a bare RN-CLI project and auto-enables RN-CLI ecosystem items', async () => {
    const rnCliDir = createTempProject({
      'package.json': JSON.stringify({
        name: 'bare-app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.76.0' },
      }),
    })

    await initCommand(rnCliDir, {})

    const manifest = JSON.parse(readFileSync(join(rnCliDir, '.vectalon', 'rn-vectalon.json'), 'utf-8'))
    expect(manifest.tooling).toBe('rn-cli')
    expect(manifest.expoSdkVersion).toBe('')

    const ecosystem = JSON.parse(readFileSync(join(rnCliDir, '.vectalon', 'ecosystem.json'), 'utf-8'))
    expect(ecosystem.enabled).toEqual(expect.arrayContaining(['react-native-upgrader-mcp', 'rn-diff-purge', 'metro-mcp']))
    expect(ecosystem.enabled).not.toEqual(expect.arrayContaining(['expo-mcp', 'expo-skills', 'expo-doctor']))
    cleanup(rnCliDir)
  })

  it('detects an Expo project and auto-enables Expo ecosystem items', async () => {
    const expoDir = createTempProject({
      'package.json': JSON.stringify({
        name: 'expo-app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.76.0', expo: '~52.0.0' },
      }),
    })

    await initCommand(expoDir, {})

    const manifest = JSON.parse(readFileSync(join(expoDir, '.vectalon', 'rn-vectalon.json'), 'utf-8'))
    expect(manifest.tooling).toBe('expo')
    expect(manifest.expoSdkVersion).toBe('~52.0.0')

    const ecosystem = JSON.parse(readFileSync(join(expoDir, '.vectalon', 'ecosystem.json'), 'utf-8'))
    expect(ecosystem.enabled).toEqual(expect.arrayContaining(['expo-mcp', 'expo-skills', 'expo-doctor', 'metro-mcp']))
    expect(ecosystem.enabled).not.toEqual(expect.arrayContaining(['react-native-upgrader-mcp', 'rn-diff-purge']))
    cleanup(expoDir)
  })

  it('auto-enables ecosystem items that match installed package.json dependencies', async () => {
    const depDir = createTempProject({
      'package.json': JSON.stringify({
        name: 'dep-app',
        version: '1.0.0',
        dependencies: {
          'react-native': '0.76.0',
          zustand: '5.0.0',
          'react-native-gesture-handler': '2.20.0',
          'react-native-reanimated': '3.16.0',
          '@shopify/flash-list': '1.7.0',
        },
        devDependencies: {
          husky: '9.1.0',
          'lint-staged': '15.2.0',
        },
      }),
    })

    await initCommand(depDir, {})

    const ecosystem = JSON.parse(readFileSync(join(depDir, '.vectalon', 'ecosystem.json'), 'utf-8'))
    expect(ecosystem.enabled).toEqual(expect.arrayContaining(['zustand', 'gesture-handler', 'reanimated', 'flashlist', 'husky', 'lint-staged']))
    // A bare RN-CLI project never gets Expo-only items — even when the catalog
    // contains them, flavor + dependency matching keep them out.
    expect(ecosystem.enabled).not.toEqual(expect.arrayContaining(['expo-router', 'expo-ui', 'eas-cli', 'expo-mcp', 'expo-skills', 'expo-doctor']))
    cleanup(depDir)
  })

  it('defaults the model provider to local and records it in the manifest', async () => {
    await initCommand(dir, {})
    const manifest = JSON.parse(readFileSync(join(dir, '.vectalon', 'rn-vectalon.json'), 'utf-8'))
    expect(manifest.modelProvider).toBe('local')
    expect(manifest.modelConfig).toBeUndefined()
  })

  it('writes the remote model provider and env-key config when --model is passed', async () => {
    await initCommand(dir, { model: 'openai' })
    const manifest = JSON.parse(readFileSync(join(dir, '.vectalon', 'rn-vectalon.json'), 'utf-8'))
    expect(manifest.modelProvider).toBe('openai')
    expect(manifest.modelConfig).toEqual({ modelName: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' })
  })

  it('writes the anthropic provider config when --model anthropic is passed', async () => {
    await initCommand(dir, { model: 'anthropic' })
    const manifest = JSON.parse(readFileSync(join(dir, '.vectalon', 'rn-vectalon.json'), 'utf-8'))
    expect(manifest.modelProvider).toBe('anthropic')
    expect(manifest.modelConfig).toEqual({ modelName: 'claude-sonnet-4-20250514', apiKeyEnv: 'ANTHROPIC_API_KEY' })
  })

  it('exits with code 1 on an unknown --model provider', async () => {
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('exit called') }) as unknown as (code?: string | number | null) => never)

    await expect(initCommand(dir, { model: 'gemini' })).rejects.toThrow('exit called')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})

describe('serveCommand', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
    dir = createTempProject({ 'package.json': '{}' })
    configDir = useTempConfig()
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  it('exits with code 1 when the project has not been initialized', async () => {
    jest.spyOn(process, 'cwd').mockReturnValue(dir)
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('exit called') }) as unknown as (code?: string | number | null) => never)

    await expect(serveCommand({})).rejects.toThrow('exit called')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
