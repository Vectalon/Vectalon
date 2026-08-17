/**
 * iOS Build Analyzer (Roadmap 014) — interpret Xcode build failures: a
 * pattern parser for CocoaPods, code signing, linker, plist, and deployment
 * target errors with the standard fixes. macOS-only log analysis is pure
 * text parsing, so it runs everywhere.
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import type { DiagnosticCheck, LogAnalysis } from './types'

interface XcodePattern {
  id: string
  name: string
  re: RegExp
  fix: string
}

export const XCODE_PATTERNS: XcodePattern[] = [
  {
    id: 'pod-not-found',
    name: 'CocoaPods pod not found',
    re: /Unable to find a specification for ['"`][^'"`]+['"`]|pod ['"`][^'"`]+['"`] not found|CDN: trunk URL couldn't be downloaded|Couldn't find pod/i,
    fix: 'The pod is missing from the spec repo or its version is unpublished: `cd ios && pod repo update` then `pod install`; pin an existing version in the Podfile if the package tags lag npm.',
  },
  {
    id: 'pod-install-needed',
    name: 'Pod install required',
    re: /Could not find ['"][^'"]+['"] in project|The Swift pod [`'"][^'"]+[`'"] could not be found|! The .* Podfile lock has changed/i,
    fix: 'Re-run `cd ios && pod install` (or `bundle exec pod install`) after dependency changes; commit Podfile.lock so the team builds the same tree.',
  },
  {
    id: 'code-signing',
    name: 'Code signing failure',
    re: /CodeSign error|errSecInternalComponent|No signing certificate|requires a development team|Signing for .* requires a development team/i,
    fix: 'Signing identity/team missing: open Xcode → Target → Signing & Capabilities, pick your team; on CI set CODE_SIGNING_ALLOWED=NO for simulator-only builds or export DEVELOPMENT_TEAM + match provisioning.',
  },
  {
    id: 'provisioning',
    name: 'Provisioning profile problem',
    re: /Provisioning profile .* doesn't include|no profiles for .* were found|The provisioning profile .* doesn't include the currently selected device/i,
    fix: 'Profile does not cover this device/entitlements: re-download profiles in Xcode (Settings → Accounts → Download Manual Profiles) and verify the bundle id + entitlements match the profile.',
  },
  {
    id: 'linker',
    name: 'Linker failure (undefined symbols)',
    re: /Undefined symbols|ld: symbol\(s\) not found|duplicate symbol|framework not found/i,
    fix: 'A native library is missing from the link step: `cd ios && pod install` after adding a package; if duplicate symbols, remove the double import. Add `-ObjC` to OTHER_LDFLAGS when a vendored framework needs it.',
  },
  {
    id: 'deployment-target',
    name: 'Deployment target too low',
    re: /deployment target[^,]*?(?:is|set to)\s*\d+\.\d+.*range of supported deployment target versions is|deployment target is \d+\.\d+, but the range of supported deployment target versions is/i,
    fix: "Raise IPHONEOS_DEPLOYMENT_TARGET in the Podfile (`platform :ios, '15.0'` or the RN-required floor for your version) and re-run `cd ios && pod install`.",
  },
  {
    id: 'plist',
    name: 'Info.plist issue',
    re: /The Info\.plist|Data couldn't be read because it isn't in the correct format|NSBundle.*Info\.plist/i,
    fix: 'Malformed Info.plist: open ios/*/Info.plist in Xcode (it validates on save); merge conflicts commonly break the XML — re-run pod install to regenerate keys.',
  },
  {
    id: 'xcode-version',
    name: 'Xcode version too old',
    re: /requires a newer version of Xcode|Xcode \d+\.\d+ or later is required|Invalid version of Xcode/i,
    fix: 'Update Xcode (or select the right one: `sudo xcode-select -s /Applications/Xcode.app`) to the version React Native requires for your release.',
  },
]

/** Parse an Xcode build log and return the root-cause classification. */
export function analyzeXcodeLog(log: string): LogAnalysis {
  const matches: LogAnalysis['matches'] = []
  const lines = log.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of XCODE_PATTERNS) {
      if (pattern.re.test(lines[i])) {
        matches.push({ id: pattern.id, name: pattern.name, line: i + 1, fix: pattern.fix })
      }
    }
  }
  const first = matches[0] ?? null
  const rootCause = first ? { id: first.id, name: first.name, fix: first.fix } : null
  const evidence = lines.filter(l => l.trim()).slice(-25)
  return { rootCause, matches, evidence }
}

/** Read an Xcode log file and analyze it; null when the file is missing. */
export function analyzeXcodeLogFile(path: string): LogAnalysis | null {
  try {
    if (!existsSync(path)) return null
    return analyzeXcodeLog(readFileSync(path, 'utf-8'))
  } catch (err) {
    reportError(err, `diagnostics: reading xcode log ${path}`)
    return null
  }
}

/** Project-side iOS checks: Podfile presence + deployment target. */
export function iosProjectChecks(root: string): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []
  const podfile = join(root, 'ios', 'Podfile')
  const iosDir = join(root, 'ios')
  if (!existsSync(iosDir)) {
    checks.push({
      id: 'ios-project',
      title: 'iOS project',
      category: 'ios',
      status: 'info',
      detail: 'No ios/ directory — nothing to analyze on the iOS side (Expo managed projects generate it on prebuild).',
    })
    return checks
  }
  if (!existsSync(podfile)) {
    checks.push({
      id: 'ios-podfile',
      title: 'Podfile',
      category: 'ios',
      status: 'warn',
      detail: 'ios/ exists but no Podfile found — CocoaPods dependencies cannot be installed.',
      fix: 'Run `npx react-native init` scaffold or `pod init` in ios/ and add `use_native_modules!` (or `npx expo prebuild` for managed projects).',
    })
    return checks
  }
  let content = ''
  try {
    content = readFileSync(podfile, 'utf-8')
  } catch (err) {
    reportError(err, 'diagnostics: reading ios/Podfile')
  }
  const target = content.match(/platform\s*:\s*ios\s*,\s*['"](\d+\.\d+)['"]/)
  const version = target ? Number(target[1]) : null
  const recommended = 15
  checks.push({
    id: 'ios-deployment-target',
    title: 'iOS deployment target',
    category: 'ios',
    status: version === null ? 'info' : version >= recommended ? 'pass' : 'warn',
    detail: version === null ? 'No explicit iOS platform floor in the Podfile (defaults may be too low for current RN).' : `platform :ios, '${version}'`,
    fix: version !== null && version < recommended ? `Raise the Podfile floor to ${recommended}.0 (React Native 0.73+ requires iOS 12.4+, and current releases target 15+).` : undefined,
  })
  if (content.includes('use_native_modules!')) {
    checks.push({ id: 'ios-autolinking', title: 'Autolinking', category: 'ios', status: 'pass', detail: 'Podfile calls use_native_modules! — native packages autolink.' })
  }
  return checks
}
