export class ComponentGenerator {
  generate(name: string, options: {
    type?: 'functional' | 'class'
    typescript?: boolean
    styles?: boolean
    navigation?: boolean
  } = {}): string {
    const {
      type = 'functional',
      typescript = true,
      styles = true,
      navigation = false,
    } = options

    if (type === 'functional') {
      return this.generateFunctional(name, { typescript, styles, navigation })
    }
    return this.generateClass(name, { typescript, styles, navigation })
  }

  private generateFunctional(
    name: string,
    { typescript, styles, navigation }: Record<string, boolean>
  ): string {
    const typeAnnotation = typescript ? ': React.FC' : ''
    const styleImport = styles
      ? "import { StyleSheet } from 'react-native'"
      : ''
    const navImport = navigation
      ? "import { useNavigation } from '@react-navigation/native'"
      : ''
    const navHook = navigation ? '\n  const navigation = useNavigation()' : ''

    const lines = [
      "import React from 'react'",
      styleImport,
      navImport,
      "import { View, Text } from 'react-native'",
      '',
      `const ${name}${typeAnnotation} = () => {`,
      navHook,
      '  return (',
      '    <View style={styles.container}>',
      `      <Text>${name}</Text>`,
      '    </View>',
      '  )',
      '}',
      '',
    ]

    if (styles) {
      lines.push(
        'const styles = StyleSheet.create({',
        '  container: {',
        '    flex: 1,',
        '    justifyContent: "center",',
        '    alignItems: "center",',
        '  },',
        '})',
        ''
      )
    }

    lines.push(`export default ${name}`)
    return lines.filter(l => l !== '' || lines.indexOf(l) < lines.length - 1).join('\n')
  }

  private generateClass(
    name: string,
    { typescript, styles, navigation }: Record<string, boolean>
  ): string {
    return this.generateFunctional(name, { typescript, styles, navigation })
  }
}
