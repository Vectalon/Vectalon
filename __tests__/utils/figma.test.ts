import { parseFigmaFile, fetchFigmaFile, rgbToHex, solidFillHex } from '../../src/utils/figma'
import type { FigmaFile } from '../../src/utils/figma'

const FIGMA_FIXTURE: FigmaFile = {
  name: 'HVAC Design',
  styles: {
    S1: { name: 'Primary', styleType: 'FILL' },
    S2: { name: 'Body', styleType: 'TEXT' },
    S3: { name: 'Card Shadow', styleType: 'EFFECT' },
  },
  document: {
    type: 'DOCUMENT',
    children: [
      {
        type: 'FRAME',
        name: 'Screens',
        children: [
          {
            type: 'COMPONENT',
            id: 'C1',
            name: 'Button/Primary',
            absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 44 },
            cornerRadius: 8,
            layoutMode: 'HORIZONTAL',
            itemSpacing: 8,
            fills: [{ type: 'SOLID', color: { r: 0.96, g: 0.2, b: 0.1, a: 1 }, visible: true }],
            styles: { fill: 'S1' },
            children: [
              {
                type: 'TEXT',
                name: 'Label',
                characters: 'Press me',
                absoluteBoundingBox: { x: 76, y: 12, width: 48, height: 20 },
                style: { fontFamily: 'Inter', fontWeight: 600, fontSize: 16 },
                fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
                styles: { text: 'S2' },
              },
            ],
          },
          {
            type: 'FRAME',
            name: 'Card',
            absoluteBoundingBox: { x: 0, y: 100, width: 320, height: 120 },
            cornerRadius: 12,
            itemSpacing: 12,
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 16,
            paddingBottom: 16,
            effects: [
              { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 8 },
            ],
            styles: { effect: 'S3' },
            children: [],
          },
        ],
      },
    ],
  },
}

describe('figma parser', () => {
  it('converts Figma 0-1 colors to hex', () => {
    expect(rgbToHex(0.96, 0.2, 0.1)).toBe('#F5331A')
    expect(rgbToHex(1, 1, 1)).toBe('#FFFFFF')
    expect(rgbToHex(0, 0, 0)).toBe('#000000')
  })

  it('reads the solid fill of a node', () => {
    expect(solidFillHex(FIGMA_FIXTURE.document!.children![0].children![0])).toBe('#F5331A')
  })

  it('extracts named design tokens (colors, typography, shadows)', () => {
    const ds = parseFigmaFile(FIGMA_FIXTURE)
    expect(ds.file).toBe('HVAC Design')
    expect(ds.colorPalette).toEqual([{ name: 'Primary', value: '#F5331A' }])
    expect(ds.textStyles).toEqual([
      { name: 'Body', fontFamily: 'Inter', fontWeight: 600, fontSize: 16 },
    ])
    expect(ds.effectStyles).toEqual([
      { name: 'Card Shadow', shadow: '0px 4px 8px rgba(0, 0, 0, 0.25)' },
    ])
  })

  it('collects value scales (spacing, radii, font sizes)', () => {
    const ds = parseFigmaFile(FIGMA_FIXTURE)
    expect(ds.spacing.map(s => s.value).sort()).toEqual(['12', '16', '8'])
    expect(ds.borderRadius.map(s => s.value).sort()).toEqual(['12', '8'])
    expect(ds.fontSizes.map(s => s.value)).toEqual(['16'])
  })

  it('extracts component specs with bounds, radius, fill, and text children', () => {
    const ds = parseFigmaFile(FIGMA_FIXTURE)
    expect(ds.components).toHaveLength(1)
    const button = ds.components[0]
    expect(button.name).toBe('Button/Primary')
    expect(button.width).toBe(200)
    expect(button.height).toBe(44)
    expect(button.cornerRadius).toBe(8)
    expect(button.backgroundColor).toBe('#F5331A')
    expect(button.layoutMode).toBe('HORIZONTAL')
    expect(button.itemSpacing).toBe(8)
    expect(button.children).toHaveLength(1)
    expect(button.children[0].characters).toBe('Press me')
    expect(button.children[0].fontSize).toBe(16)
    expect(button.children[0].fontWeight).toBe(600)
  })

  it('tolerates malformed input without throwing', () => {
    const ds = parseFigmaFile(null)
    expect(ds.components).toHaveLength(0)
    expect(ds.colorPalette).toHaveLength(0)
    expect(parseFigmaFile({ document: { type: 'DOCUMENT' } })).toBeDefined()
  })
})

describe('fetchFigmaFile', () => {
  it('requires a file key', async () => {
    const result = await fetchFigmaFile('', 'token')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('file key')
  })

  it('requires a token', async () => {
    const result = await fetchFigmaFile('abc123', '')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('FIGMA_TOKEN')
  })

  it('fetches and returns the file JSON on success', async () => {
    const fetchFn = async () => ({ ok: true, status: 200, json: async () => FIGMA_FIXTURE })
    const result = await fetchFigmaFile('abc123', 'tok', fetchFn)
    expect(result.ok).toBe(true)
    expect(result.data?.name).toBe('HVAC Design')
  })

  it('maps API errors to a friendly message', async () => {
    const fetchFn = async () => ({ ok: false, status: 404, json: async () => ({}) })
    const result = await fetchFigmaFile('abc123', 'tok', fetchFn)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('404')
    expect(result.error).toContain('file not found')
  })

  it('degrades gracefully on network failure', async () => {
    const fetchFn = async () => {
      throw new Error('ECONNREFUSED')
    }
    const result = await fetchFigmaFile('abc123', 'tok', fetchFn)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ECONNREFUSED')
  })
})
