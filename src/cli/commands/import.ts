import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, basename, extname } from 'path'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { checksum } from '../../knowledge/artifactTypes'
import type { ArtifactType } from '../../knowledge/artifactTypes'
import { logger } from '../logger'

const KEYWORD_MAP: [ArtifactType, string[]][] = [
  ['business', ['business requirements', 'business case', 'vision document', 'product charter', 'project proposal']],
  ['research', ['market research', 'competitor analysis', 'swot', 'user interview', 'survey results']],
  ['product', ['product requirements', 'product roadmap', 'feature prioritization', 'okr']],
  ['requirements', ['user story', 'acceptance criteria', 'functional requirements', 'use case', 'srs']],
  ['design', ['wireframe', 'design system', 'ui specification', 'information architecture', 'accessibility']],
  ['architecture', ['high level design', 'low level design', 'architecture decision', 'sequence diagram', 'data flow']],
  ['engineering', ['technical design', 'api contract', 'migration plan', 'coding standard']],
  ['data', ['data model', 'etl', 'data dictionary', 'governance']],
  ['security', ['threat model', 'penetration test', 'compliance', 'owasp']],
  ['qa', ['test plan', 'test case', 'test strategy', 'uat']],
  ['devops', ['ci/cd', 'deployment runbook', 'release note', 'rollback plan']],
  ['operations', ['incident report', 'postmortem', 'runbook', 'sop']],
  ['analytics', ['tracking plan', 'kpi dashboard', 'experiment plan', 'retention']],
]

export async function importCommand(
  target: string,
  options: { type?: string; title?: string }
): Promise<void> {
  const root = process.cwd()
  const store = new ArtifactStore(root)

  if (!existsSync(target)) {
    throw new Error(`Import target not found: ${target}`)
  }

  const stat = statSync(target)
  const targets = stat.isDirectory() ? collectFiles(target) : [target]

  let imported = 0
  let unchanged = 0

  for (const file of targets) {
    const result = importFile(file, store, options)
    if (result === 'imported') {
      imported++
    } else {
      unchanged++
    }
  }

  logger.success(`Imported ${imported} artifact(s), ${unchanged} unchanged`)
}

function importFile(
  file: string,
  store: ArtifactStore,
  options: { type?: string; title?: string }
): 'imported' | 'unchanged' {
  const raw = readFileSync(file, 'utf-8')
  const ext = extname(file).toLowerCase()

  if (ext === '.json') {
    const parsed = JSON.parse(raw)
    const items = Array.isArray(parsed) ? parsed : [parsed]
    let changed = false
    for (const item of items) {
      if (importOne(file, store, item.title, item.content, item.type || options.type, options.title)) {
        changed = true
      }
    }
    return changed ? 'imported' : 'unchanged'
  }

  const { meta, body } = parseFrontmatter(raw)
  const type = options.type || meta.type || detectType(body)
  const title = options.title || meta.title || basename(file, ext)

  return importOne(file, store, title, body, type) ? 'imported' : 'unchanged'
}

function importOne(
  file: string,
  store: ArtifactStore,
  title: string | undefined,
  content: string,
  type: string | undefined,
  titleOverride?: string
): boolean {
  const artifactType = validateType(type)
  const artifactTitle = titleOverride || title || basename(file, extname(file))

  if (store.hasChecksum(checksum(content))) {
    logger.dim(`  - ${artifactTitle} (${artifactType}): unchanged`)
    return false
  }

  store.add({ type: artifactType, title: artifactTitle, content, source: 'import' })
  logger.info(`  - ${artifactTitle} (${artifactType}): imported`)
  return true
}

function validateType(type: string | undefined): ArtifactType {
  if (type && ArtifactStore.isValidType(type)) return type
  if (!type) return 'business'
  throw new Error(`Unknown artifact type: ${type}. Valid types: business, research, product, requirements, design, architecture, engineering, data, security, qa, devops, operations, analytics`)
}

function detectType(content: string): ArtifactType {
  const lower = content.toLowerCase()
  for (const [type, keywords] of KEYWORD_MAP) {
    if (keywords.some(k => lower.includes(k))) return type
  }
  return 'business'
}

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  if (!content.startsWith('---')) {
    return { meta: {}, body: content }
  }

  const lines = content.split('\n')
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i
      break
    }
  }
  if (end === -1) return { meta: {}, body: content }

  const meta: Record<string, string> = {}
  for (const line of lines.slice(1, end)) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
  }
  return { meta, body: lines.slice(end + 1).join('\n') }
}

function collectFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(fullPath))
    } else if (/\.(md|markdown|json)$/i.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}
