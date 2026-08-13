import { existsSync } from 'fs'
import { join } from 'path'
import { releaseCommand } from '../../src/cli/commands/release'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

function releaseProject(): string {
  return createTempProject({
    'package.json': JSON.stringify({
      name: 'app',
      version: '1.2.3',
      dependencies: { 'react-native': '0.76.0' },
      scripts: { test: 'jest' },
    }),
    '.vectalon/snapshot.json': '{}',
  })
}

describe('releaseCommand', () => {
  let configDir: string

  beforeEach(() => {
    configDir = useTempConfig()
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(configDir)
  })

  it('prints a release plan to stdout with the detected bump', async () => {
    const dir = releaseProject()
    try {
      jest.spyOn(process, 'cwd').mockReturnValue(dir)
      const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
      await releaseCommand(dir, {})
      const written = out.mock.calls.map(c => String(c[0])).join('')
      expect(written).toContain('## 🚀 Release plan')
      expect(written).toContain('1.2.3 →')
    } finally {
      cleanup(dir)
    }
  })

  it('--changelog prints only the changelog', async () => {
    const dir = releaseProject()
    try {
      const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
      await releaseCommand(dir, { changelog: true })
      const written = out.mock.calls.map(c => String(c[0])).join('')
      expect(written).toContain('# Release Notes — v')
      expect(written).not.toContain('## 🚀 Release plan')
    } finally {
      cleanup(dir)
    }
  })

  it('--submit writes the release workflow', async () => {
    const dir = releaseProject()
    try {
      const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
      await releaseCommand(dir, { submit: true })
      expect(existsSync(join(dir, '.github', 'workflows', 'vectalon-release.yml'))).toBe(true)
      expect(out.mock.calls.map(c => String(c[0])).join('')).toContain('## 🚀 Release plan')
    } finally {
      cleanup(dir)
    }
  })

  it('--monitor reports healthy when no telemetry crashes exist', async () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.2.3', dependencies: { 'react-native': '0.76.0' } }),
      '.vectalon/snapshot.json': '{}',
      '.vectalon/telemetry/empty.json': '[]\n',
    })
    try {
      const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
      await releaseCommand(dir, { monitor: true })
      const written = out.mock.calls.map(c => String(c[0])).join('')
      expect(written).toContain('## 📡 Release monitor')
      expect(written).toContain('No crashes in the monitoring window')
    } finally {
      cleanup(dir)
    }
  })

  it('--monitor without telemetry fails loudly (exit 1) instead of passing silently', async () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.2.3', dependencies: { 'react-native': '0.76.0' } }),
      '.vectalon/snapshot.json': '{}',
    })
    try {
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((() => { throw new Error('exit called') }) as unknown as (code?: string | number | null) => never)
      const errChunks: string[] = []
      jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
        errChunks.push(String(chunk))
        return true
      })
      const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
      await expect(releaseCommand(dir, { monitor: true })).rejects.toThrow('exit called')
      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(errChunks.join('')).toContain('Monitoring skipped')
      // No plan dump when the requested stage failed — the error leads.
      expect(out.mock.calls.map(c => String(c[0])).join('')).not.toContain('## 🚀 Release plan')
    } finally {
      cleanup(dir)
    }
  })

  it('exits with code 1 when the project is not initialized', async () => {
    const dir = createTempProject({ 'package.json': '{}' })
    try {
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((() => { throw new Error('exit called') }) as unknown as (code?: string | number | null) => never)
      await expect(releaseCommand(dir, {})).rejects.toThrow('exit called')
      expect(exitSpy).toHaveBeenCalledWith(1)
    } finally {
      cleanup(dir)
    }
  })
})
