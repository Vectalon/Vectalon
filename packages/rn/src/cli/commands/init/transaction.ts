/**
 * Init transaction — rollback + idempotency for `vectalon init`.
 *
 * `init` mutates the project in several steps (scan → memory → gitignore →
 * model config → manifest → ecosystem). If any step throws midway, the
 * project is left half-initialized. This module gives init:
 *
 *  - a durable state marker (`.vectalon/.init-state.json`) recording which
 *    phases completed and every project file init touched, so the next run
 *    can detect the dirty state;
 *  - `--resume` — continue from the last completed phase;
 *  - `--clean-restart` — restore the recorded originals (and delete files
 *    init created) before re-initializing;
 *  - idempotency — a completed init is a no-op unless `--force` is passed.
 *
 * The rollback is file-snapshot based: before touching anything, init
 * snapshots every project file it may write; on failure it restores those
 * originals / deletes files that did not exist before. Model downloads live
 * in the user's global config dir (outside the project) and are *not*
 * deleted on rollback — they are recorded and kept (removing a multi-GB
 * download because a later step failed would be worse than the dirty state).
 */

import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

export const INIT_STATE_FILE = '.vectalon/.init-state.json'

/** Every project file init may create or modify (for snapshot + rollback). */
export const INIT_TOUCHED_FILES = [
  '.vectalon/snapshot.json',
  '.vectalon/memory.json',
  '.vectalon/rn-vectalon.json',
  '.vectalon/ecosystem.json',
  '.vectalon/.init-state.json',
  '.gitignore',
] as const

export type InitPhase =
  | 'scan'
  | 'memory'
  | 'gitignore'
  | 'model'
  | 'manifest'
  | 'ecosystem'
  | 'detect-deps'
  | 'complete'

export const INIT_PHASES: readonly InitPhase[] = [
  'scan',
  'memory',
  'gitignore',
  'model',
  'manifest',
  'ecosystem',
  'detect-deps',
  'complete',
]

export interface FileSnapshot {
  /** Path relative to the project root. */
  path: string
  /** True when the file existed before init touched it. */
  existed: boolean
  /** Original content (null when the file did not exist). */
  content: string | null
}

export interface InitStateFile {
  version: 1
  status: 'in-progress' | 'complete'
  startedAt: number
  updatedAt: number
  completedPhases: InitPhase[]
  /** Files init touched, with their pre-init content (for rollback). */
  rollback: FileSnapshot[]
  /** Model preset ids downloaded during this init run (kept on rollback). */
  modelsDownloaded: string[]
  /** Human-readable reason for the dirty state (last failure). */
  failureReason?: string
}

export function readInitState(root: string): InitStateFile | null {
  const path = join(root, INIT_STATE_FILE)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as InitStateFile
  } catch {
    return null
  }
}

export function writeInitState(root: string, state: InitStateFile): void {
  const path = join(root, INIT_STATE_FILE)
  // mkdirSync recursive — writeFileSync needs the .vectalon dir to exist.
  const dir = dirname(path)
  if (!existsSync(dir)) {
    // .vectalon may not exist yet (init failed before creating it): the state
    // file then has nowhere to live, so snapshot restore still works because
    // the failure path is what matters. Create it defensively.
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(path, JSON.stringify(state, null, 2))
}

/** Snapshot every init-touched file's current on-disk state. */
export function snapshotProjectFiles(root: string): FileSnapshot[] {
  return INIT_TOUCHED_FILES.map(path => {
    const full = join(root, path)
    if (existsSync(full)) {
      return { path, existed: true, content: readFileSync(full, 'utf-8') }
    }
    return { path, existed: false, content: null }
  })
}

/** Restore the project to its pre-init state: originals back, new files gone. */
export function restoreProjectFiles(root: string, snapshots: FileSnapshot[]): string[] {
  const restored: string[] = []
  for (const snap of snapshots) {
    const full = join(root, snap.path)
    try {
      if (snap.existed && snap.content !== null) {
        const dir = dirname(full)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(full, snap.content)
        restored.push(snap.path)
      } else {
        rmSync(full, { force: true })
        restored.push(snap.path)
      }
    } catch {
      // A failed rollback entry must not mask the other restores.
    }
  }
  return restored
}

/**
 * Detect the init state on this project:
 *  - `complete` → already initialized (idempotent no-op unless force).
 *  - `in-progress` → a previous init failed midway; offer resume/clean-restart.
 *  - dirty (no state file but rn-vectalon.json exists, or it is invalid JSON)
 *    → treat as an in-progress run with no rollback record.
 */
export function detectInitState(root: string): { status: 'new' | 'complete' | 'dirty'; state: InitStateFile | null; dirtyReason: string } {
  const state = readInitState(root)
  if (state) {
    if (state.status === 'complete') {
      return { status: 'complete', state, dirtyReason: '' }
    }
    return { status: 'dirty', state, dirtyReason: state.failureReason || 'a previous init did not finish' }
  }
  // No state marker: is the project half-initialized anyway?
  const manifestPath = join(root, '.vectalon', 'rn-vectalon.json')
  if (existsSync(manifestPath)) {
    try {
      JSON.parse(readFileSync(manifestPath, 'utf-8'))
      return {
        status: 'dirty',
        state: null,
        dirtyReason: '.vectalon/rn-vectalon.json exists without an init-state marker (init was interrupted before completion)',
      }
    } catch {
      return {
        status: 'dirty',
        state: null,
        dirtyReason: '.vectalon/rn-vectalon.json exists but is not valid JSON (corrupted mid-write)',
      }
    }
  }
  return { status: 'new', state: null, dirtyReason: '' }
}

/**
 * Delete the .vectalon artifacts init creates. Used when a dirty state has no
 * rollback record (the state marker itself is missing/corrupt) — a clean
 * restart then removes the partial files without touching .gitignore, whose
 * pre-init content is unknown.
 */
export function cleanPartialArtifacts(root: string): string[] {
  const removed: string[] = []
  for (const rel of [
    '.vectalon/snapshot.json',
    '.vectalon/memory.json',
    '.vectalon/rn-vectalon.json',
    '.vectalon/ecosystem.json',
    INIT_STATE_FILE,
  ]) {
    const full = join(root, rel)
    if (existsSync(full)) {
      rmSync(full, { force: true })
      removed.push(rel)
    }
  }
  return removed
}

/** Fresh state object for a new init run. */
export function createInitState(root: string, rollback: FileSnapshot[], reason?: string): InitStateFile {
  return {
    version: 1,
    status: 'in-progress',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    completedPhases: [],
    rollback,
    modelsDownloaded: [],
    ...(reason ? { failureReason: reason } : {}),
  }
}
