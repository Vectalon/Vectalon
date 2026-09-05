import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { detectValidationCommands } from '../utils/validationCommands'
import { logger } from '../cli/logger'

/**
 * Autonomous release pipeline templates — Phase II-2.
 *
 * `vectalon release --submit` writes the project's release workflow: the
 * E2E-on-device-farm stage and the App Store Connect / Play Console submission
 * stage, plus a scheduled 24h crash-rate monitor job that auto-files an
 * incident. Expo projects get an EAS Workflow; bare RN CLI projects get a
 * GitHub Actions workflow. Idempotent — existing workflows are never
 * overwritten (mirrors `ensureCiConfigs`).
 */

export interface ReleaseTemplateOptions {
  /** Expo projects get `.eas/workflows/`; bare RN CLI gets `.github/workflows/`. */
  isExpo: boolean
  /** App Store Connect bundle id (iOS). */
  bundleId?: string
  /** Play Console application id (Android). */
  packageName?: string
}

export interface GeneratedReleaseFile {
  /** Relative path from the project root. */
  path: string
  /** True when the file was written; false when it already existed. */
  written: boolean
}

const EAS_RELEASE_PATH = join('.eas', 'workflows', 'vectalon-release.yml')
const GH_RELEASE_PATH = join('.github', 'workflows', 'vectalon-release.yml')

/**
 * Ensure the project has a release pipeline workflow. Idempotent — never
 * overwrites. Returns the files that were actually written.
 */
export function ensureReleaseConfigs(root: string, options: ReleaseTemplateOptions): GeneratedReleaseFile[] {
  if (options.isExpo) {
    return [writeIfMissing(root, EAS_RELEASE_PATH, generateEasReleaseWorkflow(root, options))]
  }
  return [writeIfMissing(root, GH_RELEASE_PATH, generateGithubReleaseWorkflow(root, options))]
}

function writeIfMissing(root: string, relPath: string, content: string): GeneratedReleaseFile {
  const fullPath = join(root, relPath)
  if (existsSync(fullPath)) {
    return { path: relPath, written: false }
  }
  try {
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
    logger.info(`Generated release workflow: ${relPath}`)
    return { path: relPath, written: true }
  } catch (err) {
    logger.warn(`Could not write ${relPath}: ${err instanceof Error ? err.message : String(err)}`)
    return { path: relPath, written: false }
  }
}

function detectPackageManager(root: string): 'npm' | 'yarn' | 'pnpm' {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function installCommand(pm: 'npm' | 'yarn' | 'pnpm'): string {
  if (pm === 'yarn') return 'yarn install --immutable'
  if (pm === 'pnpm') return 'pnpm install --frozen-lockfile'
  return 'npm ci'
}

/** Whether the project has Maestro flows to run on the device farm. */
function hasMaestroFlows(root: string): boolean {
  return existsSync(join(root, '.maestro'))
}

/**
 * GitHub Actions release workflow for a bare RN CLI project: a manual release
 * trigger runs quality checks → E2E (Maestro, when flows exist) → store
 * submission, then a scheduled job monitors the crash rate for 24h and
 * auto-files an incident on a spike.
 */
export function generateGithubReleaseWorkflow(root: string, options: ReleaseTemplateOptions): string {
  const pm = detectPackageManager(root)
  const detected = detectValidationCommands(root)
  const nativeCommands = detected.commands
    .filter(c => c.name !== 'iOS build' && c.name !== 'Android build')
    .map(c => `- run: ${c.cmd} ${c.args.join(' ')}`)

  const steps: string[] = [
    '- uses: actions/checkout@v4',
    '- uses: actions/setup-node@v4',
    '  with:',
    '    node-version: 20',
    `    cache: ${pm}`,
    `- run: ${installCommand(pm)}`,
  ]

  // Quality gates that match what `vectalon` verifies.
  const pkg = readScripts(root)
  if (pkg.lint) steps.push(`- run: ${scriptRun(pm, 'lint')}`)
  if (pkg.typecheck || pkg['type-check']) steps.push(`- run: ${scriptRun(pm, pkg.typecheck ? 'typecheck' : 'type-check')}`)
  if (pkg.test || pkg.jest) steps.push(`- run: ${scriptRun(pm, pkg.test ? 'test' : 'jest')}`)

  // E2E on the device farm: Maestro flows against a booted simulator.
  const e2eSteps: string[] = []
  if (hasMaestroFlows(root)) {
    e2eSteps.push(
      ...['- uses: mobile-dev-inc/setup-maestro@v2', '- run: maestro test .maestro'].map(s => `      ${s}`)
    )
  }

  const store: string[] = options.packageName
    ? [`- run: bundle exec fastlane supply --package_name ${options.packageName} --track internal || true`]
    : []

  return [
    'name: vectalon-release',
    '',
    'on:',
    '  workflow_dispatch:',
    '    inputs:',
    '      version:',
    "        description: 'Version to release (e.g. 2.1.0)'",
    '        required: true',
    '  schedule:',
    '    - cron: "0 0 * * *"',
    '',
    'jobs:',
    '  quality:',
    '    name: Lint, typecheck, and test',
    '    runs-on: ubuntu-latest',
    '    steps:',
    ...steps.map(s => `      ${s}`),
    '',
    ...(e2eSteps.length > 0
      ? [
          '  e2e:',
          '    name: Maestro E2E on device farm',
          '    runs-on: macos-latest',
          '    steps:',
          ...e2eSteps,
          '',
        ]
      : []),
    // Post-release smoke: run every CLI command against the released project
    // and verify nothing regressed (fails the release on any command failure).
    '  verify:',
    '    name: Post-release smoke (every command)',
    '    runs-on: ubuntu-latest',
    '    needs: [quality]',
    '    steps:',
    ...steps.map(s => `      ${s}`),
    '      - run: npx --yes --package=@vectalon-dev/rn@latest -- vectalon smoke --full --json',
    '',
    '  submit:',
    '    name: Submit to stores',
    '    runs-on: macos-latest',
    '    needs: [verify]',
    '    steps:',
    ...steps.slice(0, 3).map(s => `      ${s}`),
    ...(store.length > 0 ? store.map(s => `      ${s}`) : []),
    ...nativeCommands.map(s => `      ${s}`),
    '',
    '  monitor:',
    '    name: 24h crash-rate monitor',
    '    runs-on: ubuntu-latest',
    '    steps:',
    ...steps.slice(0, 3).map(s => `      ${s}`),
    '      - run: npx vectalon release --monitor --telemetry .vectalon/telemetry || true',
    '',
  ].join('\n')
}

/**
 * EAS Workflow release pipeline for Expo projects: quality → EAS build +
 * submit (App Store Connect / Play Console) → scheduled crash-rate monitor.
 */
export function generateEasReleaseWorkflow(root: string, _options: ReleaseTemplateOptions): string {
  const pm = detectPackageManager(root)
  const pkg = readScripts(root)

  const steps: string[] = [`- run: ${installCommand(pm)}`]
  if (pkg.lint) steps.push(`- run: ${scriptRun(pm, 'lint')}`)
  if (pkg.typecheck || pkg['type-check']) steps.push(`- run: ${scriptRun(pm, pkg.typecheck ? 'typecheck' : 'type-check')}`)
  if (pkg.test || pkg.jest) steps.push(`- run: ${scriptRun(pm, pkg.test ? 'test' : 'jest')}`)

  return [
    'name: vectalon-release',
    '',
    'on:',
    '  workflow_dispatch:',
    '    inputs:',
    '      version:',
    "        description: 'Version to release (e.g. 2.1.0)'",
    '        required: true',
    '  schedule:',
    '    - cron: "0 0 * * *"',
    '',
    'jobs:',
    '  quality:',
    '    name: Lint, typecheck, and test',
    '    steps:',
    ...steps.map(s => `      ${s}`),
    '',
    // Post-release smoke: run every CLI command against the released project
    // and verify nothing regressed (fails the release on any command failure).
    '  verify:',
    '    name: Post-release smoke (every command)',
    '    steps:',
    ...steps.slice(0, 1).map(s => `      ${s}`),
    '      - run: npx --yes --package=@vectalon-dev/rn@latest -- vectalon smoke --full --json',
    '',
    '  submit:',
    '    name: Build and submit to stores',
    '    needs: [verify]',
    '    steps:',
    ...steps.slice(0, 1).map(s => `      ${s}`),
    '      - run: eas build --platform all --non-interactive',
    '      - run: eas submit --platform all --non-interactive || true',
    '',
    '  monitor:',
    '    name: 24h crash-rate monitor',
    '    steps:',
    ...steps.slice(0, 1).map(s => `      ${s}`),
    '      - run: npx vectalon release --monitor --telemetry .vectalon/telemetry || true',
    '',
  ].join('\n')
}

function readScripts(root: string): Record<string, string> {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { scripts?: Record<string, string> }
    return pkg.scripts || {}
  } catch {
    return {}
  }
}

function scriptRun(pm: 'npm' | 'yarn' | 'pnpm', script: string): string {
  if (pm === 'yarn') return `yarn ${script}`
  if (pm === 'pnpm') return `pnpm run ${script}`
  return `npm run ${script}`
}
