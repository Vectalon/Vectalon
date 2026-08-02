import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { reportPathChange } from './fileDiff'

function displayPath(filePath: string): string {
  const rel = relative(process.cwd(), filePath)
  return rel.startsWith('..') ? filePath : rel
}

export interface UnusedImportResult {
  file: string
  removed: string[]
  changed: boolean
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

export function findSourceFiles(dir: string, files: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return files
  }

  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.') || entry === 'dist' || entry === 'build') {
      continue
    }
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      findSourceFiles(fullPath, files)
    } else if (stat.isFile() && SOURCE_EXTENSIONS.has(getExtension(entry))) {
      files.push(fullPath)
    }
  }

  return files
}

function getExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index === -1 ? '' : fileName.slice(index)
}

export function removeUnusedImportsFromFile(filePath: string): UnusedImportResult {
  const source = readFileSync(filePath, 'utf-8')
  const result = removeUnusedImports(source)

  if (result.source === source) {
    return { file: filePath, removed: [], changed: false }
  }

  writeFileSync(filePath, result.source, 'utf-8')
  reportPathChange(displayPath(filePath), source, result.source)
  return { file: filePath, removed: result.removed, changed: true }
}

export function removeUnusedImports(source: string): { source: string; removed: string[] } {
  const importRegex = /^\s*import\s+(?:(?:(?:type\s+)?\{[^}]+\})|(?:\*\s+as\s+\w+)|(?:\w+))\s+from\s+['"][^'"]+['"];?\s*$|^\s*import\s+['"][^'"]+['"];?\s*$/gm

  const matches = Array.from(source.matchAll(importRegex))
  if (matches.length === 0) {
    return { source, removed: [] }
  }

  let changedSource = source
  const removed: string[] = []

  for (const match of matches) {
    const importLine = match[0]
    const cleanedImport = importLine.trim()

    if (isSideEffectImport(cleanedImport)) {
      continue
    }

    const transformedImport = transformOrRemoveImport(cleanedImport, source)
    if (transformedImport === null) {
      changedSource = changedSource.replace(importLine, '')
      removed.push(cleanedImport)
    } else if (transformedImport !== cleanedImport) {
      changedSource = changedSource.replace(importLine, importLine.replace(cleanedImport, transformedImport))
      removed.push(`${cleanedImport} -> ${transformedImport}`)
    }
  }

  return { source: changedSource, removed }
}

function isSideEffectImport(importLine: string): boolean {
  return /^import\s+['"]/.test(importLine)
}

function transformOrRemoveImport(importLine: string, fullSource: string): string | null {
  const body = fullSource.replace(importLine, '')

  // Named imports: import { foo, bar } from 'baz'
  const namedMatch = importLine.match(/^import\s+(?:type\s+)?\{\s*([^}]+?)\s*\}\s+from\s+['"]([^'"]+)['"];?$/)
  if (namedMatch) {
    const specifiers = namedMatch[1].split(',').map(s => s.trim()).filter(Boolean)
    const kept: string[] = []
    for (const spec of specifiers) {
      const name = extractSpecifierName(spec)
      if (name && isIdentifierUsed(name, body, importLine)) {
        kept.push(spec)
      }
    }
    if (kept.length === 0) {
      return null
    }
    const typePrefix = importLine.includes('type {') ? 'type ' : ''
    return `import ${typePrefix}{ ${kept.join(', ')} } from '${namedMatch[2]}';`
  }

  // Default import: import foo from 'baz'
  const defaultMatch = importLine.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?$/)
  if (defaultMatch) {
    const name = defaultMatch[1]
    if (isIdentifierUsed(name, body, importLine)) {
      return importLine
    }
    return null
  }

  // Namespace import: import * as foo from 'baz'
  const namespaceMatch = importLine.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?$/)
  if (namespaceMatch) {
    const name = namespaceMatch[1]
    if (isIdentifierUsed(name, body, importLine)) {
      return importLine
    }
    return null
  }

  return importLine
}

function extractSpecifierName(spec: string): string | null {
  // Handles: foo, foo as bar
  const match = spec.match(/^\s*(\w+)\s*(?:as\s+\w+)?\s*$/)
  return match ? match[1] : null
}

function isIdentifierUsed(name: string, body: string, _importLine: string): boolean {
  if (name === 'React') {
    // Keep React imports in JSX files when JSX is used and they may be required for classic transform
    const hasJsx = /<[A-Z]\w*/.test(body) || /<\w+/.test(body)
    if (hasJsx) {
      return true
    }
  }

  const regex = new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`)
  return regex.test(body)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function removeUnusedImportsFromProject(srcDir: string): UnusedImportResult[] {
  const files = findSourceFiles(srcDir)
  const results: UnusedImportResult[] = []
  for (const file of files) {
    results.push(removeUnusedImportsFromFile(file))
  }
  return results
}
