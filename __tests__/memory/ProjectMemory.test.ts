import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ProjectMemory } from '../../src/memory/ProjectMemory'
import type { Pattern } from '../../src/memory/PatternLearner'
import { createTempProject, cleanup } from '../helpers/tmp'

function pattern(): Pattern {
  return {
    id: 'naming-pascal',
    pattern: 'PascalCase components',
    description: 'Uses PascalCase naming',
    confidence: 0.8,
    occurrences: 1,
    firstSeen: 1,
    lastSeen: 1,
    category: 'naming',
  }
}

describe('ProjectMemory', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('creates the .vectalon directory and memory file on construction', () => {
    new ProjectMemory(dir)
    expect(existsSync(join(dir, '.vectalon', 'memory.json'))).toBe(true)
  })

  it('starts with an empty pattern store', () => {
    const memory = new ProjectMemory(dir)
    expect(memory.getActivePatterns()).toEqual([])
    expect(memory.getPatternsByCategory('naming')).toEqual([])
  })

  it('persists added patterns across instances', () => {
    const memory = new ProjectMemory(dir)
    memory.addPattern(pattern())

    const reloaded = new ProjectMemory(dir)
    expect(reloaded.getActivePatterns()).toContainEqual(expect.objectContaining({ id: 'naming-pascal' }))
  })

  it('increments occurrences for repeated patterns', () => {
    const memory = new ProjectMemory(dir)
    memory.addPattern(pattern())
    memory.addPattern(pattern())

    const reloaded = new ProjectMemory(dir)
    const stored = reloaded.getActivePatterns().find(p => p.id === 'naming-pascal')
    expect(stored?.occurrences).toBe(2)
  })

  it('records decisions to disk', () => {
    const memory = new ProjectMemory(dir)
    memory.recordDecision('scanned-project', 'init command', 'ok')
    const onDisk = readFileSync(join(dir, '.vectalon', 'memory.json'), 'utf-8')
    expect(onDisk).toContain('scanned-project')
  })

  it('recovers from a corrupted memory file', () => {
    new ProjectMemory(dir)
    writeFileSync(join(dir, '.vectalon', 'memory.json'), '{ not valid json')
    const memory = new ProjectMemory(dir)
    expect(memory.getActivePatterns()).toEqual([])
  })
})
