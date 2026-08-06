import type { ArtifactStore } from '../knowledge/ArtifactStore'
import { parseMetroStats, analyzeBundleStats, formatBytes, formatPct } from '../utils/bundleAnalyzer'
import { getLatestBundleSnapshot, recordBundleSnapshot, bundleDeltaPct } from '../knowledge/bundleHistory'
import { checksum } from '../knowledge/artifactTypes'
import { reportError } from '../utils/safe'
import { diffBundleComposition, proactiveBundleTip } from './bundleDeltas'
import type { IngestResult, MetroEvent } from './types'

/**
 * Metro event ingestion — the daemon's core loop.
 *
 * Every `bundle_build_done` event is parsed into bundle composition, snapshotted
 * into the knowledge base (reusing bundleHistory so the team brain sees it like
 * any other artifact), and diffed against the previous build in this session to
 * surface proactive tips ("your last Metro build added lodash — +80 KB").
 * `bundle_build_failed` events are persisted as build-error artifacts (deduped
 * by content checksum) so failures are never lost.
 */

/** Cap on how many proactive-tip artifacts accumulate before pruning. */
const MAX_INSIGHT_ARTIFACTS = 20

export class MetroEventHandler {
  private store: ArtifactStore
  /** Last analysis per platform in this daemon session (for composition diffs). */
  private lastAnalysis: Map<string, ReturnType<typeof analyzeBundleStats> | null> = new Map()
  private readonly log: { info: (m: string) => void; warn: (m: string) => void; debug: (m: string) => void }
  private eventCount = 0

  constructor(
    store: ArtifactStore,
    log?: { info: (m: string) => void; warn: (m: string) => void; debug: (m: string) => void }
  ) {
    this.store = store
    this.log = log || {
      info: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
    }
  }

  getEventCount(): number {
    return this.eventCount
  }

  /** Handle one Metro event; never throws. */
  handle(event: MetroEvent): IngestResult {
    this.eventCount++
    try {
      if (event.type === 'bundle_build_done') {
        return this.handleBundleDone(event)
      }
      if (event.type === 'bundle_build_failed') {
        return this.handleBundleFailed(event)
      }
    } catch (err) {
      reportError(err, 'daemon: handling metro event', 'warn')
    }
    return { kind: 'ignored', insights: [], artifacts: [] }
  }

  private handleBundleDone(event: Extract<MetroEvent, { type: 'bundle_build_done' }>): IngestResult {
    const platform = event.platform || 'ios'
    const stats = parseMetroStats(event.bundleStats)
    if (!stats) {
      this.log.debug(`daemon: bundle_build_done without parseable bundleStats (${platform}) — ignored`)
      return { kind: 'ignored', insights: [], artifacts: [] }
    }

    const analysis = analyzeBundleStats(stats)
    const previousPersisted = getLatestBundleSnapshot(this.store, platform)
    // Diff against the previous build IN THIS SESSION when available; the
    // persisted snapshot only carries totals, so first-event composition diffs
    // are skipped.
    const previous = this.lastAnalysis.get(platform) || null
    this.lastAnalysis.set(platform, analysis)

    recordBundleSnapshot(this.store, analysis, platform)

    const insights: string[] = []
    const artifacts: string[] = [`Bundle size snapshot: ${platform}`]
    this.log.info(`daemon: bundle ${platform} — ${formatBytes(analysis.totalSize)} across ${analysis.moduleCount} module(s)`)

    let delta
    if (previous) {
      const composition = diffBundleComposition(previous, analysis)
      const tip = proactiveBundleTip(composition)
      if (tip) {
        insights.push(tip)
        artifacts.push(this.recordInsight(tip, platform))
        this.log.warn(`daemon: ${tip}`)
      } else {
        this.log.debug(`daemon: no bundle composition change worth surfacing (${platform})`)
      }
      delta = {
        pct: bundleDeltaPct(previous, analysis),
        previous,
        current: analysis,
      }
      const verb = delta.pct > 0 ? 'increased' : delta.pct < 0 ? 'decreased' : 'unchanged'
      this.log.info(`daemon: bundle ${platform} ${verb} vs previous build (${formatPct(delta.pct)})`)
    } else if (previousPersisted) {
      // No in-session baseline but a persisted one exists — still report the
      // total-size delta vs the last snapshot.
      const pct = bundleDeltaPct(previousPersisted, analysis)
      this.log.info(`daemon: bundle ${platform} vs last snapshot ${formatPct(pct)}`)
    }

    return { kind: 'bundle_done', insights, artifacts, delta }
  }

  private handleBundleFailed(event: Extract<MetroEvent, { type: 'bundle_build_failed' }>): IngestResult {
    const platform = event.platform || 'ios'
    const title = `Metro build error (${platform})`
    // No timestamp in the content — the artifact's createdAt carries it, and a
    // stable body lets identical failures dedupe by checksum.
    const content = `# Metro build error (${platform})\n\nDaemon captured this build failure from the Metro reporter:\n\n\`\`\`\n${event.error.slice(0, 4000)}\n\`\`\`\n\nThe error stays in the knowledge base even if the terminal scrolls past it — repeated identical failures are deduped.`

    // Dedupe identical failures (same error text) so a repeated failing build
    // doesn't spam the artifact store.
    let artifact = ''
    if (!this.store.hasChecksum(checksum(content))) {
      this.store.add({
        type: 'engineering',
        title,
        content,
        source: 'daemon',
        status: 'active',
        meta: { platform, kind: 'metro-build-error' },
      })
      artifact = title
    }
    const insight = `Metro build failed (${platform}): ${event.error.split('\n')[0].slice(0, 200)}`
    this.log.warn(`daemon: ${insight}`)
    return { kind: 'bundle_failed', insights: [insight], artifacts: artifact ? [artifact] : [] }
  }

  /** Persist a proactive insight as a knowledge-base artifact (bounded). */
  private recordInsight(tip: string, platform: string): string {
    const title = `Proactive bundle insight (${platform})`
    this.store.add({
      type: 'engineering',
      title,
      content: `# Proactive bundle insight (${platform})\n\n${tip}\n\nSurfaced automatically by the vectalon daemon.`,
      source: 'daemon',
      status: 'active',
      meta: { platform, kind: 'proactive-bundle-tip' },
    })
    this.trimInsights()
    return title
  }

  private trimInsights(): void {
    const insights = this.store.list().filter(a => a.type === 'engineering' && a.meta?.kind === 'proactive-bundle-tip')
    const excess = insights.length - MAX_INSIGHT_ARTIFACTS
    if (excess <= 0) return
    for (const artifact of insights.slice(0, excess)) {
      this.store.remove(artifact.id)
    }
  }
}
