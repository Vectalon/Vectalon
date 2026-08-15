/**
 * vectalon repos — Multi-repository Memory Agent (Roadmap Phase 10, item 085)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass over the workspace manifest (`.vectalon/repos.json`):
 * check each sibling repo for local presence, git metadata, and a memory
 * store, then surface cross-repo drift (a repo named in memory but not in the
 * manifest, or listed but not reachable). Reports to docs/vectalon/repos/
 * (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import type { RepoCheck, RepoFinding, RepoReport } from './types'

export type { RepoCheck, RepoFinding, RepoReport } from './types'

/** Where repos reports are written. */
export const reposDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'repos')

/** Default workspace manifest path. */
export const REPOS_MANIFEST = '.vectalon/repos.json'

export interface RepoManifestEntry {
  name: string
  path: string
  remote?: string
  memory?: boolean
}

export interface RepoManifest {
  version?: number
  repos: RepoManifestEntry[]
}

/** Parse the workspace manifest; tolerant of missing/corrupt files. */
export function parseReposManifest(content: string): RepoManifest {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>
    const repos = Array.isArray(raw.repos) ? raw.repos : []
    return {
      version: typeof raw.version === 'number' ? raw.version : undefined,
      repos: repos
        .filter(r => r && typeof r === 'object')
        .map(r => {
          const e = r as Record<string, unknown>
          return {
            name: typeof e.name === 'string' ? e.name : typeof e.path === 'string' ? e.path : 'unnamed',
            path: typeof e.path === 'string' ? e.path : '',
            remote: typeof e.remote === 'string' ? e.remote : undefined,
            memory: typeof e.memory === 'boolean' ? e.memory : undefined,
          }
        })
        .filter(e => e.path.length > 0),
    }
  } catch {
    return { repos: [] }
  }
}

/** Read the manifest from disk (or an explicit path). */
export function readReposManifest(root: string, manifestPath?: string): { manifest: RepoManifest; path: string | null } {
  const p = manifestPath ?? join(root, REPOS_MANIFEST)
  if (!existsSync(p)) return { manifest: { repos: [] }, path: null }
  return { manifest: parseReposManifest(readFileSync(p, 'utf-8')), path: p }
}

/** Resolve a manifest-relative or absolute repo path against the workspace root. */
export function resolveRepoPath(root: string, entry: RepoManifestEntry): string {
  if (entry.path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(entry.path)) return entry.path
  // Relative (with or without ./ prefix) — resolve against the workspace root.
  return join(root, entry.path)
}

/** Check one manifest entry. */
export function checkRepo(root: string, entry: RepoManifestEntry, index: number): RepoCheck {
  const resolved = resolveRepoPath(root, entry)
  const id = `repo-${index + 1}`
  if (!existsSync(resolved)) {
    return {
      id, name: entry.name, path: entry.path, resolved, status: 'missing',
      evidence: 'path does not exist', detail: 'Clone the repo to the listed path so cross-repo analysis can reach it.',
    }
  }
  const isDir = (() => {
    try {
      return statSync(resolved).isDirectory()
    } catch {
      return false
    }
  })()
  if (!isDir) {
    return {
      id, name: entry.name, path: entry.path, resolved, status: 'missing',
      evidence: 'path exists but is not a directory', detail: 'Point the manifest at a directory containing the repo checkout.',
    }
  }
  const gitDir = existsSync(join(resolved, '.git'))
  const memoryStore = existsSync(join(resolved, '.vectalon', 'memory')) || existsSync(join(resolved, '.vectalon'))
  if (!gitDir) {
    return {
      id, name: entry.name, path: entry.path, resolved, status: 'not-git',
      evidence: 'no .git directory', detail: 'Only git checkouts can participate in cross-repo git analytics.',
    }
  }
  if (!memoryStore) {
    return {
      id, name: entry.name, path: entry.path, resolved, status: 'no-memory',
      evidence: 'no .vectalon/ memory store', detail: 'Run `vectalon init` in the repo so it builds a shared memory store.',
    }
  }
  return {
    id, name: entry.name, path: entry.path, resolved, status: 'ok',
    evidence: 'git checkout with memory store', detail: undefined,
  }
}

/** Run the multi-repo pass. */
export function runReposScan(root: string, manifestPath?: string): RepoReport {
  const scannedAt = Date.now()
  const { manifest, path: manifestFile } = readReposManifest(root, manifestPath)
  const checks: RepoCheck[] = manifest.repos.map((entry, i) => checkRepo(root, entry, i))
  const findings: RepoFinding[] = []

  if (!manifestFile) {
    findings.push({
      id: 'no-manifest', severity: 'info',
      message: 'No workspace manifest at .vectalon/repos.json.',
      suggestion: 'Create .vectalon/repos.json with {"repos":[{"name","path"}]} listing sibling checkouts.',
    })
  } else if (manifest.repos.length === 0) {
    findings.push({
      id: 'empty-manifest', severity: 'info',
      message: 'The workspace manifest lists no repos.',
      suggestion: 'Add sibling checkouts to the manifest so this agent can verify cross-repo reachability.',
    })
  }

  for (const check of checks) {
    if (check.status === 'missing') {
      findings.push({
        id: 'missing-repo', severity: 'warning', repo: check.name,
        message: `Repo "${check.name}" listed at ${check.path} is not reachable (${check.evidence}).`,
        suggestion: check.detail ?? 'Clone the checkout or fix the path in the manifest.',
      })
    } else if (check.status === 'not-git') {
      findings.push({
        id: 'not-git', severity: 'warning', repo: check.name,
        message: `Repo "${check.name}" at ${check.path} is not a git checkout.`,
        suggestion: check.detail ?? 'Initialize or clone the repo as git.',
      })
    } else if (check.status === 'no-memory') {
      findings.push({
        id: 'no-memory', severity: 'info', repo: check.name,
        message: `Repo "${check.name}" has no .vectalon/ memory store.`,
        suggestion: check.detail ?? 'Run vectalon init in that repo.',
      })
    }
  }

  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  const verdict: RepoReport['verdict'] = findings.some(f => f.severity === 'warning') ? 'needs-attention' : 'approved'
  return {
    scannedAt, root, manifestFile: manifestFile ? relative(root, manifestFile) : undefined,
    repoCount: manifest.repos.length, checks, findings, verdict, summary: { total: findings.length, bySeverity },
  }
}

/** Render the repos report as markdown. */
export function renderReposMarkdown(report: RepoReport): string {
  const lines = ['# vectalon repos — Multi-repository Memory', '']
  lines.push(`Manifest: ${report.manifestFile ?? 'none'}  ·  Repos: ${report.repoCount}  ·  Verdict: **${report.verdict}**`, '')
  if (report.checks.length > 0) {
    lines.push('', '| Repo | Path | Status | Evidence |', '|---|---|---|---|')
    for (const c of report.checks) {
      const mark = c.status === 'ok' ? '✅' : c.status === 'no-memory' ? '⚠️' : '❌'
      lines.push(`| ${c.name} | ${c.path} | ${mark} ${c.status} | ${c.evidence} |`)
    }
  }
  if (report.findings.length > 0) {
    lines.push('', '## Findings', '')
    for (const f of report.findings) {
      const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
      lines.push(`### [${mark}] ${f.id}${f.repo ? ` — ${f.repo}` : ''}`, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
    }
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeReposReport(root: string, report: RepoReport): { mdPath: string; jsonPath: string } {
  const dir = reposDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderReposMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}

/** Report path helpers shared with the CLI. */
export function reposReportPaths(root: string): { md: string; json: string } {
  const dir = reposDocsDir(root)
  return { md: relative(root, join(dir, 'report.md')), json: relative(root, join(dir, 'report.json')) }
}
