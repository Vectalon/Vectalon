import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { isSafeProjectPath, writeProjectFile } from '../../src/workflows/phases/fileOutput'
import { writeFixedFile } from '../../src/workflows/phases/codeReviewPhase'

describe('generated project file boundary', () => {
  let temp: string
  let project: string
  let outside: string

  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), 'vectalon-file-output-'))
    project = join(temp, 'project')
    outside = join(temp, 'outside')
    mkdirSync(project)
    mkdirSync(outside)
  })

  afterEach(() => rmSync(temp, { recursive: true, force: true }))

  it('writes new and existing regular files below the project root', () => {
    expect(writeProjectFile(project, 'src/Feature.ts', 'export const first = true\n')).toBe(join(project, 'src/Feature.ts'))
    expect(writeProjectFile(project, 'src/Feature.ts', 'export const second = true\n')).toBe(join(project, 'src/Feature.ts'))
    expect(readFileSync(join(project, 'src/Feature.ts'), 'utf8')).toBe('export const second = true\n')
  })

  it('rejects ambiguous relative paths', () => {
    for (const file of ['../outside.ts', './src/Feature.ts', 'src//Feature.ts', 'src/../Feature.ts']) {
      expect(isSafeProjectPath(file)).toBe(false)
      expect(writeProjectFile(project, file, 'unsafe')).toBeNull()
    }
  })

  it('does not follow a directory symlink outside the project', () => {
    symlinkSync(outside, join(project, 'src'), 'dir')
    expect(writeProjectFile(project, 'src/Feature.ts', 'unsafe')).toBeNull()
    expect(existsSync(join(outside, 'Feature.ts'))).toBe(false)
  })

  it('does not overwrite a symlinked or hard-linked target', () => {
    mkdirSync(join(project, 'src'))
    const external = join(outside, 'Feature.ts')
    writeFileSync(external, 'keep me')
    symlinkSync(external, join(project, 'src/Linked.ts'))
    linkSync(external, join(project, 'src/HardLinked.ts'))
    expect(writeProjectFile(project, 'src/Linked.ts', 'unsafe')).toBeNull()
    expect(writeProjectFile(project, 'src/HardLinked.ts', 'unsafe')).toBeNull()
    expect(readFileSync(external, 'utf8')).toBe('keep me')
  })

  it('does not follow a redirected generated-output directory in the RN package', () => {
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: '@vectalon-dev/rn' }))
    symlinkSync(outside, join(project, '.vectalon'), 'dir')
    expect(writeProjectFile(project, 'src/Feature.ts', 'unsafe')).toBeNull()
    expect(existsSync(join(outside, 'generated/src/Feature.ts'))).toBe(false)
  })

  it('routes code-review fixes through the same boundary', () => {
    const external = join(outside, 'Feature.ts')
    writeFileSync(external, 'keep me')
    expect(writeFixedFile(project, external, 'unsafe')).toBeNull()
    expect(writeFixedFile(project, '../outside/Feature.ts', 'unsafe')).toBeNull()
    expect(readFileSync(external, 'utf8')).toBe('keep me')

    const target = join(project, 'src/Feature.ts')
    expect(writeFixedFile(project, target, 'safe')).toBe(target)
    expect(writeFixedFile(project, './src/Feature.ts', 'updated')).toBe(target)
    expect(readFileSync(target, 'utf8')).toBe('updated')
    symlinkSync(outside, join(project, 'linked'), 'dir')
    expect(writeFixedFile(project, 'linked/Feature.ts', 'unsafe')).toBeNull()
    expect(readFileSync(external, 'utf8')).toBe('keep me')
  })
})
