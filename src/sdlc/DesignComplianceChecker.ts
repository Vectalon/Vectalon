import type { FigmaDesignSystem } from '../utils/figma'

/**
 * Deterministic design-system compliance — the "guardian of design fidelity"
 * half of the Figma bridge. Given generated (or hand-written) RN code and a
 * Figma-derived design system, it flags:
 *
 * - **Geometry drift** — a component's `height`/`borderRadius` differ from the
 *   Figma spec (misaligned buttons, wrong corners)
 * - **Color drift** — a hardcoded hex that isn't in the Figma palette
 * - **Token skips** — a hex that IS in the palette but was inlined instead of
 *   referenced as a theme token
 *
 * Pure regex + value comparison over the code — no model calls.
 */

export type ComplianceSeverity = 'error' | 'warning' | 'info'

export interface ComplianceFinding {
  severity: ComplianceSeverity
  rule: string
  message: string
  line: number
}

export interface ComplianceOptions {
  /** Tolerance (px) for geometry comparisons. Default 2. */
  tolerance?: number
}

interface StyleValue {
  value: number
  line: number
}

function findStyleValue(code: string, prop: string): StyleValue | null {
  // Prefer the `root: { ... }` style block — the component's own geometry — so
  // the FIRST `height:`/`borderRadius:` in the file (which may belong to a
  // child style or an inline child style) is not compared against the spec.
  const rootStart = code.indexOf('root: {')
  const region = rootStart === -1 ? code : code.slice(rootStart)
  const baseLine = rootStart === -1 ? 0 : code.slice(0, rootStart).split('\n').length
  const re = new RegExp(`\\b${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)`)
  const match = re.exec(region)
  if (!match) return null
  const before = region.slice(0, match.index)
  return { value: Number(match[1]), line: baseLine + before.split('\n').length }
}

function hexLiterals(code: string): Array<{ value: string; line: number }> {
  const found: Array<{ value: string; line: number }> = []
  const re = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
  let match: RegExpExecArray | null
  while ((match = re.exec(code)) !== null) {
    const raw = match[0]
    const full = raw.length === 4 ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}` : raw
    const before = code.slice(0, match.index)
    const line = before.split('\n').length
    found.push({ value: full.toUpperCase(), line })
  }
  return found
}

/** Check generated/edited code against the Figma design system. */
export class DesignComplianceChecker {
  check(code: string, ds: FigmaDesignSystem, options: ComplianceOptions = {}): ComplianceFinding[] {
    const findings: ComplianceFinding[] = []
    const tolerance = options.tolerance ?? 2
    const palette = ds.colorPalette
    const paletteValues = new Set(palette.map(p => p.value.toUpperCase()))
    const lower = code.toLowerCase()

    // 1. Geometry drift vs each component spec that plausibly matches the code.
    //    Matching is deliberately strict: the JSX name (ButtonPrimary) or the
    //    full spec name — NOT a bare last-segment substring, so a component
    //    whose name shares a word with the code (e.g. theme.colors.Primary in
    //    an unrelated file) cannot bind geometry checks to the wrong spec.
    let matchedAnyComponent = false
    for (const spec of ds.components) {
      const mentionsComponent =
        lower.includes(jsxNameOf(spec.name).toLowerCase()) ||
        lower.includes(spec.name.toLowerCase())
      if (!mentionsComponent) continue
      matchedAnyComponent = true

      if (spec.height > 0) {
        const height = findStyleValue(code, 'height')
        if (!height) {
          findings.push({
            severity: 'warning',
            rule: 'missing-geometry',
            message: `Component "${spec.name}" has no explicit height in code — Figma specifies ${spec.height}px.`,
            line: 1,
          })
        } else if (Math.abs(height.value - spec.height) > tolerance) {
          findings.push({
            severity: 'error',
            rule: 'height-drift',
            message: `Component "${spec.name}" height is ${height.value}px in code but ${spec.height}px in Figma — the layout no longer matches the design.`,
            line: height.line,
          })
        }
      }
      if (spec.cornerRadius) {
        const radius = findStyleValue(code, 'borderRadius')
        if (!radius) {
          findings.push({
            severity: 'info',
            rule: 'missing-radius',
            message: `Component "${spec.name}" has no borderRadius — Figma specifies ${spec.cornerRadius}px.`,
            line: 1,
          })
        } else if (Math.abs(radius.value - spec.cornerRadius) > tolerance) {
          findings.push({
            severity: 'error',
            rule: 'radius-drift',
            message: `Component "${spec.name}" borderRadius is ${radius.value}px in code but ${spec.cornerRadius}px in Figma.`,
            line: radius.line,
          })
        }
      }
    }

    // When the design defines components but none matched the code, say so — a
    // clean bill must never be mistaken for a full compliance pass when the
    // geometry checks were skipped (e.g. reviewing a bare style snippet).
    if (!matchedAnyComponent && ds.components.length > 0) {
      findings.push({
        severity: 'info',
        rule: 'no-component-match',
        message: `No Figma component matched this code (${ds.components.map(c => c.name).join(', ')}) — geometry checks were skipped; only the color palette was verified.`,
        line: 1,
      })
    }

    // 2. Color fidelity — every hardcoded hex in the code must exist in the
    //    Figma palette, and if it does it should be a token reference.
    for (const hex of hexLiterals(code)) {
      if (!paletteValues.has(hex.value)) {
        findings.push({
          severity: 'warning',
          rule: 'off-palette-color',
          message: `Hardcoded color ${hex.value} is not in the Figma palette — verify it against the design system (${palette.length} token(s) defined).`,
          line: hex.line,
        })
        continue
      }
      const tokenName = palette.find(p => p.value.toUpperCase() === hex.value)?.name
      if (tokenName && !isTokenReference(code, hex)) {
        findings.push({
          severity: 'info',
          rule: 'prefer-token',
          message: `Color ${hex.value} matches Figma token "${tokenName}" — reference the token instead of inlining the hex.`,
          line: hex.line,
        })
      }
    }

    return findings
  }

  render(findings: ComplianceFinding[]): string {
    if (findings.length === 0) {
      return '# Design system compliance\n\n✅ Code matches the Figma design system — no findings.'
    }
    const lines = [
      '# Design system compliance',
      '',
      `${findings.length} finding(s) against the Figma design system:`,
      '',
      '| Severity | Rule | Line | Detail |',
      '|---|---|---|---|',
      ...findings.map(f => `| ${f.severity} | ${f.rule} | ${f.line} | ${f.message} |`),
      '',
    ]
    return lines.join('\n')
  }
}

function jsxNameOf(specName: string): string {
  // Mirror FigmaComponentGenerator's camelized name: Button/Primary → ButtonPrimary.
  const words = specName.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return specName
  const camel = words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

/** True when the code already references `theme.colors.X` / `colors.X` tokens. */
function isTokenReference(code: string, hex: { value: string; line: number }): boolean {
  const lineStart = code.split('\n')[hex.line - 1] || ''
  return /\b(?:theme\.)?colors\.[A-Za-z0-9_.]+|tokens\.[A-Za-z0-9_.]+/.test(lineStart)
}
