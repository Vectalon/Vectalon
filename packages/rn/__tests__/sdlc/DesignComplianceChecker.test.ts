import { DesignComplianceChecker } from '../../src/sdlc/DesignComplianceChecker'
import { parseFigmaFile } from '../../src/utils/figma'

const DS = parseFigmaFile({
  name: 'Design',
  styles: {
    S1: { name: 'Primary', styleType: 'FILL' },
  },
  document: {
    type: 'DOCUMENT',
    children: [
      {
        type: 'COMPONENT',
        id: 'c1',
        name: 'Button/Primary',
        absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 44 },
        cornerRadius: 8,
        fills: [{ type: 'SOLID', color: { r: 0.96, g: 0.2, b: 0.1, a: 1 } }],
        styles: { fill: 'S1' },
        children: [],
      },
    ],
  },
})

function code(overrides: string[], fnName = 'ButtonPrimary'): string {
  return [
    "import React from 'react'",
    "import { View, Text, StyleSheet } from 'react-native'",
    '',
    `export function ${fnName}() {`,
    '  return <View style={styles.root}><Text>Hi</Text></View>',
    '}',
    '',
    'const styles = StyleSheet.create({',
    '  root: {',
    ...overrides,
    '  },',
    '})',
    '',
  ].join('\n')
}

const MATCHING = code(['width: 200,', 'height: 44,', 'borderRadius: 8,', 'backgroundColor: theme.colors.Primary,'])

describe('DesignComplianceChecker', () => {
  it('passes code that matches the Figma spec', () => {
    const findings = new DesignComplianceChecker().check(MATCHING, DS)
    expect(findings).toHaveLength(0)
    expect(new DesignComplianceChecker().render([])).toContain('✅')
  })

  it('flags height drift as an error', () => {
    const findings = new DesignComplianceChecker().check(code(['height: 48,', 'borderRadius: 8,']), DS)
    const drift = findings.find(f => f.rule === 'height-drift')
    expect(drift).toBeDefined()
    expect(drift!.severity).toBe('error')
    expect(drift!.message).toContain('48px')
    expect(drift!.message).toContain('44px')
  })

  it('flags radius drift as an error', () => {
    const findings = new DesignComplianceChecker().check(code(['height: 44,', 'borderRadius: 12,']), DS)
    expect(findings.find(f => f.rule === 'radius-drift')).toBeDefined()
  })

  it('warns when a component omits its Figma-specified height', () => {
    const findings = new DesignComplianceChecker().check(code(['width: 200,']), DS)
    expect(findings.find(f => f.rule === 'missing-geometry')).toBeDefined()
  })

  it('warns on hardcoded colors outside the Figma palette', () => {
    const findings = new DesignComplianceChecker().check(code(["backgroundColor: '#00FF00',"]), DS)
    const off = findings.find(f => f.rule === 'off-palette-color')
    expect(off).toBeDefined()
    expect(off!.severity).toBe('warning')
    expect(off!.message).toContain('#00FF00')
  })

  it('suggests tokens for palette colors that are inlined', () => {
    const inlineCode = code(['height: 44,', 'borderRadius: 8,', "backgroundColor: '#F5331A',"])
    const findings = new DesignComplianceChecker().check(inlineCode, DS)
    const prefer = findings.find(f => f.rule === 'prefer-token')
    // #F5331A IS in the palette → info finding, and it must NOT be flagged as
    // off-palette.
    expect(prefer).toBeDefined()
    expect(prefer!.severity).toBe('info')
    expect(prefer!.message).toContain('Primary')
    expect(findings.find(f => f.rule === 'off-palette-color')).toBeUndefined()
  })

  it('does not suggest tokens when the code already references theme colors', () => {
    const tokenCode = code(['height: 44,', 'borderRadius: 8,', 'backgroundColor: theme.colors.Primary,'])
    const findings = new DesignComplianceChecker().check(tokenCode, DS)
    expect(findings.find(f => f.rule === 'prefer-token')).toBeUndefined()
    expect(findings.find(f => f.rule === 'off-palette-color')).toBeUndefined()
  })

  it('does not compare a child height against the spec when the root has one', () => {
    // First `height:` belongs to a child style, but the root block has 44 —
    // the checker must compare the ROOT, not the first match in the file.
    const childFirst = [
      'width: 200,',
      'height: 44,',
      'borderRadius: 8,',
      '},',
      '  child: {',
      '    height: 20,',
      '    position: "absolute",',
    ]
    const findings = new DesignComplianceChecker().check(code(childFirst), DS)
    expect(findings.find(f => f.rule === 'height-drift')).toBeUndefined()
    expect(findings.find(f => f.rule === 'missing-geometry')).toBeUndefined()
  })

  it('does not bind geometry checks to a spec merely because a word matches', () => {
    // Code mentions `theme.colors.Primary` but is NOT the Button component.
    const unrelated = [
      'backgroundColor: theme.colors.Primary,',
      'height: 90,',
      'borderRadius: 4,',
    ]
    const findings = new DesignComplianceChecker().check(code(unrelated, 'ProfileCard'), DS)
    // No ButtonPrimary / Button/Primary match → geometry skipped with an info
    // note, never a bogus height-drift error.
    expect(findings.find(f => f.rule === 'height-drift')).toBeUndefined()
    expect(findings.find(f => f.rule === 'no-component-match')).toBeDefined()
  })

  it('reports when no component matched so a clean bill is never implied', () => {
    const findings = new DesignComplianceChecker().check(code(['width: 200,'], 'ProfileCard'), DS)
    const note = findings.find(f => f.rule === 'no-component-match')
    expect(note).toBeDefined()
    expect(note!.severity).toBe('info')
    expect(note!.message).toContain('geometry checks were skipped')
  })

  it('renders findings as a markdown table', () => {
    const findings = new DesignComplianceChecker().check(code(['height: 48,']), DS)
    const md = new DesignComplianceChecker().render(findings)
    expect(md).toContain('# Design system compliance')
    expect(md).toContain('| Severity | Rule | Line | Detail |')
  })
})
