jest.mock('child_process', () => ({ execFileSync: jest.fn() }))
jest.mock('os', () => ({ freemem: jest.fn(() => 100), totalmem: jest.fn(() => 10000), platform: jest.fn(() => 'darwin') }))

import { execFileSync } from 'child_process'
import { platform } from 'os'
import { nativeMemoryBudget } from '../../src/model/local/memory'

afterEach(() => jest.clearAllMocks())

it.each([0, 5, 64, 100])('uses macOS pressure estimate rather than raw free pages (%s)', percent => {
  jest.mocked(execFileSync).mockReturnValue(`System-wide memory free percentage: ${percent}%\n`)
  expect(nativeMemoryBudget()).toEqual({ availableBytes: percent * 100, source: 'macos-pressure-estimate' })
  expect(execFileSync).toHaveBeenCalledWith('/usr/bin/memory_pressure', ['-Q'], expect.objectContaining({ timeout: 1000, maxBuffer: 16384 }))
})

it.each(['missing metric', 'System-wide memory free percentage: 101%', 'System-wide memory free percentage: -1%'])('falls back conservatively on invalid system output: %s', output => {
  jest.mocked(execFileSync).mockReturnValue(output)
  expect(nativeMemoryBudget()).toEqual({ availableBytes: 100, source: 'os-free' })
})

it('falls back when the query fails and skips it on other hosts', () => {
  jest.mocked(execFileSync).mockImplementation(() => { throw new Error('query unavailable') })
  expect(nativeMemoryBudget()).toEqual({ availableBytes: 100, source: 'os-free' })
  jest.mocked(platform).mockReturnValue('linux')
  jest.mocked(execFileSync).mockClear()
  expect(nativeMemoryBudget()).toEqual({ availableBytes: 100, source: 'os-free' })
  expect(execFileSync).not.toHaveBeenCalled()
})
