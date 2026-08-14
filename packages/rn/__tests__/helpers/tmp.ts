import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'

export function createTempProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'vectalon-test-'))
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(dir, relPath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content)
  }
  return dir
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

/** Write (or overwrite) a file inside an existing temp project. */
export function writeProjectFile(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content)
}

export function useTempConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vectalon-config-'))
  process.env.RN_VECTALON_CONFIG_DIR = dir
  return dir
}
