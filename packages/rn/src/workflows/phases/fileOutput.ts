import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { reportPathChange } from '../../utils/fileDiff'
import { reportError } from '../../utils/safe'

export const VECTALON_PACKAGE_NAME = '@vectalon-dev/rn'
export const GENERATED_OUTPUT_DIR = '.vectalon/generated'

const FILE_PATH_RE = /^[A-Za-z0-9_@./-]+\.(?:tsx?|jsx?|ts|js|json|css|scss|swift|kt|java|gradle|plist|podspec|yaml|yml|md|sh|bash|mm|m|h|pbxproj|xml|properties|xcconfig)$/

export function isSafeProjectPath(filePath: string): boolean {
  if (!FILE_PATH_RE.test(filePath)) return false
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.startsWith('/')) return false
  if (normalized.split('/').includes('..')) return false
  return true
}

export function isSelfPackageRepo(projectRoot: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8')) as { name?: string }
    return pkg.name === VECTALON_PACKAGE_NAME
  } catch (err) {
    reportError(err, 'fileOutput: reading package.json to detect self repo')
    return false
  }
}

// When the workflow runs inside the rn-vectalon package itself, generated code
// must never land in the package's own src/ bundle. Route it to the gitignored
// .vectalon/generated/ directory instead.
export function getGeneratedOutputRoot(projectRoot: string): string {
  return isSelfPackageRepo(projectRoot) ? join(projectRoot, GENERATED_OUTPUT_DIR) : projectRoot
}

export function writeProjectFile(projectRoot: string, filePath: string, content: string): string | null {
  if (!isSafeProjectPath(filePath)) return null
  const fullPath = join(getGeneratedOutputRoot(projectRoot), filePath)
  const oldContent = existsSync(fullPath) ? readFileSync(fullPath, 'utf-8') : null
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')
  // Skip reporting byte-identical rewrites so idempotent regenerations don't
  // produce `+0 -0` no-op diff noise.
  if (oldContent !== content) {
    reportPathChange(filePath, oldContent, content)
  }
  return fullPath
}
