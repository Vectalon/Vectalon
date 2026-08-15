/**
 * vectalon distribute — Distribution Agent (Phase 2 of Archive & Share).
 * Business Source License 1.1 (BSL-1.1)
 *
 * Deploys an archived build to TestFlight, the Play Store, the SaaS portal,
 * or a generated white-label portal. Credentials are never stored — the
 * command detects Fastlane/EAS/Expo or the direct API env vars and delegates
 * (or prints actionable instructions). --dry-run plans without side effects;
 * --json; reports to docs/vectalon/distribute/ (gitignored).
 */
import { join, resolve } from 'path'
import { printCarbonReport, dim } from '../carbon'
import { distributeBuild, listTargets } from '../../distribute'
import type { DistributeTarget } from '../../distribute/types'

export interface DistributeCommandOptions {
  build?: string
  latest?: boolean
  flavor?: string
  platform?: string
  target?: string
  track?: string
  domain?: string
  listTargets?: boolean
  dryRun?: boolean
  json?: boolean
}

export async function distributeCommand(directory: string, options: DistributeCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  if (options.listTargets) {
    if (options.json) {
      process.stdout.write(JSON.stringify(listTargets(), null, 2) + '\n')
      return
    }
    const body = listTargets().map(t => `  • ${t.id.padEnd(12)} [${t.tier}] ${t.description}`)
    printCarbonReport({
      title: 'vectalon distribute — available targets',
      verdict: 'ok',
      lines: body,
      reportPath: join(root, 'docs', 'vectalon', 'distribute', 'report.json'),
      root,
      done: 'Pick a target: --target testflight|play-store|saas|portal',
    })
    return
  }

  const target = (options.target || 'testflight') as DistributeTarget
  if (!['testflight', 'play-store', 'saas', 'portal'].includes(target)) {
    console.error(`Unknown target: ${target}. Choose from: ${listTargets().map(t => t.id).join(', ')}`)
    process.exit(1)
  }

  const report = await distributeBuild(root, {
    buildId: options.build,
    latest: options.latest ?? !options.build,
    flavor: options.flavor,
    platform: options.platform as 'ios' | 'android' | undefined,
    target,
    track: options.track as 'internal' | 'alpha' | 'beta' | 'production' | undefined,
    domain: options.domain,
    dryRun: options.dryRun,
  })

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  if (!report.ok) {
    printCarbonReport({
      title: `vectalon distribute — ${target} failed`,
      verdict: 'failed',
      lines: [report.error ?? 'Distribution failed.', ''],
      reportPath: report.reportPath,
      root,
      done: 'Distribution failed — see the report for next steps.',
    })
    return
  }

  const body: string[] = []
  if (report.build) {
    const b = report.build
    body.push(`Build:  ${b.flavor}/${b.environment} · ${b.platform} · v${b.version} (${b.buildNumber})`)
    body.push(`Id:     ${b.buildId.slice(0, 12)}…`)
    body.push('')
  }
  if (report.plan) {
    body.push(report.dryRun ? 'Plan (dry run — nothing executed):' : 'Executed:')
    for (const line of report.plan) body.push(`  ${line}`)
  }
  if (report.distribution?.testflight) {
    body.push(`TestFlight: ${report.distribution.testflight.status}`)
  }
  if (report.distribution?.playStore) {
    body.push(`Play Store (${report.distribution.playStore.track}): ${report.distribution.playStore.status} · versionCode ${report.distribution.playStore.versionCode}`)
  }
  if (report.distribution?.saas) {
    body.push(`SaaS: ${dim(report.distribution.saas.url)}`)
  }
  if (report.distribution?.portal) {
    body.push(`Portal: ${dim(report.distribution.portal.url)}`)
  }

  printCarbonReport({
    title: `vectalon distribute — ${target} ${report.dryRun ? 'planned' : 'done'}`,
    verdict: report.ok ? 'ok' : 'failed',
    lines: body,
    reportPath: report.reportPath,
    root,
    done: report.dryRun
      ? 'Dry run complete — remove --dry-run to distribute for real.'
      : 'Distribution complete — the build manifest is updated.',
  })
}


