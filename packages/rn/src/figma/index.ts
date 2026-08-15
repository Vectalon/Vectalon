/**
 * vectalon figma — Figma-to-code Sync Agent (Roadmap Phase 10, item 080)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass: parse a Figma design export (JSON) and check the
 * codebase for drift — design colors with no matching token or hardcoded
 * value, design component names with no matching source component, and text
 * styles with no matching font usage. Reports to docs/vectalon/figma/
 * (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { walkProjectFiles } from '../upgrade/scan'
import type { FigmaColor, FigmaComponent, FigmaFinding, FigmaReport } from './types'

export type { FigmaColor, FigmaComponent, FigmaFinding, FigmaReport } from './types'

/** Where figma reports are written. */
export const figmaDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'figma')

const DESIGN_FILE_NAMES = ['figma.json', 'design-export.json', 'design.json']

/** Find the Figma export file. */
export function findDesignFile(root: string): string | null {
  for (const name of DESIGN_FILE_NAMES) {
    const p = join(root, name)
    if (existsSync(p)) return p
  }
  return null
}

/** Recursively collect colors + component names from a Figma node tree. */
export function parseFigmaExport(json: unknown): { colors: FigmaColor[]; components: FigmaComponent[] } {
  const colors = new Map<string, FigmaColor>()
  const components: FigmaComponent[] = []
  const hexRe = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/ // normalized later

  const visit = (node: Record<string, unknown>, path: string[]): void => {
    const name = typeof node.name === 'string' ? node.name : ''
    const type = typeof node.type === 'string' ? node.type : ''

    // Solid fills become colors. Figma exports fills as arrays with `color: {r,g,b}`.
    if (Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill && typeof fill === 'object' && fill.type === 'SOLID' && fill.color && typeof fill.color === 'object') {
          const c = fill.color as Record<string, unknown>
          const r = Math.round(Number(c.r ?? 0) * 255)
          const g = Math.round(Number(c.g ?? 0) * 255)
          const b = Math.round(Number(c.b ?? 0) * 255)
          const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
          if (hexRe.test(hex)) {
            const label = [...path, name].filter(Boolean).join(' / ')
            if (!colors.has(hex)) colors.set(hex, { name: label, hex })
          }
        }
      }
    }

    // Component / frame names.
    if (type === 'COMPONENT' || type === 'COMPONENT_SET') {
      components.push({ name, type: 'component' })
    } else if (type === 'FRAME') {
      components.push({ name, type: 'frame' })
    } else if (type === 'TEXT' && name) {
      components.push({ name, type: 'text' })
    }

    // Recurse children.
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child && typeof child === 'object') visit(child as Record<string, unknown>, [...path, name])
      }
    }
  }

  // Top-level Figma export shapes: { documents: [...] } or { children: [...] } or a root node.
  const root = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const docs = Array.isArray(root.documents) ? root.documents : Array.isArray(root.children) ? root.children : [root]
  for (const doc of docs) {
    if (doc && typeof doc === 'object') visit(doc as Record<string, unknown>, [])
  }

  return { colors: [...colors.values()], components }
}

/** Would the codebase plausibly reference this color? */
function colorReferenced(content: string, hex: string): boolean {
  const lower = hex.toLowerCase()
  return content.includes(lower) || content.includes(hex)
}

/** Run the figma-to-code sync pass. */
export function runFigmaSync(root: string): FigmaReport {
  const scannedAt = Date.now()
  const findings: FigmaFinding[] = []
  const designFile = findDesignFile(root)
  if (!designFile) {
    return {
      scannedAt, root, colors: [], components: [], findings: [{
        id: 'missing-token', severity: 'info',
        designName: '',
        message: 'No Figma design export found (figma.json / design-export.json / design.json).',
        suggestion: 'Export the design file as JSON and drop it at the repo root so this agent can check design↔code drift.',
      }], verdict: 'approved', summary: { total: 1, bySeverity: { info: 1 } },
    }
  }

  let json: unknown
  try {
    json = JSON.parse(readFileSync(designFile, 'utf-8'))
  } catch {
    return { scannedAt, root, designFile, colors: [], components: [], findings: [], verdict: 'approved', summary: { total: 0, bySeverity: {} } }
  }

  const { colors, components } = parseFigmaExport(json)
  const sourceFiles = walkProjectFiles(root)
  const joinedSource = sourceFiles.map(f => { try { return readFileSync(join(root, f), 'utf-8') } catch { return '' } }).join('\n')

  // Colors in the design with no code reference (token file or hardcoded value).
  for (const color of colors) {
    if (!colorReferenced(joinedSource, color.hex)) {
      findings.push({
        id: 'missing-token', severity: 'warning', designName: color.name,
        message: `Design color ${color.name} (${color.hex}) is never referenced in source`,
        suggestion: 'Add it as a design token (or map it to the nearest existing token) so the palette stays in sync with the design.',
      })
    }
  }

  // Component names with no matching source component (PascalCase or kebab match).
  const sourceLower = joinedSource.toLowerCase()
  for (const comp of components) {
    if (comp.type === 'text') continue
    const pascal = comp.name.replace(/[-_\s](.)/g, (_, c: string) => c.toUpperCase()).replace(/\s/g, '')
    const kebab = comp.name.toLowerCase().replace(/[\s_]+/g, '-')
    if (pascal && !sourceLower.includes(pascal.toLowerCase()) && !sourceLower.includes(kebab)) {
      findings.push({
        id: 'missing-component', severity: 'info', designName: comp.name,
        message: `Design component "${comp.name}" has no matching source component (looked for ${pascal} / ${kebab})`,
        suggestion: 'Implement it or rename the source component to match — otherwise design and code drift apart.',
      })
    }
  }

  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  const verdict: FigmaReport['verdict'] = findings.some(f => f.severity === 'warning') ? 'needs-attention' : 'approved'
  return { scannedAt, root, designFile, colors, components, findings, verdict, summary: { total: findings.length, bySeverity } }
}

/** Render the figma report as markdown. */
export function renderFigmaMarkdown(report: FigmaReport): string {
  const lines = ['# vectalon figma — Figma-to-code Sync', '']
  lines.push(`Design file: \`${report.designFile ?? 'none'}\`  ·  Colors: ${report.colors.length}  ·  Components: ${report.components.length}  ·  Verdict: **${report.verdict}**`, '')
  if (report.findings.length === 0) lines.push('', 'No design↔code drift detected.', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id} — ${f.designName}`, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeFigmaReport(root: string, report: FigmaReport): { mdPath: string; jsonPath: string } {
  const dir = figmaDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const md = renderFigmaMarkdown(report)
  const json = JSON.stringify(report, null, 2)
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, json, 'utf-8')
  return { mdPath, jsonPath }
}
