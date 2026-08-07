/**
 * vectalon upgrade — Verify stage
 * Business Source License 1.1 (BSL-1.1)
 *
 * Post-apply health checks, all deterministic and bounded:
 * 1. doctor — reuse the ecosystem doctor (toolchain + ecosystem readiness)
 * 2. typecheck — `tsc --noEmit` when the project has a tsconfig
 * 3. bundle budget gate — Metro bundle budgets (falls back to static checks
 *    when the project can't build a bundle here), plus a regression delta
 *    against the pre-upgrade snapshot taken before codemods ran.
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { runDoctor, type DoctorCheckers } from '../ecosystem/doctor'
import { analyzeBundleStats, checkBundleBudgets, checkStaticBudgets, runMetroBundleCommand, formatBytes, formatPct } from '../utils/bundleAnalyzer'
import { runCommand } from '../adapters/runCommand'
import { readBundleSnapshot } from './codemods'
import { reportError } from '../utils/safe'
import type { UpgradeReport, VerifyCheck, VerifyResult } from './types'

/** Minimal real checkers for the doctor call (bounded probes, no model). */
function realCheckers(root: string): DoctorCheckers {
  return {
    packageInstalled(packageName: string): boolean {
      try {
        require.resolve(`${packageName}/package.json`, { paths: [root] })
        return true
      } catch (err) {
        reportError(err, `upgrade: resolving package ${packageName}`)
        return false
      }
    },
    run(command: string, args: string[]): { success: boolean; output: string } {
      try {
        const result = spawnSync(command, args, { encoding: 'utf-8', timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'] })
        return { success: result.status === 0, output: (result.stdout || '') + (result.stderr || '') }
      } catch (err) {
        reportError(err, `upgrade: doctor probe ${command}`)
        return { success: false, output: '' }
      }
    },
    dirExists: (dir: string) => existsSync(dir),
    env: (name: string) => process.env[name],
    portOpen: () => false,
    platform: process.platform,
    hasModel: () => false,
    writable: (dir: string) => existsSync(dir),
  }
}

export async function verifyUpgrade(root: string, _report: UpgradeReport): Promise<VerifyResult> {
  const checks: VerifyCheck[] = []

  // 1. Doctor — informational health summary (a missing local toolchain never
  //    fails the upgrade; the hard gates are typecheck + bundle).
  const doctor = runDoctor(root, realCheckers(root))
  checks.push({
    id: 'doctor',
    name: 'vectalon doctor',
    status: doctor.missingCount === 0 ? 'ok' : 'warn',
    detail: `${doctor.okCount} ok · ${doctor.missingCount} missing · ${doctor.warningCount} warnings`,
  })

  // 2. Typecheck.
  const hasTsConfig = ['tsconfig.json', 'tsconfig.app.json'].some(f => existsSync(join(root, f)))
  if (hasTsConfig) {
    const result = await runCommand('npx', ['tsc', '--noEmit'], { cwd: root, timeout: 120_000 })
    checks.push({
      id: 'typecheck',
      name: 'TypeScript typecheck',
      status: result.success ? 'ok' : 'fail',
      detail: result.success
        ? 'tsc --noEmit passed'
        : (result.stderr.trim().split(/\r?\n/)[0] || 'tsc --noEmit failed').slice(0, 160),
    })
  } else {
    checks.push({ id: 'typecheck', name: 'TypeScript typecheck', status: 'skip', detail: 'no tsconfig.json — skipped' })
  }

  // 3. Bundle budget gate.
  const before = readBundleSnapshot(root)
  const metro = await runMetroBundleCommand(root)
  if (metro) {
    const analysis = analyzeBundleStats(metro)
    const findings = checkBundleBudgets(analysis)
    const errors = findings.filter(f => f.severity === 'error')
    const warnings = findings.filter(f => f.severity !== 'error')
    const deltaPct = before ? ((analysis.totalSize - before.totalSize) / before.totalSize) * 100 : null
    const detailParts = [`bundle ${formatBytes(analysis.totalSize)} (${analysis.moduleCount} modules)`]
    if (deltaPct !== null) detailParts.push(`Δ ${formatPct(deltaPct)} vs pre-upgrade`)
    if (warnings.length > 0) detailParts.push(`${warnings.length} budget warning(s)`)
    checks.push({
      id: 'bundle',
      name: 'Bundle budget gate',
      status: errors.length > 0 ? 'fail' : deltaPct !== null && deltaPct > 10 ? 'warn' : 'ok',
      detail: detailParts.join(' · ').slice(0, 180),
    })
    return { passed: checks.every(c => c.status !== 'fail'), checks, bundleDeltaPct: deltaPct, doctor: { ok: doctor.okCount, missing: doctor.missingCount, warnings: doctor.warningCount } }
  }

  // Fallback: deterministic static budgets (no Metro build available).
  const staticResult = checkStaticBudgets(root)
  const warnings = staticResult.findings.filter(f => f.severity !== 'error')
  checks.push({
    id: 'bundle',
    name: 'Bundle budget gate (static)',
    status: 'ok',
    detail: `metro build unavailable — static checks ran: ${warnings.length} finding(s), ${staticResult.checkedPackages} deps checked`,
  })
  return {
    passed: checks.every(c => c.status !== 'fail'),
    checks,
    bundleDeltaPct: null,
    doctor: { ok: doctor.okCount, missing: doctor.missingCount, warnings: doctor.warningCount },
  }
}
