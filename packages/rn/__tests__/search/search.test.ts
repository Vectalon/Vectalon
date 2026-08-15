/**
 * vectalon search — Semantic Code Search Agent (Roadmap 096) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { runSearch } from '../../src/search'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('search: runSearch', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('finds line-pinned hits and ranks denser files first', () => {
    dir = createTempProject({
      'src/list.ts': 'export function List() {\n  return <FlatList theme={theme} />\n}\n',
      'src/theme.ts': 'const theme = { dark: true }\nexport default theme\nconst helper = theme.color\n',
      'src/other.ts': 'export const unrelated = 1\n',
    })
    const report = runSearch(dir, 'theme')
    expect(report.verdict).toBe('approved')
    expect(report.hits.length).toBeGreaterThanOrEqual(3)
    // theme.ts (2 hits) ranks above list.ts (1 hit)
    expect(report.hits[0].file).toBe('src/theme.ts')
    expect(report.hits[0].line).toBe(1)
    expect(report.filesScanned).toBe(3)
  })

  it('reports no-results for an unmatched query', () => {
    dir = createTempProject({ 'src/a.ts': 'const x = 1\n' })
    const report = runSearch(dir, 'zzz_nothing_here')
    expect(report.hits).toHaveLength(0)
    expect(report.verdict).toBe('needs-attention')
    expect(report.findings.some(f => f.id === 'no-results')).toBe(true)
  })

  it('honors the limit', () => {
    dir = createTempProject({
      'src/a.ts': 'const theme = 1\n',
      'src/b.ts': 'const theme = 2\n',
      'src/c.ts': 'const theme = 3\n',
      'src/d.ts': 'const theme = 4\n',
    })
    const report = runSearch(dir, 'theme', 2)
    expect(report.hits).toHaveLength(2)
  })
})
