/**
 * vc fix — verify: run the checks that prove the fix, in the sandbox (tsc +
 * jest, offline) or the real tree with --apply (Gradle included). Every
 * command is bounded; a missing toolchain degrades to 'skipped' with the
 * reason, never a hang.
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { FixOptions, FixVerification } from './types'

export interface VerifyContext {
  /** The tree to verify (sandbox, or the real root with --apply). */
  dir: string
  /** True when Gradle verification should actually run (real tree + android/). */
  gradle: boolean
  run: NonNullable<FixOptions['run']>
}

function hasTsconfig(dir: string): boolean {
  return existsSync(join(dir, 'tsconfig.json'))
}

function hasJest(dir: string): boolean {
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) return false
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      jest?: unknown
      scripts?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return !!pkg.jest || !!pkg.devDependencies?.jest || /jest/.test(pkg.scripts?.test ?? '')
  } catch {
    return false
  }
}

function hasGradle(dir: string): boolean {
  return existsSync(join(dir, 'android', 'gradlew'))
}

export async function verifyTree(ctx: VerifyContext): Promise<FixVerification[]> {
  const out: FixVerification[] = []

  // TypeScript — fast, offline, the first line of proof.
  if (hasTsconfig(ctx.dir)) {
    const r = await ctx.run('npx', ['tsc', '--noEmit'], { cwd: ctx.dir, timeout: 120_000 })
    out.push({
      name: 'TypeScript',
      status: r.success ? 'pass' : 'fail',
      detail: r.success ? 'tsc --noEmit clean' : firstErrorLine(r),
    })
  } else {
    out.push({ name: 'TypeScript', status: 'skipped', detail: 'no tsconfig.json' })
  }

  // Jest — bounded; failures carry the first failure line.
  if (hasJest(ctx.dir)) {
    const r = await ctx.run('npx', ['jest', '--silent'], { cwd: ctx.dir, timeout: 240_000 })
    out.push({
      name: 'Jest',
      status: r.success ? 'pass' : 'fail',
      detail: r.success ? 'jest suite green' : firstErrorLine(r),
    })
  } else {
    out.push({ name: 'Jest', status: 'skipped', detail: 'jest not configured' })
  }

  // Gradle — only in the real tree (a sandbox has no Android SDK), and only
  // when the project actually has the wrapper.
  if (!ctx.gradle) {
    out.push({ name: 'Gradle', status: 'skipped', detail: 'not run — sandbox has no Android SDK (pass --apply to build in your tree)' })
  } else if (!hasGradle(ctx.dir)) {
    out.push({ name: 'Gradle', status: 'skipped', detail: 'no android/gradlew' })
  } else {
    const r = await ctx.run('./gradlew', ['assembleDebug'], { cwd: join(ctx.dir, 'android'), timeout: 600_000 })
    out.push({
      name: 'Gradle',
      status: r.success ? 'pass' : 'fail',
      detail: r.success ? 'assembleDebug built' : firstErrorLine(r),
    })
  }

  return out
}

function firstErrorLine(r: { success: boolean; stdout: string; stderr: string }): string {
  const text = (r.stderr || r.stdout || '').split('\n').map(l => l.trim()).filter(Boolean)
  const interesting = text.find(l => /error|failed|✗|×|fail/i.test(l)) ?? text[text.length - 1] ?? 'command failed'
  return interesting.slice(0, 160)
}
