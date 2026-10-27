import { mkdirSync, readFileSync, writeFileSync, existsSync, lstatSync, realpathSync } from 'fs'
import { join, dirname, relative, sep } from 'path'
import { reportPathChange } from '../../utils/fileDiff'
import { reportError } from '../../utils/safe'

export const VECTALON_PACKAGE_NAME = '@vectalon-dev/rn'
export const GENERATED_OUTPUT_DIR = '.vectalon/generated'

const FILE_PATH_RE = /^(?:[A-Za-z0-9_@./-]+\.(?:tsx?|jsx?|ts|js|json|css|scss|swift|kt|java|gradle|kts|plist|podspec|yaml|yml|md|sh|bash|mm|m|h|pbxproj|xml|properties|xcconfig)$|(?:[A-Za-z0-9_@./-]*\/)?Podfile(?:\.lock)?$)/

export function isSafeProjectPath(filePath: string): boolean {
  if (!FILE_PATH_RE.test(filePath)) return false
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.startsWith('/')) return false
  if (normalized.split('/').some(part => !part || part === '.' || part === '..')) return false
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
  const reportedPath = join(getGeneratedOutputRoot(projectRoot), filePath)
  let fullPath: string
  let oldContent: string | null
  try {
    const root = realpathSync(projectRoot)
    const outputRoot = isSelfPackageRepo(projectRoot) ? join(root, GENERATED_OUTPUT_DIR) : root
    fullPath = join(outputRoot, filePath)
    let current = root
    const parts = relative(root, fullPath).split(sep)
    if (!parts.length || parts.some(part => !part || part === '.' || part === '..')) return null
    for (const [index, part] of parts.entries()) {
      current = join(current, part)
      let stat
      try { stat = lstatSync(current) }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; return null }
      if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) return null
    }
    oldContent = existsSync(fullPath) ? readFileSync(fullPath, 'utf-8') : null
    // shortcut: checked local hierarchy can still race a concurrent writer; use an OS-isolated workspace for hostile shared volumes.
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
  } catch { return null }
  // Skip reporting byte-identical rewrites so idempotent regenerations don't
  // produce `+0 -0` no-op diff noise.
  if (oldContent !== content) {
    reportPathChange(filePath, oldContent, content)
  }
  return reportedPath
}
