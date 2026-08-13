/**
 * Org policy transport (Team brain v2)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Publishes and fetches the org guardrail policy document through the SAME
 * sync remote `vectalon sync` uses for the knowledge brain
 * (`.vectalon/sync.json`). The remote branch hosts `policies/org-policy.json`
 * next to the knowledge dir.
 *
 * - push publishes this project's policy + budgets as the org policy. It works
 *   in a throwaway shallow clone, so the project working tree and its branch
 *   are never touched, and the remote branch receives a single clean commit
 *   (fast-forward when the doc changed, no-op when it did not).
 * - pull fetches the remote branch and writes `policies/org-policy.json` into
 *   the local `.vectalon/team/` cache via `git show` (no checkout, no working
 *   tree writes).
 *
 * Commands run through a GitExecutor seam so tests capture them without a real
 * repo — the same pattern ArtifactSync uses.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runCommand } from '../adapters/runCommand'
import type { CommandResult } from '../adapters/runCommand'
import type { ArtifactSyncConfig } from './artifactSync'
import { readSyncConfig } from './artifactSync'
import { reportError } from '../utils/safe'
import { writeOrgPolicyCache, sanitizeOrgBudgets, type OrgPolicyDoc } from './orgPolicy'

/** Executor seam so tests can capture git commands without a real repo. */
export type GitExecutor = (command: string, args: string[], options: { cwd: string }) => Promise<CommandResult>

const defaultExecutor: GitExecutor = (command, args, options) => runCommand(command, args, options)

/** Path of the org policy on the sync remote branch. */
export const ORG_POLICY_REMOTE_PATH = 'policies/org-policy.json'

export interface OrgPolicySyncResult {
  pushed: boolean
  pulled: boolean
  message: string
  remote: string
  branch: string
  /** The doc pulled from the remote (null when the remote has none). */
  policy?: OrgPolicyDoc | null
}

export interface OrgPolicySyncOptions {
  remote?: string
  branch?: string
  force?: boolean
  executor?: GitExecutor
}

export class OrgPolicySync {
  private root: string
  private config: ArtifactSyncConfig
  private executor: GitExecutor

  constructor(root: string, config: ArtifactSyncConfig, executor: GitExecutor = defaultExecutor) {
    this.root = root
    this.config = config
    this.executor = executor
  }

  /**
   * Publish a doc as the org policy on the remote branch. Works in a throwaway
   * clone so the project working tree is never touched; the remote gets one
   * commit (or none when the doc is unchanged).
   */
  async push(doc: OrgPolicyDoc): Promise<OrgPolicySyncResult> {
    this.assertEnabled()
    const remote = this.config.remote
    const branch = this.config.branch
    const tmp = mkdtempSync(join(tmpdir(), 'vectalon-orgpolicy-'))

    try {
      const run = (args: string[], cwd: string): Promise<CommandResult> => this.executor('git', args, { cwd })

      // 1. Scratch repo with the remote configured.
      const init = await run(['init', tmp], this.root)
      if (!init.success) {
        return { pushed: false, pulled: false, message: `git init failed: ${init.stderr.trim()}`, remote, branch }
      }
      const addRemote = await run(['remote', 'add', 'origin', remote], tmp)
      if (!addRemote.success) {
        return { pushed: false, pulled: false, message: `git remote add failed: ${addRemote.stderr.trim()}`, remote, branch }
      }

      // 2. Fetch the existing branch (fails harmlessly on a fresh remote).
      //    When it exists, reset the scratch repo to the remote head — robust
      //    even when the `git init` default branch is already named <branch> —
      //    so the follow-up commit always fast-forwards the remote branch.
      const fetched = await run(['fetch', '--depth', '1', 'origin', branch], tmp)
      if (fetched.success) {
        await run(['reset', '--hard', 'FETCH_HEAD'], tmp)
      }

      // 3. Write the doc into the scratch clone.
      mkdirSync(join(tmp, 'policies'), { recursive: true })
      writeFileSync(join(tmp, ORG_POLICY_REMOTE_PATH), JSON.stringify(doc, null, 2) + '\n', 'utf-8')
      const add = await run(['add', ORG_POLICY_REMOTE_PATH], tmp)
      if (!add.success) {
        return { pushed: false, pulled: false, message: `git add failed: ${add.stderr.trim()}`, remote, branch }
      }

      // 4. No-op when nothing changed on the remote branch.
      const staged = await run(['diff', '--cached', '--quiet'], tmp)
      if (staged.exitCode === 0) {
        return {
          pushed: false,
          pulled: false,
          message: `Org policy unchanged; ${remote}@${branch} already up to date`,
          remote,
          branch,
        }
      }

      const commit = await run(
        ['-c', 'user.name=vectalon', '-c', 'user.email=vectalon-sync@users.noreply.github.com', 'commit', '-m', 'sync: update org guardrail policy'],
        tmp
      )
      if (!commit.success) {
        return { pushed: false, pulled: false, message: `git commit failed: ${commit.stderr.trim()}`, remote, branch }
      }

      const push = await run(['push', 'origin', `HEAD:${branch}`], tmp)
      if (!push.success) {
        return { pushed: false, pulled: false, message: `git push failed: ${push.stderr.trim()}`, remote, branch }
      }
      return {
        pushed: true,
        pulled: false,
        message: `Published org policy to ${remote}@${branch}`,
        remote,
        branch,
      }
    } finally {
      try {
        rmSync(tmp, { recursive: true, force: true })
      } catch (err) {
        reportError(err, 'orgPolicySync: cleaning up scratch clone')
      }
    }
  }

  /**
   * Fetch the org policy from the remote branch into the local cache
   * (`.vectalon/team/org-policy.json`). Uses `git show` so nothing is written
   * into the project working tree.
   */
  async pull(): Promise<OrgPolicySyncResult> {
    this.assertEnabled()
    const remote = this.config.remote
    const branch = this.config.branch

    const fetch = await this.executor('git', ['fetch', remote, branch], { cwd: this.root })
    if (!fetch.success) {
      return { pushed: false, pulled: false, message: `git fetch failed: ${fetch.stderr.trim()}`, remote, branch }
    }
    const show = await this.executor('git', ['show', `FETCH_HEAD:${ORG_POLICY_REMOTE_PATH}`], { cwd: this.root })
    if (!show.success) {
      return {
        pushed: false,
        pulled: false,
        policy: null,
        message: `No org policy published on ${remote}@${branch} (nothing to pull)`,
        remote,
        branch,
      }
    }

    let parsed: Partial<OrgPolicyDoc>
    try {
      parsed = JSON.parse(show.stdout) as Partial<OrgPolicyDoc>
      if (!parsed || typeof parsed !== 'object' || typeof parsed.policy !== 'object' || parsed.policy === null) {
        throw new Error('org policy doc has no policy section')
      }
    } catch (err) {
      reportError(err, 'orgPolicySync: parsing pulled org policy')
      return { pushed: false, pulled: false, message: `Org policy on ${remote}@${branch} is not valid JSON`, remote, branch }
    }

    const doc: OrgPolicyDoc = {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      policy: parsed.policy,
      budgets: sanitizeOrgBudgets(parsed.budgets),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    }
    const path = writeOrgPolicyCache(this.root, doc)
    return {
      pushed: false,
      pulled: true,
      message: `Pulled org policy from ${remote}@${branch} into ${path}`,
      remote,
      branch,
      policy: doc,
    }
  }

  private assertEnabled(): void {
    if (this.config.enabled === false) {
      throw new Error('Artifact sync is disabled in .vectalon/sync.json. Pass --force to override.')
    }
  }
}

export function createOrgPolicySync(root: string, options: OrgPolicySyncOptions = {}): OrgPolicySync | null {
  const config = readSyncConfig(root)
  if (!config) return null
  const effective = {
    ...config,
    remote: options.remote || config.remote,
    branch: options.branch || config.branch,
  }
  return new OrgPolicySync(root, effective, options.executor)
}

/** Whether a sync config exists — used by the CLI status view. */
export function hasSyncConfig(root: string): boolean {
  return existsSync(join(root, '.vectalon', 'sync.json'))
}
