/**
 * vectalon team — Team Brain (Roadmap Phase 6, items 041-049)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass that generates the team-brain artifacts — project
 * glossary (044), coding standards (043), expertise map (046), ADR/decision
 * index (042, 048), PR knowledge (045), onboarding brief (049) — seeds them
 * into the knowledge base, and writes docs to docs/vectalon/team/. The
 * `--search` flag queries the team knowledge base across registered projects
 * (the Phase 6 acceptance: team knowledge searchable via semantic queries).
 */

import { requireTier } from '@vectalon-dev/core'
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import {
  buildTeamBrain,
  listTeamProjects,
  searchTeamBrain,
  renderTeamSummary,
  teamDocsDir,
} from '../../teamBrain'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import type { ArtifactType } from '../../knowledge/artifactTypes'

export interface TeamOptions {
  /** Search the team knowledge base (semantic when embeddings are configured). */
  search?: string
  /** Scope --search to one registered project. */
  project?: string
  /** Scope --search to one team. */
  team?: string
  /** Scope --search to one artifact type. */
  type?: string
  /** Search result cap. */
  limit?: number
  /** List registered team projects. */
  projects?: boolean
  /** Print machine-readable output. */
  json?: boolean
}

export async function teamCommand(directory: string, options: TeamOptions): Promise<void> {
  const check = requireTier('team', 'rn')

  if (!check.allowed) {
    logger.info('⚡ Team Brain requires Team tier.')
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

  // ---- --search: the Phase 6 acceptance surface ----------------------------
  if (options.search) {
    const type = options.type && ArtifactStore.isValidType(options.type) ? (options.type as ArtifactType) : undefined
    const hits = await searchTeamBrain(root, options.search, {
      project: options.project,
      team: options.team,
      type,
      limit: options.limit ?? 5,
    })
    if (options.json) {
      process.stdout.write(JSON.stringify(hits, null, 2) + '\n')
      return
    }
    logger.info(pc.bold(`Team brain search: "${options.search}"`))
    logger.info(`project: ${root}`)
    logger.info('')
    if (hits.length === 0) {
      logger.info('No matches — run `vectalon team` first to build the knowledge base, or broaden the query.')
      return
    }
    for (const hit of hits) {
      logger.info(pc.bold(hit.title) + pc.dim(`  [${hit.type}]`))
      logger.info(`  ${hit.project}${hit.team ? ` (${hit.team})` : ''} · score ${hit.score.toFixed(3)} · confidence ${hit.confidence.toFixed(2)}`)
      logger.info(`  ${hit.snippet}`)
      logger.info('')
    }
    return
  }

  // ---- --projects: registered team projects --------------------------------
  if (options.projects) {
    const projects = listTeamProjects(root)
    if (options.json) {
      process.stdout.write(JSON.stringify(projects, null, 2) + '\n')
      return
    }
    logger.info(pc.bold('Registered team projects'))
    for (const project of projects) {
      logger.info(`- ${project.name}${project.team ? ` (${project.team})` : ''} — ${project.artifactCount} artifact(s) at ${project.path}`)
    }
    logger.info('')
    logger.info('Add projects to .vectalon/team.json to grow the team brain (see `vectalon serve` docs).')
    return
  }

  // ---- default: generate the Team Brain ------------------------------------
  logger.info(pc.bold('vectalon team — Team Brain'))
  logger.info(`project: ${root}`)
  logger.info('')

  const result = await buildTeamBrain(root)
  if (options.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return
  }

  process.stdout.write(renderTeamSummary(result) + '\n')
  logger.info('')
  logger.info(`Docs written to ${pc.dim(teamDocsDir(root))}`)
  if (result.prKnowledge.length > 0) {
    logger.info(`Latest PR: #${result.prKnowledge[0].pr} — ${result.prKnowledge[0].title}`)
  }
  logger.success('Team Brain generated — run `vectalon team --search "<query>"` to query it.')
}
