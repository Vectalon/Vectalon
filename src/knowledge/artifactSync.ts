import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { runCommand } from '../adapters/runCommand'
import type { CommandResult } from '../adapters/runCommand'

export interface ArtifactSyncConfig {
  /** Git remote URL (e.g. git@github.com:org/team-brain.git or a hosted service). */
  remote: string
  /** Branch to sync the knowledge brain to/from. */
  branch: string
  /** When false, `sync` commands refuse to run without --force. */
  enabled?: boolean
}

export const DEFAULT_SYNC_BRANCH = 'main'
const KNOWLEDGE_DIR = '.vectalon/knowledge'

/** Executor seam so tests can capture git commands without a real repo. */
export type GitExecutor = (command: string, args: string[], options: { cwd: string }) => Promise<CommandResult>

const defaultExecutor: GitExecutor = (command, args, options) => runCommand(command, args, options)

export function syncConfigPath(root: string): string {
  return join(root, '.vectalon', 'sync.json')
}

export function readSyncConfig(root: string): ArtifactSyncConfig | null {
  try {
    const path = syncConfigPath(root)
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<ArtifactSyncConfig>
    if (typeof parsed.remote !== 'string' || !parsed.remote.trim()) return null
    return {
      remote: parsed.remote.trim(),
      branch: typeof parsed.branch === 'string' && parsed.branch.trim() ? parsed.branch.trim() : DEFAULT_SYNC_BRANCH,
      enabled: parsed.enabled !== false,
    }
  } catch {
    return null
  }
}

export function writeSyncConfig(root: string, config: ArtifactSyncConfig): string {
  const path = syncConfigPath(root)
  mkdirSync(join(root, '.vectalon'), { recursive: true })
  writeFileSync(path, JSON.stringify(config, null, 2))
  return path
}

export interface SyncResult {
  pushed: boolean
  pulled: boolean
  message: string
  remote: string
  branch: string
  committed?: string
}

export interface SyncOptions {
  remote?: string
  branch?: string
  force?: boolean
  executor?: GitExecutor
}

/**
 * Hosted artifact store: sync the team brain (`.vectalon/knowledge/`) to a git
 * remote. Push commits the knowledge dir to the remote branch; pull fetches and
 * checks out the remote branch's knowledge dir over the local one. Commands run
 * in the project root so `git` resolves the working tree normally.
 */
export class ArtifactSync {
  private root: string
  private config: ArtifactSyncConfig
  private executor: GitExecutor

  constructor(root: string, config: ArtifactSyncConfig, executor: GitExecutor = defaultExecutor) {
    this.root = root
    this.config = config
    this.executor = executor
  }

  async push(options: SyncOptions = {}): Promise<SyncResult> {
    this.assertEnabled(options)
    const remote = options.remote || this.config.remote
    const branch = options.branch || this.config.branch
    const knowledgePath = join(this.root, KNOWLEDGE_DIR)

    // Stage the knowledge brain, then only commit when something actually
    // changed — never create a spurious empty commit on the project branch.
    const add = await this.executor('git', ['add', KNOWLEDGE_DIR], { cwd: this.root })
    if (!add.success) {
      return { pushed: false, pulled: false, message: `git add failed: ${add.stderr.trim()}`, remote, branch }
    }
    const staged = await this.executor('git', ['diff', '--cached', '--quiet'], { cwd: this.root })
    let committed: string | undefined
    if (staged.exitCode !== 0) {
      const commit = await this.executor('git', ['commit', '-m', 'sync: update team brain knowledge'], { cwd: this.root })
      if (!commit.success) {
        return { pushed: false, pulled: false, message: `git commit failed: ${commit.stderr.trim()}`, remote, branch }
      }
      committed = commit.stdout.trim()
    }

    // Ensure the remote exists; add only if missing.
    const remotes = await this.executor('git', ['remote'], { cwd: this.root })
    const hasRemote = remotes.success && remotes.stdout.split(/\s+/).includes('vectalon-sync')
    if (!hasRemote) {
      const added = await this.executor('git', ['remote', 'add', 'vectalon-sync', remote], { cwd: this.root })
      if (!added.success) {
        return { pushed: false, pulled: false, message: `git remote add failed: ${added.stderr.trim()}`, remote, branch }
      }
    }

    const push = await this.executor('git', ['push', '-u', 'vectalon-sync', `HEAD:${branch}`], { cwd: this.root })
    if (!push.success) {
      return { pushed: false, pulled: false, message: `git push failed: ${push.stderr.trim()}`, remote, branch }
    }
    return {
      pushed: true,
      pulled: false,
      message: committed
        ? `Pushed team brain (${knowledgePath}) to ${remote}@${branch}`
        : `Knowledge unchanged; ${remote}@${branch} already up to date`,
      remote,
      branch,
      committed,
    }
  }

  async pull(options: SyncOptions = {}): Promise<SyncResult> {
    this.assertEnabled(options)
    const remote = options.remote || this.config.remote
    const branch = options.branch || this.config.branch

    // Fetch, then overwrite the local knowledge dir with the remote's version.
    const fetch = await this.executor('git', ['fetch', remote, branch], { cwd: this.root })
    if (!fetch.success) {
      return { pushed: false, pulled: false, message: `git fetch failed: ${fetch.stderr.trim()}`, remote, branch }
    }
    const checkout = await this.executor('git', ['checkout', 'FETCH_HEAD', '--', KNOWLEDGE_DIR], { cwd: this.root })
    if (!checkout.success) {
      return { pushed: false, pulled: false, message: `git checkout failed: ${checkout.stderr.trim()}`, remote, branch }
    }
    return {
      pushed: false,
      pulled: true,
      message: `Pulled team brain from ${remote}@${branch} into ${KNOWLEDGE_DIR}`,
      remote,
      branch,
    }
  }

  private assertEnabled(options: SyncOptions): void {
    if (this.config.enabled === false && !options.force) {
      throw new Error('Artifact sync is disabled in .vectalon/sync.json. Pass --force to override.')
    }
  }
}

export function createArtifactSync(root: string, options: SyncOptions = {}): ArtifactSync | null {
  const config = readSyncConfig(root)
  if (!config) return null
  const effective = {
    ...config,
    remote: options.remote || config.remote,
    branch: options.branch || config.branch,
  }
  return new ArtifactSync(root, effective, options.executor)
}
