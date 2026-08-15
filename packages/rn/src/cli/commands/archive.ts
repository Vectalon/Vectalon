/**
 * vectalon archive — Build Archive Agent (Phase 1 of Archive & Share).
 * Business Source License 1.1 (BSL-1.1)
 *
 * Builds (or ingests a pre-built) artifact, computes its SHA-256, writes a
 * typed BuildManifest, and stores both under .vectalon/builds/. Zero-config
 * flavor detection from gradle productFlavors, Xcode schemes, and eas.json
 * build profiles; --list; --init writes flavors.json; --json; reports to
 * docs/vectalon/archive/ (gitignored).
 */
import { resolve } from 'path'
import { printCarbonReport, dim } from '../carbon'
import { archiveBuild, initFlavors } from '../../archive'
import { ArchiveStore, buildsIndexPath } from '../../archive/ArchiveStore'
import type { PlatformName } from '../../archive/types'

export interface ArchiveCommandOptions {
  flavor?: string
  platform?: string
  environment?: string
  envFile?: string
  buildNumber?: number
  noBuild?: boolean
  artifact?: string
  list?: boolean
  init?: boolean
  dryRun?: boolean
  json?: boolean
}

export async function archiveCommand(directory: string, options: ArchiveCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  if (options.init) {
    const result = initFlavors(root)
    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      return
    }
    const body = [`Flavor config written: ${dim(result.path)}`, '']
    if (result.flavors.length === 0) {
      body.push('No flavors auto-detected — add your own to the file, then re-run.')
    } else {
      body.push('Auto-detected flavors (edit to add env files / overrides):')
      for (const f of result.flavors) {
        body.push(`  • ${f.name}${f.android ? ` — android: ${f.android}` : ''}${f.ios ? ` — ios: ${f.ios}` : ''}`)
      }
    }
    printCarbonReport({
      title: 'vectalon archive — flavor config initialized',
      verdict: 'ok',
      lines: body,
      reportPath: result.path,
      root,
      done: 'Flavor config ready — run `vectalon archive` to build and archive.',
    })
    return
  }

  if (options.list) {
    const store = new ArchiveStore(root)
    const builds = store.listBuilds({
      flavor: options.flavor,
      platform: options.platform,
    })
    if (options.json) {
      process.stdout.write(JSON.stringify(builds, null, 2) + '\n')
      return
    }
    const body: string[] = []
    if (builds.length === 0) {
      body.push('No archived builds yet — run `vectalon archive` to create one.')
    }
    for (const b of builds) {
      body.push(
        `  ${b.buildId.slice(0, 8)}  ${b.flavor}/${b.environment}  ${b.platform}  v${b.version} (${b.buildNumber})  ${b.artifactType}  ${formatBytes(b.artifactSize)}`
      )
      body.push(`    ${dim(b.artifactPath)}  sha256 ${b.checksum.slice(0, 12)}…`)
    }
    printCarbonReport({
      title: `vectalon archive — archived builds (${builds.length})`,
      verdict: builds.length > 0 ? 'ok' : 'none',
      lines: body,
      reportPath: buildsIndexPath(root),
      root,
    })
    return
  }

  const report = await archiveBuild(root, {
    flavor: options.flavor,
    platform: options.platform as PlatformName | undefined,
    environment: options.environment,
    envFile: options.envFile,
    buildNumber: options.buildNumber,
    noBuild: options.noBuild,
    artifact: options.artifact,
    dryRun: options.dryRun,
  })

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  if (!report.ok) {
    const body = [report.error ?? 'Archive failed.', '']
    if (report.flavors.length > 0) {
      body.push(`Detected flavors: ${report.flavors.map(f => f.name).join(', ')}`)
    }
    printCarbonReport({
      title: 'vectalon archive — failed',
      verdict: 'failed',
      lines: body,
      reportPath: report.reportPath,
      root,
      done: 'Archive failed — see the report for next steps.',
    })
    return
  }

  const body: string[] = []
  if (report.dryRun) {
    body.push(`Project type: ${report.projectType}`)
    body.push(`Flavors: ${report.flavors.map(f => f.name).join(', ') || '(none)'}`)
    body.push('')
    body.push(`Build command (not run — dry run):`)
    body.push(`  ${report.command ?? '(no command for this project type)'}`)
  } else if (report.manifest) {
    const m = report.manifest
    body.push(`Build:  ${m.flavor}/${m.environment} · ${m.platform} · v${m.version} (${m.buildNumber})`)
    body.push(`Id:     ${m.buildId}`)
    body.push(`Type:   ${m.artifactType} · ${formatBytes(m.artifactSize)}`)
    body.push(`Sha256: ${m.checksum}`)
    body.push(`Git:    ${m.gitBranch} @ ${m.gitCommit.slice(0, 8)}${m.gitTag ? ` (${m.gitTag})` : ''}`)
    body.push(`Built:  ${m.buildTimestamp} by ${m.builtBy}`)
    body.push('')
    body.push(`Artifact: ${m.artifactPath}`)
    if (report.duplicated) {
      body.push('')
      body.push(dim(`Duplicate artifact — already archived as ${report.existingBuildId}.`))
    }
  }

  printCarbonReport({
    title: `vectalon archive — ${report.dryRun ? 'planned' : report.duplicated ? 'duplicate' : 'archived'}`,
    verdict: report.ok ? 'ok' : 'failed',
    lines: body,
    reportPath: report.reportPath,
    root,
    done: report.dryRun
      ? 'Dry run complete — remove --dry-run to build and archive for real.'
      : report.duplicated
        ? 'Nothing new archived — the artifact is already in the store.'
        : 'Archive complete — share it with `vectalon share --host` or `vectalon distribute`.',
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
