/**
 * `vectalon suggestions` — the actionable surface for knowledge-refresh
 * improvement suggestions: severity-grouped list, --json for agents, --apply
 * (gated behind --yes / TTY confirm), and --open dashboard.
 *
 * The knowledge service is mocked (its real network fetch is covered by the
 * KnowledgeRefreshService tests); the install runner is injected via the
 * command's `run` option so no real npm process ever spawns.
 */
import { mkdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { suggestionsCommand } from '../../src/cli/commands/suggestions'
import { createTempProject, cleanup } from '../helpers/tmp'
import type { CommandResult } from '../../src/adapters/runCommand'
import { openInBrowser } from '../../src/utils/openBrowser'
import { KnowledgeRefreshService } from '../../src/knowledge/refresh'

jest.mock('../../src/knowledge/refresh', () => {
  const mockGetSuggestions = jest.fn(() => [])
  const mockGetLastRefreshAt = jest.fn(() => 0)
  class FakeKnowledgeRefreshService {
    constructor() {}
    getSuggestions(): unknown {
      return mockGetSuggestions()
    }
    getLastRefreshAt(): unknown {
      return mockGetLastRefreshAt()
    }
    static get mocks(): { getSuggestions: jest.Mock; getLastRefreshAt: jest.Mock } {
      return { getSuggestions: mockGetSuggestions, getLastRefreshAt: mockGetLastRefreshAt }
    }
  }
  return { KnowledgeRefreshService: FakeKnowledgeRefreshService }
})

jest.mock('../../src/utils/openBrowser', () => ({
  openInBrowser: jest.fn(),
}))

const FIXTURES = [
  {
    id: 'dep-react-native-0.85.0-1',
    sourceId: 'registry-react-native',
    severity: 'error',
    library: 'react-native',
    currentVersion: '0.76.0',
    latestVersion: '0.85.0',
    title: 'react-native is 9 version(s) behind latest',
    description: 'Current: 0.76.0. Latest: 0.85.0. Consider upgrading.',
    createdAt: 1700000000000,
  },
  {
    id: 'dep-lodash-5.0.0-2',
    sourceId: 'registry-lodash',
    severity: 'warning',
    library: 'lodash',
    currentVersion: '4.17.21',
    latestVersion: '5.0.0',
    title: 'lodash is 1 version(s) behind latest',
    description: 'Current: 4.17.21. Latest: 5.0.0. Consider upgrading.',
    createdAt: 1700000000000,
  },
]

// Same ANSI-strip used across the suite (see ecosystemOutput.test.ts).
const ESC = String.fromCharCode(27)
const ANSI_RE = new RegExp(`${ESC}\\\\[[0-9;]*m`, 'g')

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

/** Capture stderr while an async command runs — awaits it so post-await writes are captured. */
async function captureStderr(fn: () => Promise<unknown>): Promise<string> {
  const chunks: string[] = []
  const spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(String(chunk))
    return true
  })
  try {
    await fn()
  } finally {
    spy.mockRestore()
  }
  return stripAnsi(chunks.join(''))
}

/** Capture stdout while an async command runs. */
async function captureStdout(fn: () => Promise<unknown>): Promise<string> {
  const chunks: string[] = []
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(String(chunk))
    return true
  })
  try {
    await fn()
  } finally {
    spy.mockRestore()
  }
  return chunks.join('')
}

function exitMock(): jest.SpyInstance {
  return jest.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('exit')
  }) as never)
}

describe('suggestionsCommand', () => {
  let dir: string

  const getSuggestionsMock = (KnowledgeRefreshService as unknown as { mocks: { getSuggestions: jest.Mock; getLastRefreshAt: jest.Mock } }).mocks.getSuggestions
  const getLastRefreshAtMock = (KnowledgeRefreshService as unknown as { mocks: { getSuggestions: jest.Mock; getLastRefreshAt: jest.Mock } }).mocks.getLastRefreshAt
  const openBrowserMock = openInBrowser as jest.Mock

  beforeEach(() => {
    dir = createTempProject({ 'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }) })
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    getSuggestionsMock.mockReturnValue(FIXTURES)
    getLastRefreshAtMock.mockReturnValue(1700000000000)
    openBrowserMock.mockClear()
  })

  afterEach(() => {
    cleanup(dir)
    jest.restoreAllMocks()
  })

  it('exits 1 when the project is not initialized', async () => {
    const uninitialized = createTempProject({})
    const exit = exitMock()
    try {
      await expect(suggestionsCommand(uninitialized, {})).rejects.toThrow('exit')
      expect(exit).toHaveBeenCalledWith(1)
    } finally {
      cleanup(uninitialized)
    }
  })

  it('lists suggestions grouped by severity with versions and the apply command', async () => {
    const out = await captureStderr(() => suggestionsCommand(dir, {}))
    expect(out).toContain('ERROR')
    expect(out).toContain('WARNING')
    expect(out).toContain('react-native is 9 version(s) behind latest')
    expect(out).toContain('0.76.0 → 0.85.0')
    expect(out).toContain('vectalon suggestions --apply react-native --yes')
    expect(out).toContain('vectalon refresh --force')
  })

  it('--json prints the full store to stdout', async () => {
    const out = await captureStdout(() => suggestionsCommand(dir, { json: true }))
    const parsed = JSON.parse(out)
    expect(parsed.suggestions).toHaveLength(2)
    expect(parsed.suggestions[0].library).toBe('react-native')
    expect(parsed.lastRefreshAt).toBe(1700000000000)
  })

  it('--limit caps the listing', async () => {
    const out = await captureStderr(() => suggestionsCommand(dir, { limit: 1 }))
    expect(out).toContain('1 improvement suggestion(s)')
    expect(out).toContain('react-native')
    expect(out).not.toContain('lodash')
  })

  it('reports an empty store with a refresh hint', async () => {
    getSuggestionsMock.mockReturnValue([])
    const out = await captureStderr(() => suggestionsCommand(dir, {}))
    expect(out).toContain('No improvement suggestions on file')
    expect(out).toContain('vectalon refresh')
  })

  it('--apply --yes runs the exact npm install and reports success', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const run = async (command: string, args: string[]): Promise<CommandResult> => {
      calls.push({ command, args })
      return { success: true, stdout: '', stderr: '', exitCode: 0 }
    }
    const out = await captureStderr(() => suggestionsCommand(dir, { apply: 'react-native', yes: true, run }))
    expect(calls).toEqual([
      { command: 'npm', args: ['install', 'react-native@^0.85.0'] },
    ])
    expect(out).toContain('Installed react-native@^0.85.0')
  })

  it('matches --apply by full id and by dep-<library>- prefix', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const run = async (command: string, args: string[]): Promise<CommandResult> => {
      calls.push({ command, args })
      return { success: true, stdout: '', stderr: '', exitCode: 0 }
    }
    await suggestionsCommand(dir, { apply: 'dep-react-native-', yes: true, run })
    expect(calls[0].args).toEqual(['install', 'react-native@^0.85.0'])
  })

  it('without --yes in a non-TTY, --apply prints the command but does not run it', async () => {
    const run = jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 }))
    const out = await captureStderr(() => suggestionsCommand(dir, { apply: 'react-native', run }))
    expect(run).not.toHaveBeenCalled()
    expect(out).toContain('npm install react-native@^0.85.0')
    expect(out).toContain('Not executed')
  })

  it('exits 1 for an unknown --apply id', async () => {
    const exit = exitMock()
    await expect(suggestionsCommand(dir, { apply: 'nope', yes: true })).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('reports a failed install with the first error line and exits 1', async () => {
    const run = async (): Promise<CommandResult> => ({
      success: false,
      stdout: '',
      stderr: 'npm error code EACCES\nnpm error permission denied',
      exitCode: 1,
    })
    const exit = exitMock()
    const chunks: string[] = []
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      chunks.push(String(chunk))
      return true
    })
    await expect(suggestionsCommand(dir, { apply: 'react-native', yes: true, run })).rejects.toThrow('exit')
    spy.mockRestore()
    expect(exit).toHaveBeenCalledWith(1)
    expect(stripAnsi(chunks.join(''))).toContain('EACCES')
  })

  it('--open writes the HTML dashboard and opens it in the browser', async () => {
    await suggestionsCommand(dir, { open: true })
    const htmlPath = join(dir, '.vectalon', 'suggestions', 'report.html')
    expect(existsSync(htmlPath)).toBe(true)
    const html = readFileSync(htmlPath, 'utf-8')
    expect(html).toContain('vectalon suggestions')
    expect(html).toContain('react-native')
    expect(openInBrowser).toHaveBeenCalledWith(htmlPath)
  })
})
