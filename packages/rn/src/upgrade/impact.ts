/**
 * vectalon upgrade — Impact stage
 * Business Source License 1.1 (BSL-1.1)
 *
 * Breaking-change blast radius over the project's own source, using the
 * AST-grade Knowledge Graph (I-1) and AstScanner: native module boundaries,
 * bridge/Fabric-hostile patterns, deprecated APIs, and New Architecture
 * migration-path awareness (I-2). Deterministic — no model calls.
 */

import { readProjectFile, walkProjectFiles } from './scan'
import { buildKnowledgeGraph } from '../harness/KnowledgeGraph'
import { analyzeSourceFile } from '../harness/AstScanner'
import { isAtLeast, versionParts } from './detect'
import type { DetectedVersions, ImpactFinding, ImpactCategory, RiskLevel } from './types'

/** Direct bridge usage → New Architecture hazard. */
const BRIDGE_PATTERNS: { pattern: RegExp; label: string; risk: RiskLevel }[] = [
  { pattern: /\brequireNativeComponent\s*\(/, label: 'requireNativeComponent', risk: 'high' },
  { pattern: /\bUIManager\b/, label: 'UIManager (bridge)', risk: 'medium' },
  { pattern: /\bNativeEventEmitter\b/, label: 'NativeEventEmitter (bridge)', risk: 'low' },
  { pattern: /\bDeviceEventEmitter\b/, label: 'DeviceEventEmitter (bridge)', risk: 'low' },
]

/** Deprecated / removed APIs with their migration guidance. */
const DEPRECATED_PATTERNS: { pattern: RegExp; label: string; risk: RiskLevel; hint: string }[] = [
  {
    pattern: /\bPushNotificationIOS\b/,
    label: 'PushNotificationIOS',
    risk: 'high',
    hint: 'deprecated — migrate to @react-native-community/push-notification-ios (or expo-notifications)',
  },
  {
    pattern: /from\s*['"]react-native['"][^;]*AsyncStorage|AsyncStorage\s+from\s*['"]react-native['"]/,
    label: 'AsyncStorage from react-native',
    risk: 'high',
    hint: 'removed from react-native — use @react-native-async-storage/async-storage',
  },
  {
    pattern: /\bColorPropType\b|\bEdgeInsetsPropType\b|\bPointPropType\b|\bViewPropTypes\b/,
    label: 'removed PropTypes exports',
    risk: 'medium',
    hint: 'removed in RN 0.71 — replace with explicit prop types',
  },
  {
    pattern: /from\s*['"]react-native['"][^;]*\bStatusBar\b|\bStatusBar\b\s*from\s*['"]react-native['"]/,
    label: 'StatusBar',
    risk: 'low',
    hint: 'soft-deprecated on iOS — use react-native-safe-area-context / edge-to-edge theming',
  },
]

/**
 * Analyze the breaking-change blast radius of an upgrade. Uses the Knowledge
 * Graph for native module boundaries and a per-file source scan for bridge and
 * deprecated patterns. Findings are grouped by file, deduped, and capped so a
 * huge codebase produces a bounded report.
 */
export function analyzeUpgradeImpact(versions: DetectedVersions, target: string | null): ImpactFinding[] {
  const root = versions.root
  const findings: ImpactFinding[] = []
  const seen = new Set<string>()

  const push = (file: string, category: ImpactCategory, pattern: string, risk: RiskLevel, detail: string, newArchRelated?: boolean): void => {
    const key = `${file}::${pattern}`
    if (seen.has(key)) return
    seen.add(key)
    findings.push({ id: `imp-${findings.length + 1}`, category, pattern, file, risk, detail, newArchRelated })
  }

  // New Architecture stance for risk adjustment.
  const targetMinor = target ? versionParts(target) : null
  const targetIsNewArchDefault = isAtLeast(targetMinor ? [targetMinor[0], targetMinor[1]] : null, [0, 76])

  // 1. Native module boundaries from the Knowledge Graph (AST-grade).
  const graph = buildKnowledgeGraph(root)
  for (const mod of graph.nativeModules) {
    const modules = mod.modules.join(', ')
    push(
      mod.filePath,
      'native-module',
      'NativeModules',
      targetIsNewArchDefault ? 'high' : 'medium',
      `native module boundary: ${modules} — needs a TurboModule spec for the New Architecture`,
      targetIsNewArchDefault
    )
  }

  // 2. Per-file source scan for bridge / deprecated patterns.
  for (const rel of walkProjectFiles(root)) {
    const content = readProjectFile(root, rel)
    if (content === null) continue

    // Prefer the AST for precise import-level facts when the file parses.
    const analysis = analyzeSourceFile(content, rel)
    const astNativeModules = analysis?.nativeModules || []
    for (const mod of astNativeModules) {
      push(
        rel,
        'native-module',
        `TurboModuleRegistry/${mod}`,
        'medium',
        mod === 'react-native'
          ? 'imports NativeModules/TurboModuleRegistry/NativeEventEmitter from react-native'
          : `TurboModule-style reference: ${mod}`,
        true
      )
    }

    for (const bp of BRIDGE_PATTERNS) {
      bp.pattern.lastIndex = 0
      if (bp.pattern.test(content)) {
        push(
          rel,
          bp.risk === 'high' ? 'fabric' : 'bridge',
          bp.label,
          bp.risk,
          bp.risk === 'high'
            ? `${bp.label} usage — rewrite to codegenNativeComponent for the New Architecture`
            : `${bp.label} usage — bridge API, verify New Architecture behavior`,
          true
        )
      }
    }

    for (const dp of DEPRECATED_PATTERNS) {
      dp.pattern.lastIndex = 0
      if (dp.pattern.test(content)) {
        push(rel, 'deprecated', dp.label, dp.risk, dp.hint)
      }
    }
  }

  // 3. Configuration-level impact: architecture flip between current and target.
  const archFlip = versions.newArch?.enabled === false && targetIsNewArchDefault
  if (archFlip) {
    push('android/gradle.properties', 'config', 'New Architecture flip', 'high', 'project runs the legacy bridge but the target enables the New Architecture by default', true)
  }

  // 4. TurboModule specs already present (good signal, informational).
  const specs = versions.newArch?.turboModuleSpecs || []
  for (const spec of specs) {
    const file = specs.length === 1 ? 'src/' : 'src/'
    push(file, 'native-module', `TurboModule spec: ${spec}`, 'low', `spec ${spec} is New-Architecture-ready`, true)
  }

  // Bounded output: a pathological codebase cannot flood the report.
  return findings.slice(0, 200)
}

/** Summary numbers for the plan header. */
export function summarizeImpact(findings: ImpactFinding[]): { total: number; high: number; medium: number; low: number; files: number } {
  const files = new Set(findings.map(f => f.file))
  return {
    total: findings.length,
    high: findings.filter(f => f.risk === 'high').length,
    medium: findings.filter(f => f.risk === 'medium').length,
    low: findings.filter(f => f.risk === 'low').length,
    files: files.size,
  }
}
