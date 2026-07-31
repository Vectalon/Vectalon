import { ComponentGenerator } from '../../src/sdlc/ComponentGenerator'

describe('ComponentGenerator', () => {
  it('generates a functional TypeScript component with styles', () => {
    const out = new ComponentGenerator().generate('Button')
    expect(out).toContain("import React from 'react'")
    expect(out).toContain("import { StyleSheet } from 'react-native'")
    expect(out).toContain("import { View, Text } from 'react-native'")
    expect(out).toContain('const Button: React.FC = () => {')
    expect(out).toContain('StyleSheet.create')
    expect(out).toContain('export default Button')
  })

  it('adds navigation hook when requested', () => {
    const out = new ComponentGenerator().generate('ProfileScreen', { navigation: true })
    expect(out).toContain("import { useNavigation } from '@react-navigation/native'")
    expect(out).toContain('const navigation = useNavigation()')
  })

  it('omits styles when disabled', () => {
    const out = new ComponentGenerator().generate('Card', { styles: false })
    expect(out).not.toContain('StyleSheet')
  })

  it('omits the TypeScript annotation when disabled', () => {
    const out = new ComponentGenerator().generate('Card', { typescript: false })
    expect(out).toContain('const Card = () => {')
    expect(out).not.toContain(': React.FC')
  })

  it('class type delegates to functional output (documented limitation)', () => {
    const out = new ComponentGenerator().generate('Card', { type: 'class' })
    expect(out).toContain('const Card')
  })
})
