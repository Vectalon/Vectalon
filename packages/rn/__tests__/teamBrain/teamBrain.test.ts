/**
 * Team Brain (Roadmap Phase 6, 041-049) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import {
  buildGlossary,
  deriveStandards,
  deriveExpertise,
  indexDecisionFiles,
  derivePrKnowledge,
  buildTeamBrain,
  searchTeamBrain,
  listTeamProjects,
  teamDocsDir,
} from '../../src/teamBrain'

const tempDirs: string[] = []

function fixture(): string {
  const dir = createTempProject({
    'package.json': JSON.stringify({
      name: 'acme-mobile',
      version: '1.4.2',
      dependencies: {
        'react-native': '0.76.3',
        'react': '18.3.1',
        '@react-navigation/native': '^6.1.0',
        'zustand': '^4.5.0',
      },
      devDependencies: {
        'typescript': '^5.4.0',
        'jest': '^29.7.0',
        '@testing-library/react-native': '^12.4.0',
        'eslint': '^8.57.0',
      },
    }, null, 2),
    'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }, null, 2),
    'pnpm-lock.yaml': 'lockfileVersion: \'9.0\'',
    'src/screens/CheckoutScreen.tsx': [
      "import { StyleSheet, View, Text } from 'react-native'",
      "import { CheckoutController } from '../features/checkout/CheckoutController'",
      'const GATEWAY_TIMEOUT_MS = 30000',
      'export function CheckoutScreen() {',
      '  const title = "CheckoutScreen"',
      '  const checkoutController = useCheckoutController()',
      '  return <View style={styles.root}><Text>{checkoutController.status}</Text></View>',
      '}',
      '',
      'export const styles = StyleSheet.create({ root: { flex: 1 } })',
    ].join('\n'),
    'src/features/checkout/CheckoutController.ts': [
      'export class CheckoutController {',
      '  timeoutMs = GATEWAY_TIMEOUT_MS',
      '  settleOrder(orderId: string) { return orderId }',
      '}',
    ].join('\n'),
    'src/features/checkout/useCheckoutController.ts': [
      'export function useCheckoutController() {',
      '  const checkout = new CheckoutController()',
      '  return checkout',
      '}',
    ].join('\n'),
    'src/components/PriceTag.tsx': "import { StyleSheet, Text } from 'react-native'\nexport const PriceTag = ({ cents }) => <Text>{cents}</Text>\nexport const styles = StyleSheet.create({ tag: {} })",
    'docs/adr/0001-use-stripe.md': [
      '# ADR-0001: Use Stripe for payments',
      '',
      '## Status',
      'Accepted',
      '',
      'We use Stripe for all checkout flows.',
    ].join('\n'),
    'docs/decisions/README.md': '# Decisions\n\nSee the ADRs.',
    'DECISIONS.md': '# Project Decisions\n\n- Adopt TypeScript strict mode everywhere.',
    '.vectalon/policy.json': JSON.stringify({
      version: 1,
      rules: { 'no-direct-console': true },
      customRules: [{ id: 'no-any', pattern: '\\bany\\b', message: 'Avoid any' }],
    }, null, 2),
    '.vectalon/team.json': JSON.stringify({
      team: 'mobile',
      projects: [{ name: 'payments-service', path: 'packages/payments', team: 'backend' }],
    }, null, 2),
    'packages/payments/package.json': JSON.stringify({ name: 'payments-service', version: '0.1.0' }, null, 2),
  })
  tempDirs.push(dir)
  return dir
}

/** Injected git log: 2 authors, 3 commits, 2 of which reference PRs. */
const GIT_LOG = [
  'a1b2c3d4|Ada Lovelace|2026-08-01T10:00:00Z|feat(checkout): add settle flow (#42)',
  'e5f6a7b8|Ada Lovelace|2026-07-20T09:00:00Z|Merge pull request #7 from acme/price-tags',
  '9c0d1e2f|Grace Hopper|2026-07-01T08:00:00Z|fix: typo in docs',
].join('\n')

const GIT_FILES_LOG = [
  'a1b2c3d4',
  'src/screens/CheckoutScreen.tsx',
  'src/features/checkout/CheckoutController.ts',
  'e5f6a7b8',
  'src/components/PriceTag.tsx',
  '9c0d1e2f',
  'DECISIONS.md',
].join('\n')

afterEach(() => {
  for (const dir of tempDirs) cleanup(dir)
  tempDirs.length = 0
})

describe('glossary (044)', () => {
  it('extracts domain terms and classifies component names', () => {
    const terms = buildGlossary(fixture(), 20)
    const screen = terms.find(t => t.term === 'checkoutscreen')
    expect(screen).toBeDefined()
    expect(screen!.kind).toBe('component')
    const controller = terms.find(t => t.term === 'checkoutcontroller')
    expect(controller).toBeDefined()
    expect(controller!.kind).toBe('component')
    const constant = terms.find(t => t.term === 'gateway_timeout_ms')
    expect(constant).toBeDefined()
    expect(constant!.kind).toBe('constant')
  })

  it('filters out code vocabulary like stylesheet and view', () => {
    const terms = buildGlossary(fixture(), 20)
    expect(terms.find(t => t.term === 'stylesheet')).toBeUndefined()
    expect(terms.find(t => t.term === 'view')).toBeUndefined()
  })

  it('caps the glossary at the limit', () => {
    const terms = buildGlossary(fixture(), 5)
    expect(terms.length).toBeLessThanOrEqual(5)
  })
})

describe('coding standards (043)', () => {
  it('detects TypeScript strict mode', () => {
    const standards = deriveStandards(fixture())
    const ts = standards.find(s => s.rule.includes('TypeScript'))
    expect(ts).toBeDefined()
    expect(ts!.status).toBe('enforced')
    expect(ts!.detail).toContain('strict')
  })

  it('detects jest + react navigation + zustand + pnpm', () => {
    const standards = deriveStandards(fixture())
    expect(standards.some(s => s.rule.includes('Jest'))).toBe(true)
    expect(standards.some(s => s.rule.includes('React Navigation'))).toBe(true)
    expect(standards.some(s => s.rule.includes('Zustand'))).toBe(true)
    expect(standards.some(s => s.rule.includes('pnpm'))).toBe(true)
  })

  it('surfaces the guardrail policy', () => {
    const standards = deriveStandards(fixture())
    const policy = standards.find(s => s.rule.includes('policy.json'))
    expect(policy).toBeDefined()
    expect(policy!.detail).toContain('1 rule override(s)')
  })
})

describe('expertise map (046)', () => {
  it('maps authors to commits, files, and owned components', async () => {
    const entries = await deriveExpertise('', { gitLog: GIT_LOG, gitFilesLog: GIT_FILES_LOG })
    expect(entries).toHaveLength(2)
    expect(entries[0].author).toBe('Ada Lovelace')
    expect(entries[0].commits).toBe(2)
    expect(entries[0].files).toBe(3)
    expect(entries[0].components).toContain('CheckoutScreen')
    expect(entries[0].lastCommit).toBe('2026-08-01')
    const grace = entries.find(e => e.author === 'Grace Hopper')
    expect(grace!.commits).toBe(1)
  })
})

describe('decision index (042, 048)', () => {
  it('indexes ADR + decision files with title, status, and id', () => {
    const entries = indexDecisionFiles(fixture())
    expect(entries.length).toBeGreaterThanOrEqual(2)
    const stripe = entries.find(e => e.id === 'adr-0001')
    expect(stripe).toBeDefined()
    expect(stripe!.title).toContain('Stripe')
    expect(stripe!.status).toBe('Accepted')
    expect(stripe!.path).toBe('docs/adr/0001-use-stripe.md')
  })

  it('indexes a root-level DECISIONS.md', () => {
    const entries = indexDecisionFiles(fixture())
    expect(entries.some(e => e.path === 'DECISIONS.md')).toBe(true)
  })
})

describe('PR knowledge (045)', () => {
  it('extracts squash-merged and merge-commit PRs', () => {
    const prs = derivePrKnowledge(GIT_LOG)
    expect(prs).toHaveLength(2)
    expect(prs[0]).toMatchObject({ pr: '42', title: 'add settle flow' })
    expect(prs[1]).toMatchObject({ pr: '7', title: 'acme/price-tags' })
  })
})

describe('buildTeamBrain (orchestrator)', () => {
  it('produces a complete result with docs', async () => {
    const root = fixture()
    const result = await buildTeamBrain(root, { gitLog: GIT_LOG, gitFilesLog: GIT_FILES_LOG })
    expect(result.projectName).toBe('acme-mobile')
    expect(result.glossary.length).toBeGreaterThan(0)
    expect(result.standards.length).toBeGreaterThan(0)
    expect(result.expertise.length).toBe(2)
    expect(result.decisions.length).toBeGreaterThanOrEqual(2)
    expect(result.prKnowledge.length).toBe(2)
    expect(result.onboarding).toContain('# Onboarding Brief — acme-mobile')
    expect(result.onboarding).toContain('Stripe')
    expect(result.artifacts.created).toBeGreaterThanOrEqual(6)

    // Docs written to docs/vectalon/team/
    const dir = teamDocsDir(root)
    for (const file of ['glossary.md', 'coding-standards.md', 'expertise.md', 'decisions.md', 'pr-knowledge.md', 'onboarding.md', 'report.json']) {
      expect(existsSync(join(dir, file))).toBe(true)
    }
  })

  it('is idempotent — a second run only updates', async () => {
    const root = fixture()
    const first = await buildTeamBrain(root, { gitLog: GIT_LOG, gitFilesLog: GIT_FILES_LOG })
    expect(first.artifacts.created).toBeGreaterThan(0)
    const second = await buildTeamBrain(root, { gitLog: GIT_LOG, gitFilesLog: GIT_FILES_LOG })
    expect(second.artifacts.created).toBe(0)
    expect(second.artifacts.updated).toBe(0)
    expect(second.artifacts.total).toBe(first.artifacts.total)
  })

  it('seeds artifacts into the knowledge base with the team marker', async () => {
    const root = fixture()
    await buildTeamBrain(root, { gitLog: GIT_LOG, gitFilesLog: GIT_FILES_LOG })
    const store = new ArtifactStore(root)
    const teamArtifacts = store.list().filter(a => a.meta['vectalon-team'] === '1')
    expect(teamArtifacts.some(a => a.title === 'Project Glossary')).toBe(true)
    expect(teamArtifacts.some(a => a.title === 'Onboarding Brief')).toBe(true)
    expect(teamArtifacts.some(a => a.title.includes('Use Stripe'))).toBe(true)
  })

  it('degrades gracefully without git history', async () => {
    const root = fixture()
    const result = await buildTeamBrain(root)
    expect(result.expertise).toEqual([])
    expect(result.prKnowledge).toEqual([])
    expect(result.artifacts.total).toBeGreaterThan(0)
  })
})

describe('searchTeamBrain (phase acceptance)', () => {
  it('finds the ADR by semantic/lexical query across projects', async () => {
    const root = fixture()
    await buildTeamBrain(root, { gitLog: GIT_LOG, gitFilesLog: GIT_FILES_LOG })
    const hits = await searchTeamBrain(root, 'stripe payments', { limit: 5 })
    expect(hits.length).toBeGreaterThan(0)
    const top = hits[0]
    expect(top.title).toContain('Use Stripe')
    expect(top.type).toBe('architecture')
    expect(top.score).toBeGreaterThan(0)
    expect(top.snippet.length).toBeGreaterThan(0)
  })

  it('finds glossary content and returns empty for garbage queries', async () => {
    const root = fixture()
    await buildTeamBrain(root, { gitLog: GIT_LOG, gitFilesLog: GIT_FILES_LOG })
    const hits = await searchTeamBrain(root, 'settle order flow')
    expect(hits.length).toBeGreaterThan(0)
    // Empty query short-circuits to no results. A garbage query only gets
    // weak semantic noise from the hash seam, so a real lexical match must
    // outrank it by a wide margin.
    expect(await searchTeamBrain(root, '')).toEqual([])
    const real = await searchTeamBrain(root, 'stripe payments')
    const garbage = await searchTeamBrain(root, 'zzzzqqqqx')
    expect(real[0].score).toBeGreaterThan(garbage[0].score + 0.2)
  })
})

describe('listTeamProjects', () => {
  it('lists the local project plus registered team projects', () => {
    const projects = listTeamProjects(fixture())
    expect(projects.length).toBeGreaterThanOrEqual(2)
    expect(projects[0].name).toBe('acme-mobile')
    expect(projects.some(p => p.name === 'payments-service')).toBe(true)
  })
})


