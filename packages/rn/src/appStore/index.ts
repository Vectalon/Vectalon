/**
 * vectalon app-store — App Store Readiness Agent (Roadmap Phase 9, item 074)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Scans the iOS and Android release surfaces of an RN project and reports
 * what must be true before a store submission. Version consistency is an
 * error (the store rejects mismatched builds); missing assets and privacy
 * manifests are warnings; informational posture notes are info.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { StoreFinding, StoreReport } from './types'

export type { StoreFinding, StoreReport } from './types'

/** Where app-store reports are written. */
export const appStoreDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'app-store')

export function verdictOf(findings: StoreFinding[]): StoreReport['verdict'] {
  if (findings.some(f => f.severity === 'error')) return 'changes-requested'
  if (findings.some(f => f.severity === 'warning')) return 'needs-attention'
  return 'approved'
}

/** Find a file under root/ios or root/android by name pattern. */
function findFile(root: string, platform: 'ios' | 'android', name: RegExp): string | null {
  const base = join(root, platform)
  if (!existsSync(base)) return null
  const walk = (dir: string): string | null => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'Pods' || entry.name === 'build') continue
        const hit = walk(p)
        if (hit) return hit
      } else if (name.test(entry.name)) {
        return p
      }
    }
    return null
  }
  return walk(base)
}

/** Pull a plist string value for a key: <key>K</key><string>V</string>. */
function plistValue(plist: string, key: string): string | undefined {
  const m = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))
  return m?.[1]
}

/** Run the full store-readiness pass. */
export function runStoreScan(root: string): StoreReport {
  const scannedAt = Date.now()
  const findings: StoreFinding[] = []
  const platforms: StoreReport['platforms'] = []
  const push = (platform: StoreFinding['platform'], severity: StoreFinding['severity'], message: string, suggestion: string) =>
    findings.push({ id: message.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '-'), severity, platform, message, suggestion })

  // --- iOS ---------------------------------------------------------------
  const plistPath = findFile(root, 'ios', /^Info\.plist$/)
  let iosVersion: string | undefined
  let iosBuild: string | undefined
  if (plistPath) {
    platforms.push('ios')
    const plist = readFileSync(plistPath, 'utf-8')
    iosVersion = plistValue(plist, 'CFBundleShortVersionString')
    iosBuild = plistValue(plist, 'CFBundleVersion')
    if (!iosVersion) push('ios', 'error', 'iOS CFBundleShortVersionString is missing', 'Set the marketing version in Info.plist — the store requires it.')
    if (!iosBuild) push('ios', 'error', 'iOS CFBundleVersion is missing', 'Set the build number in Info.plist — it must increment for every upload.')
    const hasIcons = /CFBundleIcons/.test(plist) || /AppIcon/.test(plist) || /xcassets/.test(plist)
    if (!hasIcons) push('ios', 'warning', 'iOS app icon is not referenced from Info.plist', 'Add an AppIcon set to the asset catalog and reference it via CFBundleIcons.')
    if (!/PrivacyInfo\.xcprivacy/.test(plist) && !findFile(root, 'ios', /PrivacyInfo\.xcprivacy$/)) {
      push('ios', 'warning', 'iOS privacy manifest (PrivacyInfo.xcprivacy) not found', 'Apple requires a privacy manifest declaring collected data and required-reason APIs.')
    }
    if (!/UILaunchStoryboardName/.test(plist) && !/UILaunchScreen/.test(plist)) {
      push('ios', 'info', 'iOS launch screen not declared in Info.plist', 'Declare UILaunchScreen (or a launch storyboard) so the app fills the screen on modern devices.')
    }
    if (/NSAllowsArbitraryLoads[^<]*<true\/>/.test(plist)) {
      push('ios', 'warning', 'iOS allows arbitrary loads (ATS disabled)', 'Remove NSAllowsArbitraryLoads or scope it per-domain — App Store review flags unencrypted traffic.')
    }
  }

  // --- Android -------------------------------------------------------------
  const gradlePath = findFile(root, 'android', /^build\.gradle$/) ?? findFile(root, 'android', /^build\.gradle\.kts$/)
  let androidVersionName: string | undefined
  if (gradlePath) {
    platforms.push('android')
    const gradle = readFileSync(gradlePath, 'utf-8')
    const vc = gradle.match(/versionCode\s+(\d+)/)
    const vn = gradle.match(/versionName\s+"([^"]+)"/)
    androidVersionName = vn?.[1]
    if (!vc) push('android', 'error', 'Android versionCode is missing', 'versionCode must be an integer that increments with every release.')
    if (!vn) push('android', 'error', 'Android versionName is missing', 'versionName is the user-visible version shown in the Play listing.')
    if (!/applicationId\s+["']/.test(gradle)) push('android', 'warning', 'Android applicationId is missing', 'Set applicationId — Play Store submissions are keyed to it.')
    if (!/mipmap|ic_launcher/.test(gradle)) push('android', 'warning', 'Android launcher icon not referenced', 'Add ic_launcher mipmaps for every density bucket.')
    if (/usesCleartextTraffic\s*=\s*["']true["']/.test(gradle) || /android:usesCleartextTraffic="true"/.test(gradle)) {
      push('android', 'warning', 'Android allows cleartext traffic', 'Remove usesCleartextTraffic=true or scope it with a network security config.')
    }
  }

  // --- Shared version consistency -----------------------------------------
  let pkgVersion: string | undefined
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { version?: string }
    pkgVersion = pkg.version
  } catch { /* no package.json — versions compared below only when present */ }

  const versions = [iosVersion && `iOS ${iosVersion}`, androidVersionName && `Android ${androidVersionName}`, pkgVersion && `package.json ${pkgVersion}`].filter(Boolean)
  const distinct = new Set(versions.map(v => v!.split(' ')[1]))
  if (platforms.length > 0 && distinct.size > 1) {
    push('shared', 'error', `Version mismatch: ${versions.join(' vs ')}`, 'Keep the marketing version identical across Info.plist, build.gradle, and package.json — a mismatch fails store validation.')
  }
  if (platforms.length === 0) {
    push('shared', 'info', 'No ios/ or android/ directories found', 'Run this check in the native project root (or add the native folders) — store readiness only applies to native builds.')
  }

  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  return {
    scannedAt,
    root,
    platforms,
    findings,
    verdict: verdictOf(findings),
    summary: { total: findings.length, bySeverity },
  }
}

/** Render the readiness report as markdown. */
export function renderStoreMarkdown(report: StoreReport): string {
  const lines = ['# vectalon app-store — Store Readiness', '']
  lines.push(`Platforms: ${report.platforms.join(', ') || 'none'}  ·  Verdict: **${report.verdict}**`, '')
  if (report.findings.length === 0) lines.push('', 'No store-readiness issues found.', '')
  for (const f of report.findings) {
    const mark = f.severity === 'error' ? 'ERROR' : f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.platform}`, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeStoreReport(root: string, report: StoreReport): { mdPath: string; jsonPath: string } {
  const dir = appStoreDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const md = renderStoreMarkdown(report)
  const json = JSON.stringify(report, null, 2)
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, json, 'utf-8')
  return { mdPath, jsonPath }
}
