/**
 * vectalon play-store — Deep Play Store Readiness Agent (Roadmap Phase 10,
 * item 087) — Business Source License 1.1 (BSL-1.1)
 *
 * A Play-Store-specific deep check beyond the shared app-store surface:
 * manifest permissions (and the data-safety form they imply), exported
 * components, backup rules, network security config, SDK target levels,
 * signing, and the store-listing assets (icon / feature graphic /
 * screenshots / listing text). Deterministic — no model calls.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import type { PlayFinding, PlayReport, PlayStoreCheck } from './types'

export type { PlayFinding, PlayReport, PlayStoreCheck } from './types'

/** Where play-store reports are written. */
export const playDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'play-store')

/** Permissions that trigger Google Play's data-safety declaration. */
const DATA_SAFETY_PERMISSIONS = [
  'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA', 'RECORD_AUDIO',
  'READ_CONTACTS', 'READ_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO',
  'READ_PHONE_STATE', 'READ_SMS', 'RECEIVE_SMS', 'READ_CALENDAR', 'ACTIVITY_RECOGNITION',
  'BODY_SENSORS', 'READ_HEALTH_DATA', 'UWB_RANGING', 'NEARBY_WIFI_DEVICES',
]

const ASSET_SPECS: Array<{ id: string; label: string; minWidth: number; minHeight: number; hint: string }> = [
  { id: 'icon-512', label: 'Store icon (512×512)', minWidth: 512, minHeight: 512, hint: 'Full-bleed 512×512 PNG without transparency; 1024×1024 optional.' },
  { id: 'feature-graphic', label: 'Feature graphic (1024×500)', minWidth: 1024, minHeight: 500, hint: '1024×500 PNG/JPG, no text in the top/bottom 16% safe zone.' },
]

/** Find files under android/ recursively by regex on the basename. */
function findAndroidFiles(root: string, name: RegExp): string[] {
  const base = join(root, 'android')
  if (!existsSync(base)) return []
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === '.gradle') continue
        walk(p)
      } else if (name.test(entry.name)) {
        out.push(p)
      }
    }
  }
  walk(base)
  return out
}

/** Dimensions of a PNG (returns width/height from the IHDR chunk). */
export function pngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/** Measure a candidate image; tolerant of non-PNG or unreadable files. */
function measureImage(path: string): { width: number; height: number } | null {
  try {
    const buf = readFileSync(path)
    if (buf.subarray(0, 2).toString() === 'BM') {
      // BMP: width at 18, height at 22.
      return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) }
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) return null // JPEG — dimensions not parsed here
    return pngDimensions(buf)
  } catch {
    return null
  }
}

/** Run the deep Play Store pass. */
export function runPlayScan(root: string): PlayReport {
  const scannedAt = Date.now()
  const findings: PlayFinding[] = []
  const checks: PlayStoreCheck[] = []
  const push = (id: string, status: 'pass' | 'warn' | 'fail' | 'info' | 'error' | 'warning', label: string, message: string, suggestion: string) => {
    const normalized = status === 'error' ? 'fail' : status === 'warning' ? 'warn' : status
    checks.push({ id, label, status: normalized, message, suggestion })
    const severity: PlayFinding['severity'] = normalized === 'fail' ? 'error' : normalized === 'warn' ? 'warning' : 'info'
    if (normalized !== 'pass') findings.push({ id, severity, message, suggestion })
  }

  // --- AndroidManifest ---------------------------------------------------
  const manifests = findAndroidFiles(root, /^AndroidManifest\.xml$/)
  const manifest = manifests.find(p => p.includes('main')) ?? manifests[0]
  if (!manifest) {
    push('manifest', 'error', 'AndroidManifest.xml', 'No AndroidManifest.xml found under android/', 'Create the manifest in android/app/src/main/ — Play submission requires it.')
    return { scannedAt, root, checks, findings, verdict: 'changes-requested', summary: { total: findings.length, bySeverity: { error: findings.length } } }
  }
  const xml = readFileSync(manifest, 'utf-8')
  const pkg = xml.match(/package\s*=\s*"([^"]+)"/)?.[1]
  push('package', pkg ? 'pass' : 'error', 'Package id', pkg ? `applicationId: ${pkg}` : 'No package attribute on <manifest>', 'Add the package/namespace attribute — Play keys submissions to it.')

  const perms = [...xml.matchAll(/android:name\s*=\s*"android\.permission\.([^"]+)"/g)].map(m => m[1])
  const dataSafety = perms.filter(p => DATA_SAFETY_PERMISSIONS.some(d => p === d || p.endsWith(d)))
  if (dataSafety.length > 0) {
    push('data-safety', 'warning', 'Data-safety permissions', `${dataSafety.length} sensitive permission(s) declared: ${dataSafety.join(', ')}`, 'Declare these in the Play Console data-safety form (collected/shared data, purpose, retention).')
  } else {
    push('data-safety', 'pass', 'Data-safety permissions', 'No sensitive permissions declared', 'No data-safety form fields triggered by the manifest.')
  }

  // Exported components without a permission guard.
  const exported = [...xml.matchAll(/<(activity|service|receiver)[^>]*android:exported\s*=\s*"true"[^>]*>/g)].map(m => m[0])
  if (exported.length > 0) {
    const guarded = exported.filter(e => /android:permission\s*=/.test(e)).length
    if (exported.length > guarded) {
      push('exported', 'warning', 'Exported components', `${exported.length - guarded} exported component(s) without a permission guard`, 'Add android:permission or narrow intent filters — unguarded exported components are a Play security review flag.')
    } else {
      push('exported', 'pass', 'Exported components', 'All exported components carry a permission guard', 'Good.')
    }
  }

  if (/android:allowBackup\s*=\s*"true"/.test(xml)) {
    push('backup', 'warning', 'Backup rules', 'allowBackup=true with no data-extraction rules', 'Add fullBackupContent/dataExtractionRules or set allowBackup=false — backup can leak app-private data.')
  } else if (/allowBackup\s*=\s*"false"/.test(xml)) {
    push('backup', 'pass', 'Backup rules', 'allowBackup=false', 'Backups are disabled — private data stays on-device.')
  } else {
    push('backup', 'info', 'Backup rules', 'allowBackup not declared (defaults to true)', 'Explicitly set allowBackup and add dataExtractionRules for Android 12+.')
  }

  if (/usesCleartextTraffic\s*=\s*"true"/.test(xml)) {
    push('cleartext', 'warning', 'Cleartext traffic', 'usesCleartextTraffic=true on the application', 'Remove it or scope with networkSecurityConfig — Play flags unencrypted traffic.')
  }

  // --- Gradle: SDK levels + signing --------------------------------------
  const gradleFiles = findAndroidFiles(root, /^build\.gradle(\.kts)?$/)
  const appGradle = gradleFiles.find(p => /\/app\//.test(p)) ?? gradleFiles[0]
  if (appGradle) {
    const gradle = readFileSync(appGradle, 'utf-8')
    const targetSdk = gradle.match(/targetSdk(?:Version)?\s+(?:=\s+)?(\d+)/)?.[1]
    const compileSdk = gradle.match(/compileSdk(?:Version)?\s+(?:=\s+)?(\d+)/)?.[1]
    const minSdk = gradle.match(/minSdk(?:Version)?\s+(?:=\s+)?(\d+)/)?.[1]
    if (targetSdk) {
      const t = Number(targetSdk)
      push('target-sdk', t >= 34 ? 'pass' : 'warning', 'Target SDK', `targetSdk ${t}`, 'Google Play requires targetSdk >= 34 for new apps/updates; bump and test against the new API level.')
    } else {
      push('target-sdk', 'info', 'Target SDK', 'targetSdk not found in app build.gradle', 'Declare targetSdk in the app module.')
    }
    push('compile-sdk', compileSdk ? 'pass' : 'info', 'Compile SDK', compileSdk ? `compileSdk ${compileSdk}` : 'compileSdk not found', 'Declare compileSdk so the build targets a concrete API level.')
    push('min-sdk', minSdk ? 'pass' : 'info', 'Min SDK', minSdk ? `minSdk ${minSdk}` : 'minSdk not found', 'Declare minSdk to define the supported device range.')
    if (/signingConfigs|signingConfig\s/.test(gradle)) {
      push('signing', 'pass', 'Signing config', 'signingConfigs block present', 'Good.')
    } else {
      push('signing', 'warning', 'Signing config', 'No signingConfigs block in app build.gradle', 'Configure an upload key + signingConfig so Play can accept the AAB (use a keystore kept out of the repo).')
    }
    const versionCode = gradle.match(/versionCode\s+(\d+)/)?.[1]
    push('version-code', versionCode ? 'pass' : 'error', 'Version code', versionCode ? `versionCode ${versionCode}` : 'versionCode missing', 'versionCode must increment for every upload — Play rejects a reused code.')
  }

  // --- Store-listing assets ---------------------------------------------
  const assetRoots = [
    join(root, 'play'), join(root, 'store'), join(root, 'fastlane', 'metadata', 'android'),
    join(root, 'android', 'app', 'src', 'main', 'play'),
  ]
  const foundAssets = new Set<string>()
  for (const dir of assetRoots) {
    if (!existsSync(dir)) continue
    const walk = (current: string): void => {
      let entries: string[]
      try {
        entries = readdirSync(current)
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry.startsWith('.')) continue
        const full = join(current, entry)
        let stat: ReturnType<typeof statSync>
        try {
          stat = statSync(full)
        } catch {
          continue
        }
        if (stat.isDirectory()) {
          walk(full)
        } else if (/\.(png|jpg|jpeg|webp)$/i.test(entry)) {
          foundAssets.add(relative(root, full).replace(/\\/g, '/').toLowerCase())
        }
      }
    }
    walk(dir)
  }

  // Icon / feature graphic with measured dimensions (resolve relative paths
  // against the project root before reading).
  const measureAsset = (rel: string): { width: number; height: number } | null => measureImage(join(root, rel))
  const iconCandidates = [...foundAssets].filter(f => /(icon|ic_launcher|store[-_]?icon)/.test(f)).sort()
  const iconFile = iconCandidates[0]
  if (iconFile) {
    const dim = measureAsset(iconFile)
    const ok = dim && dim.width >= ASSET_SPECS[0].minWidth && dim.height >= ASSET_SPECS[0].minHeight
    push('icon', ok ? 'pass' : 'warning', 'Store icon', iconFile + (dim ? ` (${dim.width}×${dim.height})` : ' (unmeasurable)'), ASSET_SPECS[0].hint)
  } else {
    push('icon', 'warning', 'Store icon', 'No store icon asset found (play/, store/, fastlane/metadata/android/)', ASSET_SPECS[0].hint)
  }

  const featureCandidates = [...foundAssets].filter(f => /(feature|banner|header)/.test(f)).sort()
  const featureFile = featureCandidates[0]
  if (featureFile) {
    const dim = measureAsset(featureFile)
    const ok = dim && dim.width >= ASSET_SPECS[1].minWidth && dim.height >= ASSET_SPECS[1].minHeight
    push('feature-graphic', ok ? 'pass' : 'warning', 'Feature graphic', featureFile + (dim ? ` (${dim.width}×${dim.height})` : ' (unmeasurable)'), ASSET_SPECS[1].hint)
  } else {
    push('feature-graphic', 'info', 'Feature graphic', 'No feature-graphic asset found', ASSET_SPECS[1].hint)
  }

  const screenshots = [...foundAssets].filter(f => /(screen|phone-?[0-9]|screenshot)/.test(f)).length
  push('screenshots', screenshots >= 2 ? 'pass' : 'info', 'Screenshots', screenshots > 0 ? `${screenshots} screenshot asset(s)` : 'No screenshot assets found', 'Provide at least 2 phone screenshots (and tablet screenshots for tablets) in the listing.')

  // Listing text (fastlane metadata or a plain listing dir).
  const listingText = ['short_description.txt', 'full_description.txt', 'title.txt'].some(n =>
    assetRoots.some(dir => existsSync(join(dir, n)))
  )
  push('listing-text', listingText ? 'pass' : 'info', 'Listing text', listingText ? 'short/full description present' : 'No short_description.txt / full_description.txt', 'Write a short (80 chars) and full (4000 chars) description — they drive Play search ranking.')

  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  const verdict: PlayReport['verdict'] = findings.some(f => f.severity === 'error') ? 'changes-requested' : findings.some(f => f.severity === 'warning') ? 'needs-attention' : 'approved'
  return { scannedAt, root, checks, findings, verdict, summary: { total: findings.length, bySeverity } }
}

/** Render the play-store report as markdown. */
export function renderPlayMarkdown(report: PlayReport): string {
  const lines = ['# vectalon play-store — Deep Play Store Readiness', '']
  lines.push(`Checks: ${report.checks.length}  ·  Verdict: **${report.verdict}**`, '', '| Check | Status | Detail |', '|---|---|---|')
  for (const c of report.checks) {
    const mark = c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌'
    lines.push(`| ${c.label} | ${mark} ${c.status} | ${c.message} |`)
  }
  if (report.findings.length > 0) {
    lines.push('', '## Findings', '')
    for (const f of report.findings) {
      const mark = f.severity === 'error' ? 'ERROR' : f.severity === 'warning' ? 'WARN' : 'INFO'
      lines.push(`### [${mark}] ${f.id}`, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
    }
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writePlayReport(root: string, report: PlayReport): { mdPath: string; jsonPath: string } {
  const dir = playDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderPlayMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
