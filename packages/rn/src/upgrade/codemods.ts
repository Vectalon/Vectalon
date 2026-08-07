/**
 * vectalon upgrade — Codemods stage
 * Business Source License 1.1 (BSL-1.1)
 *
 * Applies the planned edits to disk with:
 * - per-file backups under `.vectalon/upgrades/backups/<timestamp>/` (reversible)
 * - a provenance manifest recording every codemod as an artifact
 *   (`.vectalon/upgrades/<timestamp>-upgrade.json`) plus a human-readable
 *   `UPGRADE.md`. 'review' steps apply only with --force.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { reportError } from '../utils/safe'
import type { CodemodEdit, UpgradeReport } from './types'

/** Apply a list of edits (for one file) to a content string, in order. */
export function applyEditsToContent(content: string, edits: CodemodEdit[]): { content: string; failed: string[] } {
  let next = content
  const failed: string[] = []
  for (const edit of edits) {
    if (edit.action === 'write') {
      next = edit.updated
      continue
    }
    const idx = next.indexOf(edit.original)
    if (idx === -1) {
      failed.push(`${edit.path}: could not find "${edit.original.slice(0, 60)}…"`)
      continue
    }
    switch (edit.action) {
      case 'replace':
        next = next.slice(0, idx) + edit.updated + next.slice(idx + edit.original.length)
        break
      case 'insert':
        next = next.slice(0, idx + edit.original.length) + edit.updated + next.slice(idx + edit.original.length)
        break
      case 'remove':
        next = next.slice(0, idx) + next.slice(idx + edit.original.length)
        break
    }
  }
  return { content: next, failed }
}

/** Deep-merge JSON object snapshots; returns null when any is not JSON. */
function mergeJsonWrites(writes: CodemodEdit[]): string | null {
  const acc: Record<string, unknown> = {}
  for (const edit of writes) {
    let parsed: unknown
    try {
      parsed = JSON.parse(edit.updated)
    } catch (err) {
      reportError(err, 'upgrade: merging whole-file JSON edits')
      return null
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    deepMerge(acc, parsed as Record<string, unknown>)
  }
  return JSON.stringify(acc, null, 2) + '\n'
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(source)) {
    const value = source[key]
    const existing = target[key]
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      existing && typeof existing === 'object' && !Array.isArray(existing)
    ) {
      deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      target[key] = value
    }
  }
}

function safeWrite(relPath: string, content: string, root: string): void {
  const full = join(root, relPath)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}

/**
 * Apply the plan's edits. Only 'auto' steps unless `force` (then 'review'
 * steps too). Returns the updated report with `applied: true`, the applied
 * edits, and provenance paths. Never throws — failures accumulate in
 * `report.errors` so the caller can surface them.
 */
export function applyUpgradeCodemods(root: string, report: UpgradeReport, opts: { force: boolean }): UpgradeReport {

  const errors = [...report.errors]
  const eligible = report.steps.filter(s => s.kind === 'auto' || (opts.force && s.kind === 'review'))
  const planned = eligible.flatMap(s => s.edits)

  if (planned.length === 0) {
    return { ...report, errors }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const upgradesDir = join(root, '.vectalon', 'upgrades')
  const backupDir = join(upgradesDir, 'backups', timestamp)
  const applied: CodemodEdit[] = []

  try {
    // Group edits by file so backups + writes happen once per file.
    const byFile = new Map<string, CodemodEdit[]>()
    for (const edit of planned) {
      const list = byFile.get(edit.path) || []
      list.push(edit)
      byFile.set(edit.path, list)
    }

    for (const [relPath, edits] of byFile) {
      const full = join(root, relPath)
      if (!existsSync(full)) {
        errors.push(`codemod skipped ${relPath}: file does not exist`)
        continue
      }
      let content: string
      try {
        content = readFileSync(full, 'utf-8')
      } catch (err) {
        reportError(err, `upgrade: reading ${relPath}`)
        errors.push(`codemod skipped ${relPath}: unreadable`)
        continue
      }

      // Back up the original.
      const backupPath = join(backupDir, relPath)
      try {
        mkdirSync(dirname(backupPath), { recursive: true })
        copyFileSync(full, backupPath)
      } catch (err) {
        reportError(err, `upgrade: backing up ${relPath}`)
        errors.push(`could not back up ${relPath} — skipping to stay reversible`)
        continue
      }

      // Multiple whole-file ('write') edits to the same file (e.g. the
      // dependency codemods each write package.json) must merge instead of
      // clobbering each other — deep-merge the JSON snapshots.
      const writes = edits.filter(e => e.action === 'write')
      const others = edits.filter(e => e.action !== 'write')
      let base = content
      if (writes.length > 0) {
        if (writes.length === 1) {
          base = writes[0].updated
        } else {
          const merged = mergeJsonWrites(writes)
          if (merged === null) {
            errors.push(`could not merge ${writes.length} whole-file edits for ${relPath}`)
            continue
          }
          base = merged
        }
      }

      const { content: next, failed } = applyEditsToContent(base, others)
      if (failed.length > 0) {
        errors.push(...failed)
        continue
      }
      safeWrite(relPath, next, root)
      for (const edit of edits) {
        applied.push({ ...edit })
      }
    }
  } catch (err) {
    reportError(err, 'upgrade: applying codemods')
    errors.push(`codemod application failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Provenance manifest — every codemod recorded as an artifact.
  const provenanceDir = join(upgradesDir, timestamp)
  mkdirSync(provenanceDir, { recursive: true })
  const manifestPath = join(provenanceDir, `${timestamp}-upgrade.json`)
  const reportPath = join(provenanceDir, 'UPGRADE.md')
  const manifest = {
    schema: 'vectalon-upgrade/1',
    generatedAt: Date.now(),
    root,
    target: report.target,
    tooling: report.tooling,
    from: {
      rnVersion: report.from.rnVersion,
      expoVersion: report.from.expoVersion,
      newArchEnabled: report.from.newArch?.enabled ?? null,
      hermesEnabled: report.from.android.hermesEnabled,
    },
    appliedEdits: applied.map(e => ({
      path: e.path,
      action: e.action,
      detail: e.detail,
    })),
    impact: report.impact.map(f => ({ file: f.file, pattern: f.pattern, risk: f.risk, category: f.category })),
    steps: report.steps.map(s => ({ id: s.id, kind: s.kind, risk: s.risk })),
    errors,
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  writeFileSync(reportPath, renderUpgradeMarkdown(report, applied))

  return {
    ...report,
    applied: true,
    edits: applied,
    provenance: { dir: provenanceDir.replace(root, '.'), manifest: manifestPath.replace(root, '.'), report: reportPath.replace(root, '.') },
    errors,
  }
}

/** Human-readable UPGRADE.md for the provenance dir. */
export function renderUpgradeMarkdown(report: UpgradeReport, applied: CodemodEdit[]): string {
  const lines: string[] = []
  lines.push('# Vectalon Upgrade Report')
  lines.push('')
  lines.push(`- **Project**: ${report.root}`)
  lines.push(`- **Target**: ${report.target ?? 'unknown'}`)
  lines.push(`- **Tooling**: ${report.tooling ?? 'unknown'}`)
  lines.push(`- **Generated**: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('## Applied codemods')
  lines.push('')
  if (applied.length === 0) {
    lines.push('_No codemods applied._')
  }
  for (const edit of applied) {
    lines.push(`- \`${edit.path}\` — ${edit.detail}`)
  }
  lines.push('')
  lines.push('## Manual steps remaining')
  lines.push('')
  const manual = report.steps.filter(s => s.kind === 'manual' || s.kind === 'review')
  if (manual.length === 0) {
    lines.push('_None._')
  }
  for (const step of manual) {
    lines.push(`### ${step.title} (${step.risk})`)
    for (const m of step.manual) {
      lines.push(`- ${m}`)
    }
  }
  lines.push('')
  lines.push('## Verification')
  lines.push('')
  if (report.verify) {
    for (const check of report.verify.checks) {
      lines.push(`- [${check.status.toUpperCase()}] ${check.name}: ${check.detail}`)
    }
  } else {
    lines.push('_Verification not run._')
  }
  lines.push('')
  return lines.join('\n')
}

/** Best-effort pre-upgrade bundle snapshot for the regression gate. */
export function captureBundleSnapshot(root: string, stats: { totalSize: number; moduleCount: number } | null): void {
  try {
    if (!stats) return
    const dir = join(root, '.vectalon', 'upgrades')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'bundle-before.json'), JSON.stringify(stats, null, 2) + '\n')
  } catch (err) {
    reportError(err, 'upgrade: writing bundle-before snapshot')
  }
}

/** Read the pre-upgrade bundle snapshot, if any. */
export function readBundleSnapshot(root: string): { totalSize: number; moduleCount: number } | null {
  const path = join(root, '.vectalon', 'upgrades', 'bundle-before.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as { totalSize: number; moduleCount: number }
  } catch (err) {
    reportError(err, 'upgrade: reading bundle-before snapshot')
    return null
  }
}

/** Remove a leftover bundle snapshot (post-verify cleanup). */
export function clearBundleSnapshot(root: string): void {
  try {
    rmSync(join(root, '.vectalon', 'upgrades', 'bundle-before.json'), { force: true })
  } catch (err) {
    reportError(err, 'upgrade: clearing bundle-before snapshot')
  }
}
