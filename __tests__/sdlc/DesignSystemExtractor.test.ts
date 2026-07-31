import { DesignSystemExtractor } from '../../src/sdlc/DesignSystemExtractor'

const CODE = [
  'const styles = StyleSheet.create({',
  "  primary: { color: '#FF5500', fontSize: 16 },",
  "  card: { backgroundColor: '#ff5500', margin: 16, borderRadius: 8 },",
  '  spacing: { paddingTop: 8 },',
  '})',
].join('\n')

describe('DesignSystemExtractor', () => {
  it('extracts colors, font sizes, spacing, and border radius', () => {
    const ds = new DesignSystemExtractor().extract(CODE)
    expect(ds.colors).toContainEqual({ value: '#ff5500', count: 2 })
    expect(ds.fontSizes).toContainEqual({ value: '16', count: 1 })
    expect(ds.spacing).toContainEqual({ value: '16', count: 1 })
    expect(ds.spacing).toContainEqual({ value: '8', count: 1 })
    expect(ds.borderRadius).toContainEqual({ value: '8', count: 1 })
  })

  it('dedupes repeated values by count', () => {
    const ds = new DesignSystemExtractor().extract(CODE)
    expect(ds.colors.filter(c => c.value === '#ff5500')).toHaveLength(1)
  })

  it('returns empty categories for empty code', () => {
    const ds = new DesignSystemExtractor().extract('')
    expect(ds.colors).toEqual([])
    expect(ds.spacing).toEqual([])
  })

  it('renders a design system report', () => {
    const ds = new DesignSystemExtractor()
    const report = ds.render(ds.extract(CODE))
    expect(report).toContain('Design System')
    expect(report).toContain('#ff5500')
    expect(report).toContain('fontSizes')
  })
})
