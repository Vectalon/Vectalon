/**
 * Archive & Share — archive orchestrator (Phase 1).
 *
 * The single entry point behind `vectalon archive`, the archive_build MCP
 * tool, and the VS Code command. Deterministic and side-effect-light under
 * `--dry-run`: it plans the build, computes the manifest, and only writes to
 * the store / copies artifacts when actually archiving.
 */

import { createHash, randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, statSync, copyFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { runCommand } from '../adapters/runCommand'
import { ArchiveStore, artifactStorePath } from './ArchiveStore'
import { createBuildManifest } from './BuildManifest'
import { detectFlavors, resolveFlavor } from './FlavorDetector'

export { detectFlavors } from './FlavorDetector'
import { detectProjectType, findBuiltArtifact, planBuild, runBuildCommand } from './BuildExecutor'
import type { BuildManifest, PlatformName } from './types'

export interface ArchiveBuildOptions {
  flavor?: string
  platform?: PlatformName
  environment?: string
  envFile?: string
  buildNumber?: number
  noBuild?: boolean
  artifact?: string
  dryRun?: boolean
}

export interface ArchiveReport {
  ok: boolean
  error?: string
  dryRun?: boolean
  manifest?: BuildManifest
  command?: string
  projectType?: string
  flavors: { name: string; android?: string; ios?: string; isDefault?: boolean }[]
  duplicated?: boolean
  existingBuildId?: string
  reportPath: string
}

export const archiveDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'archive')

/** projectId from .vectalon/rn-vectalon.json projectName (slugged) or package.json name. */
export function readProjectId(root: string): string {
  const configPath = join(root, '.vectalon', 'rn-vectalon.json')
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { projectName?: string }
      if (cfg.projectName) return slug(cfg.projectName)
    } catch {
      /* fall through */
    }
  }
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string }
      if (pkg.name) return slug(pkg.name)
    } catch {
      /* fall through */
    }
  }
  return 'unknown-project'
}

export function readProjectVersion(root: string): string {
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string }
      if (pkg.version) return pkg.version
    } catch {
      /* fall through */
    }
  }
  return '0.0.0'
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
}

export interface GitMetadata {
  commit: string
  branch: string
  tag?: string
  builtBy: string
}

export async function readGitMetadata(root: string): Promise<GitMetadata> {
  const commit = await gitSafe(['rev-parse', 'HEAD'], root)
  const branch = await gitSafe(['branch', '--show-current'], root)
  const tag = await gitSafe(['describe', '--tags', '--exact-match', 'HEAD'], root)
  const user = await gitSafe(['config', 'user.email'], root)
  return {
    commit: commit || 'unknown',
    branch: branch || 'detached',
    ...(tag ? { tag } : {}),
    builtBy: user || process.env.GITHUB_ACTOR || 'unknown',
  }
}

async function gitSafe(args: string[], cwd: string): Promise<string | null> {
  try {
    const result = await runCommand('git', args, { cwd, timeout: 10_000 })
    const out = result.stdout.trim()
    return result.success && out ? out : null
  } catch {
    return null
  }
}

export function computeChecksum(filePath: string): string {
  const content = readFileSync(filePath)
  return createHash('sha256').update(content).digest('hex')
}

/** Next build number for a flavor+platform: max existing + 1, or an override. */
export function nextBuildNumber(
  store: ArchiveStore,
  flavor: string,
  platform: string,
  override?: number
): number {
  if (override !== undefined && Number.isInteger(override) && override > 0) return override
  const builds = store.listBuilds({ flavor, platform })
  return builds.reduce((max, b) => Math.max(max, b.buildNumber), 0) + 1
}

/** Load an env file (KEY=VALUE lines) for the build command. */
export function loadEnvFile(root: string, envFile?: string): Record<string, string> {
  const vars: Record<string, string> = {}
  if (!envFile) return vars
  const p = resolve(root, envFile)
  if (!existsSync(p)) return vars
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq > 0) vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return vars
}

function envPrefix(vars: Record<string, string>): string {
  const keys = Object.keys(vars)
  if (keys.length === 0) return ''
  return `export ${keys.map(k => `${k}="${vars[k]}"`).join(' ')}; `
}

export async function archiveBuild(rootArg: string, options: ArchiveBuildOptions): Promise<ArchiveReport> {
  const root = resolve(rootArg)
  const store = new ArchiveStore(root)
  const flavorsResult = detectFlavors(root)
  const flavor = resolveFlavor(flavorsResult.flavors, options.flavor)
  const projectType = detectProjectType(root)
  const platform: PlatformName = options.platform ?? 'android'
  const environment = options.environment ?? 'release'
  const reportPath = join(archiveDocsDir(root), 'report.json')

  if (!flavor) {
    const report: ArchiveReport = {
      ok: false,
      error:
        'No flavors detected. Run `vectalon archive --init` to create .vectalon/builds/flavors.json, or pass --flavor with a named build variant.',
      flavors: flavorsResult.flavors,
      reportPath,
    }
    writeArchiveReport(root, report)
    return report
  }

  const plan = planBuild(root, projectType, flavor, environment, platform)
  const command = plan ? plan.command : null
  const envVars = loadEnvFile(root, options.envFile)

  if (options.dryRun) {
    const report: ArchiveReport = {
      ok: true,
      dryRun: true,
      projectType,
      flavors: flavorsResult.flavors,
      command: command ? envPrefix(envVars) + command : undefined,
      reportPath,
    }
    writeArchiveReport(root, report)
    return report
  }

  // Resolve the artifact: given --artifact, auto-found, or built now.
  let artifactPath: string | null = options.artifact ? resolve(root, options.artifact) : null
  if (!artifactPath) artifactPath = findBuiltArtifact(root, platform, flavor)

  if (!options.noBuild && !artifactPath && command) {
    const fullCommand = envPrefix(envVars) + command
    const result = await runBuildCommand(fullCommand, root)
    if (!result.success) {
      const report: ArchiveReport = {
        ok: false,
        error: `Build failed (exit ${result.stderr ? 'see stderr' : 'unknown'}). Capture the log and run \`vectalon build-fix --log <file>\` to classify the root cause.`,
        command: fullCommand,
        projectType,
        flavors: flavorsResult.flavors,
        reportPath,
      }
      writeArchiveReport(root, report)
      return report
    }
    artifactPath = findBuiltArtifact(root, platform, flavor)
  }

  if (!artifactPath || !existsSync(artifactPath) || !statSync(artifactPath).isFile()) {
    const report: ArchiveReport = {
      ok: false,
      error:
        'No artifact found. Pass --artifact <path> to archive a pre-built file, or run the build first (--no-build archives the existing artifact).',
      command: command ?? undefined,
      projectType,
      flavors: flavorsResult.flavors,
      reportPath,
    }
    writeArchiveReport(root, report)
    return report
  }

  const artifactType = platform === 'ios' ? 'ipa' : (artifactPath.endsWith('.aab') ? 'aab' : 'apk')
  const checksum = computeChecksum(artifactPath)
  const git = await readGitMetadata(root)
  const projectId = readProjectId(root)
  const version = readProjectVersion(root)
  const buildNumber = nextBuildNumber(store, flavor.name, platform, options.buildNumber)
  const size = statSync(artifactPath).size

  const manifest = createBuildManifest({
    projectId,
    version,
    buildNumber,
    flavor: flavor.name,
    environment,
    platform,
    artifactType,
    artifactPath: artifactPath, // updated below after the store copy
    artifactSize: size,
    checksum,
    gitCommit: git.commit,
    gitBranch: git.branch,
    ...(git.tag ? { gitTag: git.tag } : {}),
    builtBy: git.builtBy,
    buildDurationMs: undefined,
    metadata: {
      nodeVersion: process.version,
      reactNativeVersion: undefined,
      expoSdkVersion: undefined,
      nativeConfig: {},
    },
  })

  // Copy the artifact into the store layout and fix the manifest path.
  const destDir = artifactStorePath(root, manifest)
  mkdirSync(destDir, { recursive: true })
  const ext = platform === 'ios' ? 'ipa' : artifactPath.endsWith('.aab') ? 'aab' : 'apk'
  const destFile = join(destDir, `app.${ext}`)
  copyFileSync(artifactPath, destFile)
  writeFileSync(`${destFile}.sha256`, `${checksum}  ${ext === 'ipa' ? 'app.ipa' : `app.${ext}`}\n`)
  manifest.artifactPath = destFile
  manifest.artifactSize = statSync(destFile).size

  const stored = store.addBuild(manifest)
  const finalManifest = stored.duplicated ? (store.getBuild(stored.buildId) as BuildManifest) : manifest

  // Store the detected flavors so users can edit them.
  if (flavorsResult.source === 'auto-detected') {
    store.saveFlavors(flavorsResult.flavors)
  }

  const report: ArchiveReport = {
    ok: true,
    manifest: finalManifest,
    command: command ? envPrefix(envVars) + command : undefined,
    projectType,
    flavors: flavorsResult.flavors,
    duplicated: stored.duplicated,
    existingBuildId: stored.existingBuildId,
    reportPath,
  }
  writeArchiveReport(root, report)
  return report
}

/** Write the archive report (report.json + report.md — same surface as every agent). */
export function writeArchiveReport(root: string, report: ArchiveReport): void {
  const dir = archiveDocsDir(root)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ ...report, verdict: archiveVerdict(report) }, null, 2) + '\n')
  writeFileSync(join(dir, 'report.md'), renderArchiveReport(report))
}

/** Map an archive outcome to the site's verdict vocabulary. */
export function archiveVerdict(report: ArchiveReport): 'approved' | 'changes-requested' {
  return report.ok ? 'approved' : 'changes-requested'
}

/** Markdown rendering of an archive report (matches the JSON, GitHub-renderable). */
export function renderArchiveReport(report: ArchiveReport): string {
  const lines: string[] = ['# vectalon archive — Build Archive', '']
  const verdict = report.ok ? (report.dryRun ? 'approved (dry-run)' : 'approved') : 'changes-requested'
  lines.push(`Verdict: **${verdict}**  ·  Project: ${report.manifest?.projectId ?? '—'}  ·  Flavor: ${report.manifest?.flavor ?? '—'}`)
  if (report.manifest) {
    const m = report.manifest
    lines.push(`Build: **#${m.buildNumber}** (${m.version})  ·  ${m.platform} · ${m.environment}  ·  ${m.artifactType} · ${formatBytes(m.artifactSize)}`)
    lines.push(`SHA-256: \`${m.checksum}\``)
    lines.push(`Git: ${m.gitCommit} on ${m.gitBranch}${m.gitTag ? ` (tag ${m.gitTag})` : ''}  ·  built by ${m.builtBy}`)
    lines.push(`Stored: \`${m.artifactPath}\``)
  }
  if (report.command) {
    lines.push('')
    lines.push(report.dryRun ? `Dry-run command: \`${report.command}\`` : `Planned build command (skipped — artifact provided): \`${report.command}\``)
  }
  if (report.error) lines.push('', `## Error`, '', report.error)
  lines.push('')
  lines.push('## Flavors')
  if (report.flavors.length === 0) {
    lines.push('', '- None detected — run `vectalon archive --init` to write flavors.json, or pass `--flavor` with a named variant.')
  } else {
    for (const f of report.flavors) {
      lines.push(`- ${f.name}${f.isDefault ? ' (default)' : ''}${f.android ? ` — android: ${f.android}` : ''}${f.ios ? ` — ios: ${f.ios}` : ''}`)
    }
  }
  return lines.join('\n') + '\n'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Create .vectalon/builds/flavors.json from auto-detected flavors (archive --init). */
export function initFlavors(rootArg: string): { path: string; flavors: { name: string; android?: string; ios?: string }[] } {
  const root = resolve(rootArg)
  const store = new ArchiveStore(root)
  const { flavors } = detectFlavors(root)
  store.saveFlavors(flavors)
  return { path: join(root, '.vectalon', 'builds', 'flavors.json'), flavors }
}

/** Generate a buildId for the SaasClient / portal surfaces (uuid v4). */
export function generateBuildId(): string {
  return randomUUID()
}
