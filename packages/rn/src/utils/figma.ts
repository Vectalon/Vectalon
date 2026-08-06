import type { DesignToken } from '../sdlc/DesignSystemExtractor'

/**
 * Figma-to-code bridge — the external source of truth for the design system.
 *
 * `fetchFigmaFile` talks to the Figma REST API (token from the `FIGMA_TOKEN`
 * env var or an explicit argument; fails gracefully when unconfigured or
 * offline). `parseFigmaFile` deterministically walks a Figma file document
 * (the API response shape, or a locally exported JSON) and extracts:
 *
 * - **Design tokens** — named FILL styles → color palette, named TEXT styles →
 *   typography, named EFFECT styles → shadows, plus spacing/radii/font-size
 *   value scales
 * - **Component specs** — COMPONENT nodes with absolute bounds, corner radius,
 *   background fills, layout mode, and text children (characters + style) —
 *   enough to generate RN components and to enforce compliance in review
 *
 * No network calls happen in the parser; everything is unit-testable with
 * fixture JSON.
 */

export interface FigmaColor {
  r: number
  g: number
  b: number
  a: number
}

export interface FigmaTextStyle {
  fontFamily?: string
  fontWeight?: string | number
  fontSize?: number
  lineHeightPx?: number
  letterSpacing?: number
}

export interface FigmaNode {
  id?: string
  name?: string
  type?: string
  children?: FigmaNode[]
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number }
  fills?: Array<{ type?: string; color?: FigmaColor; opacity?: number; visible?: boolean }>
  cornerRadius?: number
  effects?: Array<{ type?: string; color?: FigmaColor; radius?: number; offset?: { x: number; y: number }; spread?: number }>
  style?: FigmaTextStyle
  characters?: string
  layoutMode?: 'HORIZONTAL' | 'VERTICAL'
  itemSpacing?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  styles?: { fill?: string; text?: string; effect?: string }
}

export interface FigmaFile {
  name?: string
  document?: FigmaNode
  styles?: Record<string, { name?: string; styleType?: string }>
}

export interface FigmaComponentChild {
  name: string
  type: string
  characters?: string
  width: number
  height: number
  x: number
  y: number
  color?: string
  fontSize?: number
  fontWeight?: string | number
}

export interface FigmaComponentSpec {
  id: string
  name: string
  width: number
  height: number
  cornerRadius?: number
  backgroundColor?: string
  layoutMode?: 'HORIZONTAL' | 'VERTICAL'
  itemSpacing?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  children: FigmaComponentChild[]
}

export interface FigmaNamedColor {
  name: string
  value: string
}

export interface FigmaNamedTextStyle {
  name: string
  fontFamily: string
  fontWeight: string | number
  fontSize: number
}

export interface FigmaNamedEffect {
  name: string
  /** CSS-ish shadow descriptor: `0px 4px 8px rgba(0, 0, 0, 0.25)`. */
  shadow: string
}

export interface FigmaDesignSystem {
  file: string
  colors: DesignToken[]
  spacing: DesignToken[]
  fontSizes: DesignToken[]
  borderRadius: DesignToken[]
  shadows: DesignToken[]
  colorPalette: FigmaNamedColor[]
  textStyles: FigmaNamedTextStyle[]
  effectStyles: FigmaNamedEffect[]
  components: FigmaComponentSpec[]
}

export interface FigmaFetchResult {
  ok: boolean
  data?: FigmaFile
  error?: string
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[clamp(r * 255), clamp(g * 255), clamp(b * 255)].map(n => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** First visible solid fill of a node, as a hex string. */
export function solidFillHex(node: FigmaNode): string | undefined {
  const fill = (node.fills || []).find(f => f.visible !== false && f.type === 'SOLID' && f.color)
  return fill?.color ? rgbToHex(fill.color.r, fill.color.g, fill.color.b) : undefined
}

function shadowDescriptor(node: FigmaNode): string | undefined {
  const effect = (node.effects || []).find(e => e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW')
  if (!effect) return undefined
  const color = effect.color || { r: 0, g: 0, b: 0, a: 0.25 }
  const offset = effect.offset || { x: 0, y: 4 }
  const radius = effect.radius ?? 8
  const alpha = Math.round((color.a ?? 1) * 100) / 100
  return `${offset.x}px ${offset.y}px ${radius}px rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`
}

function tally(values: string[]): DesignToken[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (value === undefined || value === '') continue
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count }))
}

function walk(node: FigmaNode, visit: (n: FigmaNode) => void): void {
  visit(node)
  for (const child of node.children || []) walk(child, visit)
}

function componentSpec(node: FigmaNode): FigmaComponentSpec {
  const box = node.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 }
  const children: FigmaComponentChild[] = []
  for (const child of node.children || []) {
    const cb = child.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 }
    children.push({
      name: child.name || 'child',
      type: child.type || 'UNKNOWN',
      characters: child.characters,
      width: Math.round(cb.width),
      height: Math.round(cb.height),
      x: Math.round(cb.x - box.x),
      y: Math.round(cb.y - box.y),
      color: solidFillHex(child),
      fontSize: child.style?.fontSize,
      fontWeight: child.style?.fontWeight,
    })
  }
  return {
    id: node.id || 'component',
    name: node.name || 'Component',
    width: Math.round(box.width),
    height: Math.round(box.height),
    cornerRadius: node.cornerRadius,
    backgroundColor: solidFillHex(node),
    layoutMode: node.layoutMode,
    itemSpacing: node.itemSpacing,
    paddingLeft: node.paddingLeft,
    paddingRight: node.paddingRight,
    paddingTop: node.paddingTop,
    paddingBottom: node.paddingBottom,
    children,
  }
}

/**
 * Deterministically parse a Figma file document (API response or exported
 * JSON) into design tokens + component specs. Never throws on malformed input
 * — unknown shapes yield empty collections.
 */
export function parseFigmaFile(json: unknown, fileName = 'untitled'): FigmaDesignSystem {
  const file = (json || {}) as FigmaFile
  const name = file.name || fileName
  const document = file.document
  const styles = file.styles || {}

  // Named style maps: styleId → token name per styleType.
  const fillStyleNames = new Map<string, string>()
  const textStyleNames = new Map<string, string>()
  const effectStyleNames = new Map<string, string>()
  for (const [id, s] of Object.entries(styles)) {
    if (s?.styleType === 'FILL') fillStyleNames.set(id, s.name || id)
    else if (s?.styleType === 'TEXT') textStyleNames.set(id, s.name || id)
    else if (s?.styleType === 'EFFECT') effectStyleNames.set(id, s.name || id)
  }

  const colorPalette = new Map<string, FigmaNamedColor>()
  const textStyles = new Map<string, FigmaNamedTextStyle>()
  const effectStyles = new Map<string, FigmaNamedEffect>()
  const components: FigmaComponentSpec[] = []
  const radii: string[] = []
  const spacing: string[] = []
  const fontSizes: string[] = []

  if (document) {
    walk(document, node => {
      if (node.styles?.fill && fillStyleNames.has(node.styles.fill)) {
        const hex = solidFillHex(node)
        if (hex) colorPalette.set(node.styles.fill, { name: fillStyleNames.get(node.styles.fill) as string, value: hex })
      }
      if (node.styles?.text && textStyleNames.has(node.styles.text) && node.style) {
        const fontSize = node.style.fontSize
        if (fontSize !== undefined) {
          textStyles.set(node.styles.text, {
            name: textStyleNames.get(node.styles.text) as string,
            fontFamily: node.style.fontFamily || 'System',
            fontWeight: node.style.fontWeight ?? 'normal',
            fontSize,
          })
        }
      }
      if (node.styles?.effect && effectStyleNames.has(node.styles.effect)) {
        const shadow = shadowDescriptor(node)
        if (shadow) effectStyles.set(node.styles.effect, { name: effectStyleNames.get(node.styles.effect) as string, shadow })
      }
      if (node.type === 'COMPONENT') {
        components.push(componentSpec(node))
      }
      if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) radii.push(String(node.cornerRadius))
      if (typeof node.itemSpacing === 'number' && node.itemSpacing > 0) spacing.push(String(node.itemSpacing))
      for (const pad of [node.paddingLeft, node.paddingRight, node.paddingTop, node.paddingBottom]) {
        if (typeof pad === 'number' && pad > 0) spacing.push(String(pad))
      }
      if (typeof node.style?.fontSize === 'number' && node.style.fontSize > 0) fontSizes.push(String(node.style.fontSize))
    })
  }

  return {
    file: name,
    colors: tally([...colorPalette.values()].map(c => c.value)),
    spacing: tally(spacing),
    fontSizes: tally(fontSizes),
    borderRadius: tally(radii),
    shadows: tally([...effectStyles.values()].map(e => e.shadow)),
    colorPalette: [...colorPalette.values()],
    textStyles: [...textStyles.values()],
    effectStyles: [...effectStyles.values()],
    components,
  }
}

/** Read the Figma personal access token: explicit arg wins over the env var. */
export function resolveFigmaToken(explicit?: string): string {
  return (explicit && explicit.trim()) || process.env.FIGMA_TOKEN || ''
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/**
 * Fetch a Figma file from the REST API. Returns `{ ok: false, error }` instead
 * of throwing on missing tokens, network failures, and API errors — the MCP
 * tools degrade gracefully (no live call happens in tests unless a fetchFn is
 * injected).
 */
export async function fetchFigmaFile(
  fileKey: string,
  token: string,
  fetchFn: FetchLike = fetch
): Promise<FigmaFetchResult> {
  if (!fileKey.trim()) return { ok: false, error: 'A Figma file key is required (the part of the file URL after /file/).' }
  if (!token.trim()) return { ok: false, error: 'No Figma token configured — set the FIGMA_TOKEN env var or pass `token`.' }
  try {
    const response = await fetchFn(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey.trim())}`, {
      method: 'GET',
      headers: { 'X-Figma-Token': token.trim() },
    })
    if (!response.ok) {
      return { ok: false, error: `Figma API returned ${response.status}${response.status === 404 ? ' — file not found (check the key, or that the token can access it)' : ''}` }
    }
    return { ok: true, data: (await response.json()) as FigmaFile }
  } catch (err) {
    return { ok: false, error: `Figma API request failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Render a parsed design system as markdown for artifacts / tool output. */
export function renderFigmaDesignSystem(ds: FigmaDesignSystem): string {
  const lines = [
    `# Design System: ${ds.file}`,
    '',
    `## Colors (${ds.colorPalette.length})`,
    ...(ds.colorPalette.length > 0 ? ds.colorPalette.map(c => `- \`${c.value}\` — ${c.name}`) : ['- none']),
    '',
    `## Typography (${ds.textStyles.length})`,
    ...(ds.textStyles.length > 0
      ? ds.textStyles.map(t => `- ${t.name}: ${t.fontSize}px ${t.fontFamily} (${t.fontWeight})`)
      : ['- none']),
    '',
    `## Shadows (${ds.effectStyles.length})`,
    ...(ds.effectStyles.length > 0 ? ds.effectStyles.map(e => `- ${e.name}: ${e.shadow}`) : ['- none']),
    '',
    `## Spacing scale`,
    ...(ds.spacing.length > 0 ? ds.spacing.map(s => `- ${s.value} (x${s.count})`) : ['- none']),
    '',
    `## Border radius scale`,
    ...(ds.borderRadius.length > 0 ? ds.borderRadius.map(s => `- ${s.value} (x${s.count})`) : ['- none']),
    '',
    `## Components (${ds.components.length})`,
    ...(ds.components.length > 0
      ? ds.components.map(c => {
          const text = c.children.filter(ch => ch.characters).map(ch => `"${ch.characters}"`).join(', ')
          return `- **${c.name}** — ${c.width}×${c.height}${c.cornerRadius ? `, radius ${c.cornerRadius}` : ''}${c.backgroundColor ? `, bg ${c.backgroundColor}` : ''}${text ? ` (text: ${text})` : ''}`
        })
      : ['- none']),
    '',
  ]
  return lines.join('\n')
}
