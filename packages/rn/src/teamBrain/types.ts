/**
 * vectalon team brain — shared types (Roadmap Phase 6, items 041-049)
 * Business Source License 1.1 (BSL-1.1)
 */

export interface TeamBrainOptions {
  /** Cap on glossary terms (044). Default 40. */
  glossaryLimit?: number
  /** Cap on PR knowledge entries (045). Default 15. */
  maxPrs?: number
  /** Cap on indexed ADR/decision files (042, 048). Default 50. */
  maxDecisions?: number
  /** Injectable `git log --pretty=format:%h|%an|%ai|%s` output (test seam;
   * when absent the real git log is run and failures degrade gracefully). */
  gitLog?: string
  /** Injectable `git log --name-only --pretty=format:%h` output (test seam
   * for author→file ownership in the expertise map). */
  gitFilesLog?: string
}

export interface GlossaryTerm {
  term: string
  /** component | type | constant | identifier */
  kind: GlossaryKind
  /** Total occurrences across scanned files. */
  count: number
  /** Distinct files the term appears in. */
  files: number
  /** Up to 3 example file paths. */
  examples: string[]
}

export type GlossaryKind = 'component' | 'type' | 'constant' | 'identifier'

export type StandardStatus = 'enforced' | 'detected' | 'recommended'

export interface CodingStandard {
  rule: string
  status: StandardStatus
  detail: string
}

export interface ExpertiseEntry {
  author: string
  commits: number
  /** Newest commit date (YYYY-MM-DD) when git dates are available. */
  lastCommit?: string
  /** Distinct files the author touched. */
  files: number
  /** Up to 8 owned components/screens (PascalCase filenames). */
  components: string[]
}

export interface DecisionIndexEntry {
  /** Stable id: ADR number when present, else a slug of the path. */
  id: string
  title: string
  status?: string
  path: string
}

export interface PrKnowledgeEntry {
  pr: string
  title: string
  hash?: string
  author?: string
  date?: string
}

/** The full result of one Team Brain generation pass. */
export interface TeamBrainResult {
  scannedAt: number
  root: string
  projectName: string
  glossary: GlossaryTerm[]
  standards: CodingStandard[]
  expertise: ExpertiseEntry[]
  decisions: DecisionIndexEntry[]
  prKnowledge: PrKnowledgeEntry[]
  /** Rendered onboarding brief (049) — also written to the docs dir. */
  onboarding: string
  /** Knowledge-base seeding stats (idempotent upserts). */
  artifacts: { created: number; updated: number; total: number }
}

export interface TeamSearchHit {
  title: string
  type: string
  project: string
  team?: string
  score: number
  confidence: number
  snippet: string
}
