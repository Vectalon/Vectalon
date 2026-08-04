import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { listEcosystemItems } from './catalog'
import { readEcosystemConfig } from './config'
import type { EcosystemConfig } from './config'
import type { EcosystemItem } from './types'

/**
 * Ecosystem skills -> model context.
 *
 * Enabled agent skills (Expo Router, Callstack best practices, React Native
 * Expert, …) install a SKILL.md into the project (.vectalon/skills/<id> or
 * .agents/skills/<id>). This module reads those files and inlines them into
 * the system prompt of local model generations, so the local LLM follows the
 * same best-practice guidance that external agents load from the skills.
 */

export interface SkillSource {
  id: string
  name: string
  content: string
}

export interface SkillsContextOptions {
  /** Per-skill content cap in characters (default 4000). */
  maxCharsPerSkill?: number
  /** Total skills-section cap in characters (default 16000). */
  maxTotalChars?: number
  /** Maximum number of skills to inline (default 8). */
  maxSkills?: number
}

const DEFAULT_OPTIONS: Required<SkillsContextOptions> = {
  maxCharsPerSkill: 4000,
  maxTotalChars: 16000,
  maxSkills: 8,
}

/** Skill install directories, mirroring the doctor's lookup (doctor.ts). */
function skillDirs(root: string, item: EcosystemItem): string[] {
  const dirs = [
    join(root, '.vectalon', 'skills', item.id),
    join(root, '.agents', 'skills', item.id),
  ]
  if (item.configPath) dirs.push(join(root, item.configPath))
  return dirs
}

/** Locate the SKILL.md file inside a skill install dir (case-insensitive). */
function findSkillFile(dir: string): string | null {
  if (!existsSync(dir)) return null
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return null
  }
  const match = entries.find(e => e.toLowerCase() === 'skill.md')
  return match ? join(dir, match) : null
}

/** Read a single enabled skill's contents, or null when it isn't installed. */
export function readSkillContent(root: string, item: EcosystemItem): SkillSource | null {
  for (const dir of skillDirs(root, item)) {
    const file = findSkillFile(dir)
    if (file) {
      try {
        return { id: item.id, name: item.name, content: readFileSync(file, 'utf-8') }
      } catch {
        return null
      }
    }
  }
  return null
}

interface SkillsCacheEntry {
  signature: string
  sources: SkillSource[]
}

/**
 * Small memo: a feature run makes many local model calls (intent, implementation,
 * fixes, code review), and each one would otherwise re-read ecosystem.json and
 * every enabled SKILL.md. The signature covers the enabled skill ids plus each
 * installed SKILL.md's mtime, so edits invalidate the cache.
 */
const skillsCache = new Map<string, SkillsCacheEntry>()

function skillsSignature(root: string, config: EcosystemConfig): string {
  const enabled = listEcosystemItems().filter(
    i => i.category === 'skill' && config.enabled.includes(i.id)
  )
  return enabled
    .map(item => {
      for (const dir of skillDirs(root, item)) {
        const file = findSkillFile(dir)
        if (file) {
          try {
            return `${item.id}:${statSync(file).mtimeMs}`
          } catch {
            return `${item.id}:unreadable`
          }
        }
      }
      return `${item.id}:missing`
    })
    .join('|')
}

/**
 * Read the contents of every enabled skill that is actually installed on disk,
 * in ecosystem-config order, capped per-skill and in total so a huge SKILL.md
 * (e.g. the all-in-one expo-skills pack) can't blow up the prompt. Results are
 * memoized per (root, options) and invalidated when a skill file changes.
 */
export function readEnabledSkills(
  root: string,
  options: SkillsContextOptions = {}
): SkillSource[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const cacheKey = `${root}|${opts.maxCharsPerSkill}|${opts.maxSkills}`
  const config = readEcosystemConfig(root)

  const signature = skillsSignature(root, config)
  const cached = skillsCache.get(cacheKey)
  if (cached && cached.signature === signature) return cached.sources

  const enabledSkills = listEcosystemItems().filter(
    i => i.category === 'skill' && config.enabled.includes(i.id)
  )

  const sources: SkillSource[] = []
  for (const item of enabledSkills) {
    if (sources.length >= opts.maxSkills) break
    const source = readSkillContent(root, item)
    if (source && source.content.trim().length > 0) {
      sources.push({
        ...source,
        content: source.content.slice(0, opts.maxCharsPerSkill),
      })
    }
  }

  if (skillsCache.size > 100) skillsCache.clear()
  skillsCache.set(cacheKey, { signature, sources })
  return sources
}

/** Render skill contents into a markdown prompt section. */
export function formatSkillsContext(
  sources: SkillSource[],
  options: SkillsContextOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const parts: string[] = ['## Enabled project skills (best practices)', '']
  let budget = opts.maxTotalChars
  for (const source of sources) {
    if (budget <= 0) break
    const body = source.content.slice(0, Math.min(opts.maxCharsPerSkill, budget))
    parts.push(`### ${source.name} (${source.id})`, '', body, '')
    budget -= body.length
  }
  return parts.join('\n')
}

/**
 * Build the enriched system prompt for a project: the caller's system prompt
 * with the enabled skills' best practices appended. Returns the original
 * systemPrompt unchanged (or undefined) when no skills are installed, so
 * projects without skills behave exactly as before.
 */
export function buildSkillsSystemPrompt(
  root: string,
  systemPrompt?: string,
  options: SkillsContextOptions = {}
): string | undefined {
  const sources = readEnabledSkills(root, options)
  if (sources.length === 0) return systemPrompt
  const section = formatSkillsContext(sources, options)
  if (!systemPrompt) return section
  return `${systemPrompt}\n\n${section}`
}

export interface SkillsPreviewOptions {
  /** Content lines shown per skill (default 6). */
  linesPerSkill?: number
  /** Per-line character cap (default 140). */
  maxLineLength?: number
}

/**
 * A compact, human-readable audit of the skills inlined into the model prompt:
 * one `### name (id)` header per skill followed by its first few non-blank
 * lines, with an ellipsis when more content was truncated.
 */
export function formatSkillsPreview(
  sources: SkillSource[],
  options: SkillsPreviewOptions = {}
): string {
  const linesPerSkill = options.linesPerSkill ?? 6
  const maxLineLength = options.maxLineLength ?? 140
  const parts: string[] = []

  for (const source of sources) {
    parts.push(`### ${source.name} (${source.id})`)
    const lines = source.content
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
    const shown = lines.slice(0, linesPerSkill).map(l => {
      const clipped = l.slice(0, maxLineLength)
      return `  ${clipped}${l.length > maxLineLength ? '…' : ''}`
    })
    parts.push(...shown)
    if (lines.length > shown.length) {
      parts.push(`  … ${lines.length - shown.length} more line(s) omitted`)
    }
  }

  return parts.join('\n')
}
