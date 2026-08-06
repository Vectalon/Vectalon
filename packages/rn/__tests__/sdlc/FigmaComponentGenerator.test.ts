import { generateFigmaComponent, findFigmaComponent } from '../../src/sdlc/FigmaComponentGenerator'
import { parseFigmaFile } from '../../src/utils/figma'
import type { FigmaComponentSpec } from '../../src/utils/figma'

const BUTTON_SPEC: FigmaComponentSpec = {
  id: 'C1',
  name: 'Button/Primary',
  width: 200,
  height: 44,
  cornerRadius: 8,
  backgroundColor: '#F5331A',
  layoutMode: 'HORIZONTAL',
  itemSpacing: 8,
  children: [
    {
      name: 'Label',
      type: 'TEXT',
      characters: 'Press me',
      width: 48,
      height: 20,
      x: 76,
      y: 12,
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: 600,
    },
  ],
}

describe('generateFigmaComponent', () => {
  it('maps the spec to a functional RN component with StyleSheet', () => {
    const { name, code } = generateFigmaComponent(BUTTON_SPEC)
    expect(name).toBe('ButtonPrimary')
    expect(code).toContain('export function ButtonPrimary(): JSX.Element')
    expect(code).toContain('width: 200,')
    expect(code).toContain('height: 44,')
    expect(code).toContain('borderRadius: 8,')
    expect(code).toContain("backgroundColor: '#F5331A',")
    expect(code).toContain("flexDirection: 'row',")
    expect(code).toContain('gap: 8,')
    expect(code).toContain('Press me')
    expect(code).toContain('const styles = StyleSheet.create({')
    expect(code).toContain('position: \'absolute\',')
  })

  it('references theme tokens when the palette matches the fill', () => {
    const { code } = generateFigmaComponent(BUTTON_SPEC, {
      colorTokens: [{ name: 'Primary', value: '#F5331A' }],
    })
    expect(code).toContain('backgroundColor: theme.colors.Primary')
    expect(code).not.toContain("backgroundColor: '#F5331A'")
  })

  it('uses SafeAreaView when requested', () => {
    const { code } = generateFigmaComponent(BUTTON_SPEC, { safeArea: true })
    expect(code).toContain("import { SafeAreaView } from 'react-native-safe-area-context'")
    expect(code).toContain('<SafeAreaView style={styles.root}>')
  })

  it('handles a spec with no text children', () => {
    const { code } = generateFigmaComponent({ ...BUTTON_SPEC, children: [] })
    expect(code).not.toContain('<Text')
    expect(code).toContain('<View style={styles.root}>')
  })

  it('escapes JSX-breaking characters in Figma text', () => {
    const { code } = generateFigmaComponent({
      ...BUTTON_SPEC,
      children: [{ ...BUTTON_SPEC.children[0], characters: '5 {units} <ok> & more' }],
    })
    // Braces must become JSX string literals, not expressions; <> must be entities.
    expect(code).toContain('5 {"{"}units{"}"} &lt;ok&gt; &amp; more')
    expect(code).not.toContain('{units}')
  })

  it('emits child padding and converts child colors to tokens', () => {
    const { code } = generateFigmaComponent(
      {
        ...BUTTON_SPEC,
        paddingTop: 16,
        children: [{ ...BUTTON_SPEC.children[0], color: '#FFFFFF' }],
      },
      { colorTokens: [{ name: 'White', value: '#FFFFFF' }] }
    )
    expect(code).toContain('paddingTop: 16,')
    expect(code).toContain('color: theme.colors.White,')
  })

  it('wraps the root in ScrollView when requested', () => {
    const { code } = generateFigmaComponent(BUTTON_SPEC, { scrollable: true })
    expect(code).toContain('ScrollView')
    expect(code).toContain('<ScrollView style={styles.root}>')
    expect(code).toContain('</ScrollView>')
  })
})

describe('findFigmaComponent', () => {
  const ds = parseFigmaFile({
    name: 'x',
    document: {
      type: 'DOCUMENT',
      children: [
        {
          type: 'COMPONENT',
          id: 'c1',
          name: 'Button/Primary',
          absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
          children: [],
        },
        {
          type: 'COMPONENT',
          id: 'c2',
          name: 'Input/Text',
          absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
          children: [],
        },
      ],
    },
  })

  it('matches by full name, last segment, and substring', () => {
    expect(findFigmaComponent(ds, 'Button/Primary')?.id).toBe('c1')
    expect(findFigmaComponent(ds, 'Primary')?.id).toBe('c1')
    expect(findFigmaComponent(ds, 'button')?.id).toBe('c1')
    expect(findFigmaComponent(ds, 'nope')).toBeNull()
  })

  it('returns null for unknown or empty queries', () => {
    expect(findFigmaComponent(ds, 'Nope')).toBeNull()
    expect(findFigmaComponent(ds, '')).toBeNull()
  })
})
