import type { FigmaComponentSpec, FigmaComponentChild } from '../utils/figma'
import { parseFigmaFile } from '../utils/figma'

/**
 * Deterministic React Native code generation from a Figma component spec —
 * no model calls. Converts a parsed COMPONENT node into a functional
 * component with `StyleSheet.create`: absolute bounds become width/height,
 * corner radius and solid fills map 1:1, text children become `<Text>` with
 * their fontSize/color, and layout mode (HORIZONTAL/VERTICAL) drives
 * `flexDirection` with `itemSpacing` as gap.
 *
 * Colors are emitted as design-token references (`theme.colors.<name>`) when
 * the spec carries a palette with a matching value, else as the raw hex.
 */

export interface FigmaGenerateOptions {
  /** Style name for the component file (PascalCase). Defaults to the spec name. */
  componentName?: string
  /** hex → token-name map for converting raw colors to theme references. */
  colorTokens?: Array<{ name: string; value: string }>
  /** When true, wrap the root in ScrollView. Default false. */
  scrollable?: boolean
  /** When true, require('react-native-safe-area-context') SafeAreaView for the root. */
  safeArea?: boolean
}

export interface FigmaGeneratedComponent {
  name: string
  code: string
}

const INDENT = '  '

function jsxName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, ' ').trim()
  const words = cleaned.split(' ').filter(Boolean)
  if (words.length === 0) return 'FigmaComponent'
  const camel = words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

function colorRef(color: string | undefined, palette: Array<{ name: string; value: string }>): string | undefined {
  if (!color) return undefined
  const match = palette.find(p => p.value.toLowerCase() === color.toLowerCase())
  return match ? `theme.colors.${match.name}` : color
}

function childStyle(child: FigmaComponentChild, palette: Array<{ name: string; value: string }>): string[] {
  const lines: string[] = []
  lines.push(`position: 'absolute',`)
  lines.push(`left: ${child.x},`)
  lines.push(`top: ${child.y},`)
  lines.push(`width: ${child.width},`)
  lines.push(`height: ${child.height},`)
  const color = colorRef(child.color, palette)
  if (color) lines.push(`color: ${color.startsWith('#') ? `'${color}'` : color},`)
  if (child.fontSize) lines.push(`fontSize: ${child.fontSize},`)
  if (child.fontWeight) lines.push(`fontWeight: '${child.fontWeight}',`)
  return lines
}

/**
 * Escape Figma text for safe JSX children: `{`/`}` would otherwise be parsed
 * as JSX expressions and crash at runtime, so they become `{"{}"}` literals.
 */
function escapeJsxText(text: string): string {
  // Single pass so inserted escapes are never re-processed (e.g. the `}` in
  // `{"{"}` must not match the closing-brace rule).
  let out = ''
  for (const ch of text) {
    if (ch === '&') out += '&amp;'
    else if (ch === '<') out += '&lt;'
    else if (ch === '>') out += '&gt;'
    else if (ch === '{') out += '{"{"}'
    else if (ch === '}') out += '{"}"}'
    else out += ch
  }
  return out
}

/**
 * Generate a single RN component from a parsed Figma component spec.
 */
export function generateFigmaComponent(
  spec: FigmaComponentSpec,
  options: FigmaGenerateOptions = {}
): FigmaGeneratedComponent {
  const palette = options.colorTokens || []
  const name = options.componentName || jsxName(spec.name)
  const safeArea = options.safeArea === true
  const scrollable = options.scrollable === true
  const rootImport = scrollable ? 'ScrollView' : safeArea ? 'SafeAreaView' : 'View'
  const rootStyleLines: string[] = []
  rootStyleLines.push(`width: ${spec.width},`)
  rootStyleLines.push(`height: ${spec.height},`)
  if (spec.cornerRadius) rootStyleLines.push(`borderRadius: ${spec.cornerRadius},`)
  if (spec.backgroundColor) {
    const ref = colorRef(spec.backgroundColor, palette)
    rootStyleLines.push(`backgroundColor: ${ref?.startsWith('#') ? `'${ref}'` : ref},`)
  }
  if (spec.layoutMode) rootStyleLines.push(`flexDirection: '${spec.layoutMode === 'HORIZONTAL' ? 'row' : 'column'}',`)
  if (spec.itemSpacing) rootStyleLines.push(`gap: ${spec.itemSpacing},`)
  if (spec.paddingTop) rootStyleLines.push(`paddingTop: ${spec.paddingTop},`)
  if (spec.paddingRight) rootStyleLines.push(`paddingRight: ${spec.paddingRight},`)
  if (spec.paddingBottom) rootStyleLines.push(`paddingBottom: ${spec.paddingBottom},`)
  if (spec.paddingLeft) rootStyleLines.push(`paddingLeft: ${spec.paddingLeft},`)

  const childBlocks: string[] = []
  for (const child of spec.children) {
    const styleName = `child${childBlocks.length}`
    if (child.characters) {
      childBlocks.push(`${INDENT}<Text style={styles.${styleName}}>${escapeJsxText(child.characters)}</Text>`)
    } else {
      childBlocks.push(`${INDENT}<View style={styles.${styleName}} />`)
    }
  }

  const styles: string[] = []
  for (let i = 0; i < spec.children.length; i++) {
    styles.push(`${INDENT}${INDENT}${INDENT}child${i}: {`)
    styles.push(...childStyle(spec.children[i], palette).map(l => `${INDENT}${INDENT}${INDENT}${INDENT}${l}`))
    styles.push(`${INDENT}${INDENT}${INDENT}},`)
  }

  const code = [
    `import React from 'react'`,
    `import { StyleSheet, Text, View${scrollable ? ', ScrollView' : ''} } from 'react-native'`,
    safeArea ? `import { SafeAreaView } from 'react-native-safe-area-context'` : '',
    ``,
    `/**`,
    ` * Generated from the Figma component "${spec.name}" (${spec.width}×${spec.height}).`,
    ` * Deterministic output — sizes, radius, colors, and layout map 1:1 from the frame.`,
    ` */`,
    `export function ${name}(): JSX.Element {`,
    `${INDENT}return (`,
    `${INDENT}${INDENT}<${rootImport} style={styles.root}>`,
    ...childBlocks.map(l => `${INDENT}${INDENT}${l}`),
    `${INDENT}${INDENT}</${rootImport}>`,
    `${INDENT})`,
    `}`,
    ``,
    `const styles = StyleSheet.create({`,
    `${INDENT}root: {`,
    ...rootStyleLines.map(l => `${INDENT}${INDENT}${l}`),
    `${INDENT}},`,
    ...styles,
    `})`,
    ``,
  ].filter(l => l !== '').join('\n')

  return { name, code }
}

/**
 * Find a component by name (case-insensitive, matches on the last path
 * segment, e.g. "Button/Primary" matches "Primary" or "button/primary")
 * inside a parsed design system and generate a component from it.
 */
export function findFigmaComponent(
  ds: ReturnType<typeof parseFigmaFile>,
  query: string
): FigmaComponentSpec | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  return (
    ds.components.find(c => c.name.toLowerCase() === q) ||
    ds.components.find(c => c.name.toLowerCase().endsWith(`/${q}`)) ||
    ds.components.find(c => c.name.toLowerCase().includes(q)) ||
    null
  )
}
