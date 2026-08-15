/**
 * BuildExecutor — wraps platform build commands (Phase 1).
 *
 * Never builds anything itself (per the design doc's non-goals): it detects
 * the project type, constructs the exact gradle / xcodebuild / eas command
 * for a flavor × environment × platform, and locates the resulting artifact.
 * `--dry-run` surfaces the command without running it.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { runCommand } from '../adapters/runCommand'
import type { ArtifactType, BuildTarget, FlavorConfig, PlatformName } from './types'

export type ProjectType = 'expo' | 'bare' | 'unknown'

export interface BuildPlan {
  target: BuildTarget
  command: string
  cwd: string
  expectedArtifact?: ArtifactType
}

export function detectProjectType(root: string): ProjectType {
  if (existsSync(join(root, 'eas.json'))) return 'expo'
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { dependencies?: Record<string, unknown> }
      if (pkg.dependencies && 'expo' in pkg.dependencies) return 'expo'
    } catch {
      /* fall through to directory checks */
    }
  }
  if (existsSync(join(root, 'android')) && existsSync(join(root, 'ios'))) return 'bare'
  return 'unknown'
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** First Xcode workspace name under ios/ (or empty). */
function findWorkspaceName(root: string): string | null {
  const iosDir = join(root, 'ios')
  if (!existsSync(iosDir)) return null
  const entry = readdirSync(iosDir).find(f => f.endsWith('.xcworkspace'))
  return entry ? entry.replace(/\.xcworkspace$/, '') : null
}

/** Build the exact command for a flavor × environment × platform. */
export function planBuild(
  root: string,
  projectType: ProjectType,
  flavor: FlavorConfig,
  environment: string,
  platform: PlatformName
): BuildPlan | null {
  const env = environment || 'release'
  switch (projectType) {
    case 'expo': {
      const profile = flavor.name
      const command = `eas build --platform ${platform} --profile ${profile} --non-interactive`
      return {
        target: {
          projectType,
          buildCommand: command,
          artifactGlobs: platform === 'ios' ? ['*.ipa'] : ['*.apk', '*.aab'],
        },
        command,
        cwd: root,
        expectedArtifact: platform === 'ios' ? 'ipa' : 'apk',
      }
    }
    case 'bare': {
      if (platform === 'android') {
        const flavorUpper = flavor.android ? capitalize(flavor.android) : capitalize(flavor.name)
        const envUpper = capitalize(env)
        const command = `cd android && ./gradlew assemble${flavorUpper}${envUpper} bundle${flavorUpper}${envUpper}`
        return {
          target: {
            projectType,
            buildCommand: command,
            artifactGlobs: ['**/outputs/apk/**/*.apk', '**/outputs/bundle/**/*.aab'],
          },
          command,
          cwd: root,
          expectedArtifact: 'apk',
        }
      }
      const workspace = findWorkspaceName(root)
      const scheme = flavor.ios ?? flavor.name
      const command = workspace
        ? `cd ios && xcodebuild -workspace ${workspace}.xcworkspace -scheme ${scheme} -configuration ${capitalize(env)} -archivePath ${workspace}.xcarchive archive && xcodebuild -exportArchive -archivePath ${workspace}.xcarchive -exportPath ./export -exportOptionsPlist exportOptions.plist`
        : `cd ios && xcodebuild -scheme ${scheme} -configuration ${capitalize(env)} -archivePath ./build/${scheme}.xcarchive archive`
      return {
        target: {
          projectType,
          buildCommand: command,
          artifactGlobs: ['**/export/*.ipa', '**/build/**/*.ipa'],
        },
        command,
        cwd: root,
        expectedArtifact: 'ipa',
      }
    }
    default:
      return null
  }
}

/**
 * Locate a build artifact under the project. Checks the standard gradle and
 * xcode output paths; returns the first match for the platform.
 */
export function findBuiltArtifact(root: string, platform: PlatformName, flavor: FlavorConfig): string | null {
  const candidates: string[] = []
  if (platform === 'android') {
    candidates.push(
      join(root, 'android', 'app', 'build', 'outputs', 'apk'),
      join(root, 'android', 'app', 'build', 'outputs', 'bundle')
    )
  } else {
    candidates.push(
      join(root, 'ios', 'export'),
      join(root, 'ios', 'build'),
      join(root, 'ios', 'DerivedData')
    )
  }
  const exts = platform === 'android' ? ['.apk', '.aab'] : ['.ipa']
  const found: string[] = []
  const walk = (dir: string): void => {
    if (found.length > 0) return
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      let isDir = false
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue
      }
      if (isDir) {
        if (entry === 'intermediates' || entry.startsWith('.')) continue
        walk(full)
      } else if (exts.some(e => entry.endsWith(e))) {
        found.push(full)
      }
    }
  }
  for (const c of candidates) walk(c)
  // Prefer a flavor-matching artifact when a flavor name is present in the path.
  if (flavor.android || flavor.ios) {
    const flavorName = platform === 'android' ? flavor.android : flavor.ios
    const match = found.find(p => p.toLowerCase().includes((flavorName || flavor.name).toLowerCase()))
    if (match) return match
  }
  return found[0] ?? null
}

/** Run a shell command (used by archive when not in dry-run). */
export async function runBuildCommand(command: string, cwd: string): Promise<{ success: boolean; stdout: string; stderr: string }> {
  // The plan commands use `cd x && …` shell forms; execute through bash -c.
  const result = await runCommand('bash', ['-c', command], { cwd })
  return { success: result.success, stdout: result.stdout, stderr: result.stderr }
}
