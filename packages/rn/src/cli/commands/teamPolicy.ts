/**
 * vectalon team-policy — Org-wide guardrail policy (Team brain v2)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Publishes and consumes the org guardrail policy through the same sync remote
 * `vectalon sync` uses: one policy change in the team repo propagates to every
 * project that pulls it. The remote branch hosts `policies/org-policy.json`
 * (guardrail rules + custom rules + code-review tuning + shared bundle
 * budgets); projects cache it at `.vectalon/team/org-policy.json` and every
 * gating surface — policy checks, the code-review phase, the MCP review tool,
 * bundle budgets — layers it under the project's own `.vectalon/policy.json`.
 */

import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { requireTier } from '@vectalon-dev/core'
import { logger } from '../logger'
import { PolicyEngine } from '../../guardrails/PolicyEngine'
import type { PolicyConfig } from '../../guardrails/PolicyEngine'
import { createOrgPolicySync } from '../../knowledge/orgPolicySync'
import type { GitExecutor } from '../../knowledge/orgPolicySync'
import {
  readOrgPolicyCache,
  clearOrgPolicyCache,
  readLocalBudgets,
  writeLocalBudgets,
  loadEffectiveBudgets,
  sanitizeOrgBudgets,
  orgPolicyCachePath,
  localBudgetsPath,
  type OrgPolicyDoc,
  type OrgBudgets,
} from '../../knowledge/orgPolicy'
import { readSyncConfig, syncConfigPath } from '../../knowledge/artifactSync'

export interface TeamPolicyOptions {
  push?: boolean
  pull?: boolean
  status?: boolean
  check?: string
  show?: boolean
  budget?: string
  remove?: boolean
  remote?: string
  branch?: string
  force?: boolean
  /** Test seam: capture git commands without a real repo. */
  executor?: GitExecutor
}

export async function teamPolicyCommand(directory: string, options: TeamPolicyOptions): Promise<void> {
  const check = requireTier('team', 'rn')

  if (!check.allowed) {
    logger.info('⚡ Org-wide guardrail policy requires Team tier.')
    logger.info(`Current: ${check.currentTier} | Required: ${check.requiredTier}`)

    if (check.canTrial) {
      logger.info('')
      logger.info('🔄 Start 14-day Team trial?')
      logger.info('   Run: npx vectalon auth --github')
      logger.info('   Or visit: https://vectalon.in/trial?product=rn')
    }

    logger.info('')
    logger.info('💳 Upgrade at: https://vectalon.in/pricing')
    process.exit(1)
  }

  const root = resolve(directory || process.cwd())
  if (!existsSync(join(root, '.vectalon'))) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
    return
  }

  // ---- --budget: write local budget overrides -------------------------------
  if (options.budget) {
    let parsed: unknown
    try {
      parsed = JSON.parse(options.budget)
    } catch (err) {
      logger.error(`--budget expects JSON: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logger.error('--budget expects a JSON object, e.g. {"largeLibBytes":65536}')
      process.exit(1)
      return
    }
    const override = sanitizeOrgBudgets(parsed as Record<string, unknown>)
    const path = writeLocalBudgets(root, override)
    const effective = loadEffectiveBudgets(root)
    logger.success(`Local budget overrides written to ${path}`)
    logger.info(`Effective: ${formatBudgets(effective)}`)
    return
  }

  // ---- --remove: stop following the org policy ------------------------------
  if (options.remove) {
    const removed = clearOrgPolicyCache(root)
    if (removed) {
      logger.success('Removed the cached org policy — this project now enforces its local policy only.')
    } else {
      logger.info('No org policy cache to remove (run `vectalon team-policy --pull` to follow one).')
    }
    return
  }

  // ---- --check: run the effective policy against a file ---------------------
  if (options.check) {
    const filePath = resolve(options.check)
    if (!existsSync(filePath)) {
      logger.error(`File not found: ${options.check}`)
      process.exit(1)
      return
    }
    const engine = new PolicyEngine(root)
    const org = readOrgPolicyCache(root)
    if (org) {
      logger.info(`Effective policy: org (updated ${org.updatedAt.slice(0, 10)}) + local`)
    }
    const result = engine.runPolicy({ filePath, content: readFileSync(filePath, 'utf-8') })
    logger.info(`Policy check for ${options.check}`)
    logger.info(`Passed: ${result.passed} | Failed: ${result.failed} | Skipped: ${result.skipped}`)
    for (const finding of result.findings) {
      const icon = finding.passed ? '✅' : finding.severity === 'error' ? '❌' : '⚠️'
      logger.info(`${icon} ${finding.rule}: ${finding.passed ? 'OK' : finding.message}`)
    }
    if (!result.ok) {
      process.exit(1)
    }
    return
  }

  // ---- --show: print the effective policy + budgets -------------------------
  if (options.show) {
    const engine = new PolicyEngine(root)
    const policy = engine.getPolicy()
    const org = readOrgPolicyCache(root)
    logger.info(`Effective policy (org ${org ? `@ ${org.updatedAt.slice(0, 10)}` : 'none'} + local):`)
    logger.info(`  Version: ${policy.version}`)
    logger.info(`  Rule overrides: ${Object.keys(policy.rules || {}).length}`)
    logger.info(`  Custom rules: ${(policy.customRules || []).length}`)
    logger.info(`  Code review: max ${policy.codeReview?.maxAttempts ?? 3} attempt(s), heal ≥ ${policy.codeReview?.healSeverity ?? 'error'}, tool checks ${policy.codeReview?.toolChecks !== false ? 'on' : 'off'}`)
    logger.info(`Budgets (effective): ${formatBudgets(loadEffectiveBudgets(root))}`)
    return
  }

  // ---- --push / --pull: transport through the sync remote -------------------
  if (options.push || options.pull) {
    const sync = createOrgPolicySync(root, {
      remote: options.remote,
      branch: options.branch,
      force: options.force,
      executor: options.executor,
    })
    if (!sync) {
      logger.error(`No ${syncConfigPath(root).replace(root + '/', '')} found. Run \`vectalon sync --init --remote <url>\` first.`)
      process.exit(1)
      return
    }

    try {
      if (options.push) {
        const localPolicyPath = join(root, '.vectalon', 'policy.json')
        if (!existsSync(localPolicyPath)) {
          logger.error('No .vectalon/policy.json found. Run `vectalon policy --init` first, then set your guardrails.')
          process.exit(1)
          return
        }
        // Publish the RAW local policy — exactly what the admin edited, without
        // normalized defaults — so consuming projects inherit real decisions only.
        let localPolicy: PolicyConfig
        try {
          localPolicy = JSON.parse(readFileSync(localPolicyPath, 'utf-8')) as PolicyConfig
        } catch (err) {
          logger.error(`Could not read .vectalon/policy.json: ${err instanceof Error ? err.message : String(err)}`)
          process.exit(1)
          return
        }
        const doc: OrgPolicyDoc = {
          version: 1,
          policy: localPolicy,
          budgets: readLocalBudgets(root),
          updatedAt: new Date().toISOString(),
        }
        const result = await sync.push(doc)
        if (result.pushed) {
          logger.success(result.message)
        } else {
          logger.info(result.message)
        }
      } else {
        const result = await sync.pull()
        if (result.pulled) {
          logger.success(result.message)
          logger.info('Effective immediately: policy checks, code review, and bundle budgets now layer the org policy.')
        } else {
          logger.info(result.message)
        }
      }
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
      return
    }
    return
  }

  // ---- default: status ------------------------------------------------------
  printTeamPolicyStatus(root)
}

function printTeamPolicyStatus(root: string): void {
  const config = readSyncConfig(root)
  if (!config) {
    logger.info(`Sync remote: not configured (run \`vectalon sync --init --remote <url>\`)`)
  } else {
    logger.info(`Sync remote: ${config.remote}@${config.branch}${config.enabled === false ? ' (disabled)' : ''}`)
  }
  const org = readOrgPolicyCache(root)
  if (org) {
    logger.info(`Org policy: cached at ${orgPolicyCachePath(root).replace(root + '/', '')} (updated ${org.updatedAt.slice(0, 10)}, ${Object.keys(org.policy.rules || {}).length} rule override(s), ${(org.policy.customRules || []).length} custom rule(s))`)
  } else {
    logger.info('Org policy: none cached — run `vectalon team-policy --pull` to follow the team policy')
  }
  const local = readLocalBudgets(root)
  logger.info(`Local budgets: ${Object.keys(local).length > 0 ? formatBudgets(local) + ` (${localBudgetsPath(root).replace(root + '/', '')})` : 'none set'}`)
  const effective = loadEffectiveBudgets(root)
  logger.info(`Budgets (effective): ${formatBudgets(effective)}`)
}

function formatBudgets(budgets: OrgBudgets): string {
  const parts: string[] = []
  if (budgets.largeLibBytes !== undefined) parts.push(`lib/asset ≤ ${budgets.largeLibBytes} B`)
  if (budgets.imageBytes !== undefined) parts.push(`image ≤ ${budgets.imageBytes} B`)
  if (budgets.assetBytes !== undefined) parts.push(`asset ≤ ${budgets.assetBytes} B`)
  if (budgets.sideEffects !== undefined) parts.push(`sideEffects check ${budgets.sideEffects ? 'on' : 'off'}`)
  return parts.length > 0 ? parts.join(' · ') : 'defaults (no org policy, no local overrides)'
}
