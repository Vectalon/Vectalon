/**
 * Archive & Share — distribution orchestrator (Phase 2).
 *
 * Resolves an archived build, picks a distribution target, and delegates to
 * the detected credential provider (fastlane / eas / expo) or the direct
 * store APIs. Under `--dry-run` every target produces its exact plan with
 * zero side effects — this is also what the smoke sweep and MCP tools use by
 * default, so the surface is verifiable without credentials.
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { ArchiveStore } from '../archive/ArchiveStore'
import type { DistributionRecord } from '../archive/types'
import { detectCredentials } from './CredentialDelegator'
import { planTestFlightUpload } from './StoreConnect'
import { planPlayUpload } from './PlayPublisher'
import { SaasClient } from './SaasClient'
import { generatePortal } from '../portal'
import type { DistributeOptions, DistributeReport, DistributeTarget } from './types'

export const distributeDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'distribute')

export const TARGETS: { id: DistributeTarget; tier: 'pro' | 'team'; description: string }[] = [
  { id: 'testflight', tier: 'pro', description: 'Upload an iOS build to TestFlight' },
  { id: 'play-store', tier: 'pro', description: 'Upload an Android build to a Play Store track' },
  { id: 'saas', tier: 'team', description: 'Push a build to builds.vectalon.in for team sharing' },
  { id: 'portal', tier: 'team', description: 'Generate/deploy a white-label build portal' },
]

export async function distributeBuild(
  rootArg: string,
  options: DistributeOptions
): Promise<DistributeReport> {
  const root = resolve(rootArg)
  const store = new ArchiveStore(root)
  const reportPath = join(distributeDocsDir(root), 'report.json')

  const build = options.buildId
    ? store.getBuild(options.buildId)
    : store.resolveLatest({ flavor: options.flavor, platform: options.platform })

  if (!build) {
    const report: DistributeReport = {
      ok: false,
      target: options.target,
      error: options.buildId
        ? `No build found with id ${options.buildId}.`
        : `No archived build found${options.flavor ? ` for flavor ${options.flavor}` : ''}${options.platform ? ` / ${options.platform}` : ''}. Run \`vectalon archive\` first.`,
      reportPath,
    }
    writeDistributeReport(root, report)
    return report
  }

  const report = await runTarget(root, store, build, options)
  if (report.ok && report.distribution) {
    store.updateDistribution(build.buildId, report.distribution)
  }
  writeDistributeReport(root, report)
  return report
}

async function runTarget(
  root: string,
  store: ArchiveStore,
  build: NonNullable<ReturnType<ArchiveStore['resolveLatest']>>,
  options: DistributeOptions
): Promise<DistributeReport> {
  const base: Pick<DistributeReport, 'build' | 'target' | 'reportPath'> = {
    build,
    target: options.target,
    reportPath: join(distributeDocsDir(root), 'report.json'),
  }

  switch (options.target) {
    case 'testflight': {
      if (build.platform !== 'ios') {
        return { ...base, ok: false, error: 'TestFlight distribution requires an iOS (ipa) build.' }
      }
      const creds = detectCredentials({ root, platform: 'ios', target: 'testflight' })
      if (options.dryRun || creds.provider === 'none') {
        const plan: string[] = []
        if (creds.provider === 'fastlane') {
          plan.push(`Delegation: ${creds.delegationCommand} (artifact: ${build.artifactPath})`)
        } else if (creds.provider === 'asc-api') {
          plan.push('Direct App Store Connect API: mint ES256 JWT from APP_STORE_CONNECT_API_KEY')
          plan.push(`Upload: ${build.artifactPath} → TestFlight`)
        } else {
          plan.push('No credential provider detected — dry run, nothing to execute.')
          plan.push(creds.instructions ?? '')
        }
        return { ...base, ok: true, dryRun: true, plan }
      }
      if (creds.provider === 'fastlane') {
        const plan = planTestFlightUpload(build.artifactPath, { hasFastlane: true })
        const result = await executeDelegation(plan.command || '', root)
        if (!result) {
          return { ...base, ok: false, error: 'TestFlight upload failed (see stderr).' }
        }
        const distribution: DistributionRecord = {
          testflight: {
            buildId: build.buildId,
            status: 'uploaded',
            uploadDate: new Date().toISOString(),
          },
        }
        return { ...base, ok: true, distribution }
      }
      const jwt = (() => {
        try {
          return planTestFlightUpload(build.artifactPath, {
            hasFastlane: false,
            ascKeyPath: process.env.APP_STORE_CONNECT_API_KEY,
            ascIssuerId: process.env.APP_STORE_CONNECT_ISSUER_ID,
            ascKeyId: process.env.APP_STORE_CONNECT_KEY_ID,
          }).jwt
        } catch (err) {
          return undefined
        }
      })()
      if (!jwt) {
        return { ...base, ok: false, error: 'Could not mint an App Store Connect JWT — check APP_STORE_CONNECT_API_KEY / ISSUER_ID / KEY_ID.' }
      }
      return {
        ...base,
        ok: true,
        dryRun: true,
        plan: [
          `JWT minted (ES256, kid ${process.env.APP_STORE_CONNECT_KEY_ID}) — ready for the App Store Connect upload API.`,
          'Uploading an IPA requires the Transporter flow; set up Fastlane pilot or altool for the final step.',
        ],
      }
    }

    case 'play-store': {
      if (build.platform !== 'android') {
        return { ...base, ok: false, error: 'Play Store distribution requires an Android (apk/aab) build.' }
      }
      const track = options.track ?? 'internal'
      const creds = detectCredentials({ root, platform: 'android', target: 'play-store' })
      if (options.dryRun || creds.provider === 'none') {
        const plan: string[] = []
        if (creds.provider === 'fastlane') {
          plan.push(`Delegation: fastlane supply --track ${track} --aab ${build.artifactPath}`)
        } else if (creds.provider === 'play-api') {
          plan.push(`Direct Google Play API: service-account JWT → token → upload ${build.artifactPath} to ${track} track`)
        } else {
          plan.push(`No credential provider detected — dry run, nothing to execute (track: ${track}).`)
          plan.push(creds.instructions ?? '')
        }
        return { ...base, ok: true, dryRun: true, plan }
      }
      if (creds.provider === 'fastlane') {
        const plan = planPlayUpload(build.artifactPath, track, { hasFastlane: true })
        const result = await executeDelegation(plan.command || '', root)
        if (!result) {
          return { ...base, ok: false, error: 'Play Store upload failed (see stderr).' }
        }
        const distribution: DistributionRecord = {
          playStore: {
            track,
            versionCode: build.buildNumber,
            status: 'uploaded',
            uploadDate: new Date().toISOString(),
          },
        }
        return { ...base, ok: true, distribution }
      }
      try {
        planPlayUpload(build.artifactPath, track, { hasFastlane: false, serviceAccountPath: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT })
      } catch (err) {
        return { ...base, ok: false, error: (err as Error).message }
      }
      return {
        ...base,
        ok: true,
        dryRun: true,
        plan: [
          'Service account loaded — JWT + token exchange ready for the Android Publisher API.',
          'The direct upload (edits/bundles endpoint) requires a package name; set it up via fastlane supply or pass --track with a configured project.',
        ],
      }
    }

    case 'saas': {
      const saas = new SaasClient({ projectId: build.projectId })
      const plan = saas.describePush(build)
      if (options.dryRun || !saas.ready) {
        return {
          ...base,
          ok: true,
          dryRun: true,
          plan: saas.ready
            ? plan
            : [...plan, 'Set VECTALON_BUILDS_API_KEY or upgrade to Team tier (https://vectalon.in/pricing).'],
        }
      }
      const result = await saas.uploadBuild(build, build.artifactPath)
      if (!result.ok) {
        return { ...base, ok: false, error: result.error }
      }
      const distribution: DistributionRecord = {
        saas: {
          url: result.url as string,
          ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
          access: 'team',
        },
      }
      return { ...base, ok: true, distribution }
    }

    case 'portal': {
      if (options.dryRun) {
        return {
          ...base,
          ok: true,
          dryRun: true,
          plan: [
            `Generate a white-label portal for ${build.projectId} (${build.flavor} builds).`,
            '  npx vectalon portal --generate --out ./portal-site',
            `  Deploy: --deploy --target vercel|netlify|static, domain: ${options.domain ?? 'builds.mycompany.com'}`,
          ],
        }
      }
      const out = resolve(root, options.portalOut || '.vectalon/portal')
      const result = generatePortal({ out, domain: options.domain, builds: store.listBuilds({}) })
      const distribution: DistributionRecord = {
        portal: {
          domain: options.domain ?? 'builds.mycompany.com',
          url: `https://${options.domain ?? 'builds.mycompany.com'}`,
          deployedAt: new Date().toISOString(),
        },
      }
      return { ...base, ok: true, distribution, plan: [`Portal generated at ${out} (${result.fileCount} files). Deploy with --deploy --target vercel|netlify|static.`] }
    }
  }
}

async function executeDelegation(command: string, root: string): Promise<boolean> {
  try {
    const { runCommand } = await import('../adapters/runCommand')
    const result = await runCommand('bash', ['-c', command], { cwd: root })
    return result.success
  } catch {
    return false
  }
}

/** Write the distribution report (report.json + report.md — same surface as every agent). */
export function writeDistributeReport(root: string, report: DistributeReport): void {
  const dir = distributeDocsDir(root)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ ...report, verdict: distributeVerdict(report) }, null, 2) + '\n')
  writeFileSync(join(dir, 'report.md'), renderDistributeReport(report))
}

/** Map a distribution outcome to the site's verdict vocabulary. */
export function distributeVerdict(report: DistributeReport): 'approved' | 'changes-requested' {
  return report.ok ? 'approved' : 'changes-requested'
}

/** Markdown rendering of a distribution report (matches the JSON, GitHub-renderable). */
export function renderDistributeReport(report: DistributeReport): string {
  const lines: string[] = ['# vectalon distribute — Distribution', '']
  const verdict = report.ok ? (report.dryRun ? 'approved (dry-run)' : 'approved') : 'changes-requested'
  lines.push(`Target: **${report.target}**  ·  Verdict: **${verdict}**`)
  if (report.build) {
    const b = report.build
    lines.push(`Build: **#${b.buildNumber}** (${b.version})  ·  ${b.platform} · ${b.flavor} · ${b.environment}  ·  ${b.artifactType} · \`${b.buildId}\``)
  }
  if (report.plan && report.plan.length > 0) {
    lines.push('', '## Plan')
    for (const step of report.plan) lines.push(`- ${step}`)
  }
  if (report.distribution) {
    const d = report.distribution
    lines.push('', '## Distribution')
    if (d.testflight) lines.push(`- TestFlight: ${d.testflight.status} (${d.testflight.buildId})`)
    if (d.playStore) lines.push(`- Play Store: ${d.playStore.status} on ${d.playStore.track} (versionCode ${d.playStore.versionCode})`)
    if (d.saas) lines.push(`- SaaS: ${d.saas.access} — ${d.saas.url}${d.saas.expiresAt ? ` (expires ${d.saas.expiresAt})` : ''}`)
    if (d.portal) lines.push(`- Portal: ${d.portal.url} (${d.portal.domain})`)
  }
  if (report.error) lines.push('', '## Error', '', report.error)
  lines.push('')
  if (report.dryRun) lines.push('> Dry run — no side effects. Remove `--dry-run` to execute for real (credentials are never stored).')
  return lines.join('\n') + '\n'
}

export function listTargets(): { id: DistributeTarget; tier: 'pro' | 'team'; description: string }[] {
  return TARGETS
}
