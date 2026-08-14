/**
 * vectalon team brain — Coding Standards Engine (Roadmap 043)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Derives the project's de-facto coding standards from what is actually on
 * disk — config files, dependencies, and the guardrail policy — so the team
 * brain's standards doc reflects reality instead of a template. Deterministic.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { walkProjectFiles, readProjectFile } from '../upgrade/scan'
import type { CodingStandard, StandardStatus } from './types'

interface PackageJson {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

function readPackage(root: string): PackageJson | null {
  const raw = readProjectFile(root, 'package.json')
  if (!raw) return null
  try {
    return JSON.parse(raw) as PackageJson
  } catch {
    return null
  }
}

function hasDep(pkg: PackageJson | null, name: string): boolean {
  return Boolean(pkg && (pkg.dependencies?.[name] || pkg.devDependencies?.[name]))
}

function hasAnyDep(pkg: PackageJson | null, names: string[]): boolean {
  return names.some(name => hasDep(pkg, name))
}

function fileExists(root: string, ...rel: string[]): boolean {
  return existsSync(join(root, ...rel))
}

/**
 * Derive the project's coding standards from config + dependency evidence.
 * Every standard is backed by a file or dependency check — nothing is asserted
 * from thin air, so the doc doubles as an audit trail.
 */
export function deriveStandards(root: string): CodingStandard[] {
  const standards: CodingStandard[] = []
  const pkg = readPackage(root)

  // ---- Language & type safety ----------------------------------------------
  const tsconfigPath = ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.base.json'].find(p => fileExists(root, p))
  if (tsconfigPath) {
    let strict = false
    try {
      const tsconfig = JSON.parse(readFileSync(join(root, tsconfigPath), 'utf-8'))
      strict = tsconfig.compilerOptions?.strict === true
    } catch {
      // unreadable tsconfig — report presence only
    }
    standards.push({
      rule: 'TypeScript is the source of truth',
      status: 'enforced',
      detail: `${tsconfigPath} present${strict ? ' with `"strict": true`' : ' (strict mode not enabled — recommended)'}`,
    })
  } else if (hasAnyDep(pkg, ['typescript'])) {
    standards.push({
      rule: 'TypeScript is a dependency',
      status: 'detected',
      detail: 'typescript is installed but no tsconfig.json was found — consider adding one with `"strict": true`.',
    })
  } else {
    standards.push({
      rule: 'Add TypeScript for type safety',
      status: 'recommended',
      detail: 'No TypeScript config or dependency detected.',
    })
  }

  // ---- Styling ---------------------------------------------------------------
  const styledSystems = ['styled-components', '@emotion/native', 'nativewind', 'tailwindcss', 'react-native-unistyles']
  const foundStyling = styledSystems.find(name => hasDep(pkg, name))
  if (foundStyling) {
    standards.push({
      rule: `Styling: ${foundStyling}`,
      status: 'detected',
      detail: `${foundStyling} is a dependency — style accordingly.`,
    })
  } else {
    const usesStyleSheet = walkProjectFiles(root).some(rel =>
      /\.[tj]sx?$/.test(rel) && /StyleSheet\.create/.test(readProjectFile(root, rel) || '')
    )
    standards.push({
      rule: 'Styling: React Native StyleSheet',
      status: usesStyleSheet ? 'enforced' : 'detected',
      detail: usesStyleSheet
        ? 'StyleSheet.create is used across the codebase.'
        : 'No styling system detected — RN StyleSheet is the safe default.',
    })
  }

  // ---- Testing --------------------------------------------------------------
  if (hasAnyDep(pkg, ['jest', '@testing-library/react-native'])) {
    standards.push({
      rule: 'Unit tests: Jest + React Native Testing Library',
      status: 'enforced',
      detail: 'jest / @testing-library/react-native present.',
    })
  } else if (fileExists(root, 'jest.config.js', 'jest.config.ts', 'jest.config.json')) {
    standards.push({ rule: 'Unit tests: Jest', status: 'enforced', detail: 'jest config present.' })
  }
  if (hasAnyDep(pkg, ['detox', 'maestro']) || fileExists(root, '.maestro')) {
    standards.push({
      rule: 'E2E tests: Detox / Maestro',
      status: 'detected',
      detail: 'Detox or Maestro tooling present.',
    })
  }

  // ---- Linting & formatting --------------------------------------------------
  const hasEslint = hasAnyDep(pkg, ['eslint', '@react-native/eslint-config', 'eslint-config-expo'])
  if (hasEslint) standards.push({ rule: 'Linting: ESLint', status: 'detected', detail: 'ESLint is installed.' })
  if (hasAnyDep(pkg, ['prettier', 'eslint-plugin-prettier'])) {
    standards.push({ rule: 'Formatting: Prettier', status: 'detected', detail: 'Prettier is installed.' })
  }

  // ---- Navigation -------------------------------------------------------------
  if (hasAnyDep(pkg, ['expo-router'])) {
    standards.push({ rule: 'Navigation: Expo Router (file-based)', status: 'detected', detail: 'expo-router is a dependency.' })
  } else if (hasAnyDep(pkg, ['@react-navigation/native', 'react-navigation'])) {
    standards.push({ rule: 'Navigation: React Navigation', status: 'detected', detail: 'React Navigation is a dependency.' })
  }

  // ---- State management ---------------------------------------------------------
  const stateLibs: Array<[string, string[]]> = [
    ['Redux', ['redux', '@reduxjs/toolkit', 'react-redux']],
    ['Zustand', ['zustand']],
    ['React Query', ['@tanstack/react-query', 'react-query']],
    ['MobX', ['mobx', 'mobx-react', 'mobx-react-lite']],
    ['Jotai', ['jotai']],
    ['Recoil', ['recoil']],
  ]
  const foundState = stateLibs.find(([, names]) => hasAnyDep(pkg, names))
  if (foundState) {
    standards.push({ rule: `State management: ${foundState[0]}`, status: 'detected', detail: `${foundState[0]} libraries are dependencies.` })
  } else {
    standards.push({
      rule: 'State management: React context / local state',
      status: 'detected',
      detail: 'No global state library detected — prefer local state + context.',
    })
  }

  // ---- Package manager (from lockfiles) ------------------------------------------
  const managers: Array<[string, string]> = [
    ['pnpm', 'pnpm-lock.yaml'],
    ['yarn', 'yarn.lock'],
    ['npm', 'package-lock.json'],
    ['bun', 'bun.lockb'],
  ]
  const foundManager = managers.find(([, lock]) => fileExists(root, lock))
  if (foundManager) {
    standards.push({ rule: `Package manager: ${foundManager[0]}`, status: 'enforced', detail: `${foundManager[1]} present.` })
  }

  // ---- Guardrail policy (enforced by the harness) ----------------------------------
  const policyRaw = readProjectFile(root, '.vectalon/policy.json')
  if (policyRaw) {
    try {
      const policy = JSON.parse(policyRaw)
      const ruleKeys = Object.keys(policy.rules || {})
      const customRules = Array.isArray(policy.customRules) ? policy.customRules.length : 0
      standards.push({
        rule: 'Guardrail policy: vectalon enforces .vectalon/policy.json',
        status: 'enforced',
        detail: `${ruleKeys.length} rule override(s)${customRules > 0 ? ` + ${customRules} custom rule(s)` : ''} — every change is gated against these.`,
      })
      for (const key of ruleKeys.slice(0, 5)) {
        standards.push({ rule: `Policy override: ${key}`, status: 'enforced', detail: 'From .vectalon/policy.json.' })
      }
    } catch {
      // unreadable policy — skip
    }
  } else {
    standards.push({
      rule: 'Guardrail policy: initialize one',
      status: 'recommended',
      detail: 'No .vectalon/policy.json — run `vectalon policy --init` to enforce project guardrails.',
    })
  }

  return standards
}

/** Render the coding standards as markdown (written to docs/vectalon/team/coding-standards.md). */
export function renderStandards(standards: CodingStandard[], projectName: string): string {
  const lines = [`# Coding Standards — ${projectName}`, '']
  lines.push('Derived from the project itself (config files, dependencies, guardrail policy) — not from a template.', '')
  if (standards.length === 0) {
    lines.push('No standards derivable from this project yet.')
    return lines.join('\n')
  }
  const statusIcon: Record<StandardStatus, string> = { enforced: '✅', detected: '🔎', recommended: '💡' }
  lines.push('| | Standard | Status | Detail |')
  lines.push('| --- | --- | --- | --- |')
  for (const s of standards) {
    lines.push(`| ${statusIcon[s.status]} | ${s.rule} | ${s.status} | ${s.detail} |`)
  }
  return lines.join('\n')
}
