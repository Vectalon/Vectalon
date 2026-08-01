import type { KnowledgeSource } from './types'

export const defaultSources: KnowledgeSource[] = [
  {
    id: 'react-native-docs',
    name: 'React Native Documentation',
    description: 'Official React Native docs for latest APIs and best practices',
    urls: ['https://reactnative.dev/docs/getting-started'],
    refreshIntervalMs: 7 * 24 * 60 * 60 * 1000,
    type: 'docs',
  },
  {
    id: 'react-navigation-docs',
    name: 'React Navigation Documentation',
    description: 'Official React Navigation docs for routing patterns',
    urls: ['https://reactnavigation.org/docs/getting-started'],
    refreshIntervalMs: 7 * 24 * 60 * 60 * 1000,
    type: 'docs',
  },
  {
    id: 'expo-docs',
    name: 'Expo Documentation',
    description: 'Official Expo docs for managed-workflow best practices',
    urls: ['https://docs.expo.dev/'],
    refreshIntervalMs: 7 * 24 * 60 * 60 * 1000,
    type: 'docs',
  },
  {
    id: 'react-native-registry',
    name: 'React Native npm Registry',
    description: 'Latest published versions of React Native core packages',
    urls: ['https://registry.npmjs.org/react-native/latest'],
    refreshIntervalMs: 24 * 60 * 60 * 1000,
    type: 'registry',
  },
  {
    id: 'react-navigation-registry',
    name: 'React Navigation npm Registry',
    description: 'Latest published versions of React Navigation packages',
    urls: ['https://registry.npmjs.org/@react-navigation/native/latest'],
    refreshIntervalMs: 24 * 60 * 60 * 1000,
    type: 'registry',
  },
]

export function registrySourcesForDependencies(dependencies: string[]): KnowledgeSource[] {
  return dependencies.map(name => ({
    id: `registry-${name.replace(/[@/]/g, '-')}`,
    name: `npm registry: ${name}`,
    description: `Latest published version of ${name}`,
    urls: [`https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`],
    refreshIntervalMs: 24 * 60 * 60 * 1000,
    type: 'registry',
    metadata: { libraryName: name },
  }))
}
