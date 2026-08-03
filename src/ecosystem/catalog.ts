import type { EcosystemCatalog, EcosystemItem } from './types'

/**
 * Catalog of external MCP servers, agent skills, developer tools, and repo
 * hooks that make an AI agent competent on React Native projects.
 *
 * Sources: expo.dev/docs/mcp, github.com/steve228uk/metro-mcp,
 * github.com/ohah/react-native-mcp, github.com/MrNitro360/React-Native-MCP,
 * github.com/patrickkabwe/react-native-upgrader-mcp, github.com/expo/skills,
 * github.com/callstackincubator/agent-skills.
 *
 * All items are opt-in; nothing here is enabled without `vectalon ecosystem
 * enable <id>` writing a .vectalon/ecosystem.json entry.
 */

const MCP_ITEMS: EcosystemItem[] = [
  {
    id: 'metro-mcp',
    category: 'mcp',
    name: 'Metro MCP',
    description: 'CDP-based runtime inspection for Metro/Hermes: console logs, network, component tree, Redux, UI automation, and test recording (Maestro/Detox/Appium).',
    flavor: 'both',
    url: 'https://github.com/steve228uk/metro-mcp',
    install: 'npx @steve228uk/metro-mcp',
    capabilities: ['device', 'console logs', 'network', 'runtime errors', 'stack symbolication', 'AsyncStorage', 'components', 'redux', 'deeplink', 'permissions', 'filesystem', 'ui-interact', 'navigation', 'accessibility', 'test-recorder'],
    packageName: '@steve228uk/metro-mcp',
  },
  {
    id: 'expo-mcp',
    category: 'mcp',
    name: 'Expo MCP Server',
    description: 'Official Expo MCP: docs search, npx expo install for deps, EAS builds/workflows, TestFlight/Play Store data, and local expo-router sitemap + device logs.',
    flavor: 'expo',
    url: 'https://docs.expo.dev/mcp/',
    install: 'npx expo mcp',
    capabilities: ['search_documentation', 'read_documentation', 'learn', 'add_library', 'workflow_create', 'workflow_run', 'workflow_logs', 'build_run', 'build_list', 'build_logs', 'testflight_crashes', 'playstore_reviews', 'expo_router_sitemap', 'open_devtools', 'collect_app_logs', 'automation_tap'],
    packageName: 'expo-mcp',
  },
  {
    id: 'react-native-mcp',
    category: 'mcp',
    name: 'React Native MCP (ohah)',
    description: 'React Fiber tree + hook state inspection (useState/Zustand), re-render profiler, network mocking, and 49 automation tools via adb/idb.',
    flavor: 'both',
    url: 'https://github.com/ohah/react-native-mcp',
    install: 'npx @ohah/react-native-mcp-server',
    capabilities: ['inspect_fiber_tree', 'read_hook_state', 'track_rerenders', 'mock_network', 'tap', 'swipe', 'screenshot', 'assert', 'evaluate_script', 'ci_yaml'],
    packageName: '@ohah/react-native-mcp-server',
  },
  {
    id: 'react-native-guide-mcp',
    category: 'mcp',
    name: 'React Native Guide MCP',
    description: 'Code quality enforcement: auto-remediation (secrets → env, memory leaks), component refactoring (StyleSheet, FlatList), test generation, and dependency auditing.',
    flavor: 'both',
    url: 'https://github.com/MrNitro360/React-Native-MCP',
    install: 'npx @mrnitro360/react-native-mcp',
    capabilities: ['remediate_code', 'refactor_component', 'generate_tests', 'check_coverage', 'check_accessibility', 'audit_dependencies'],
    packageName: '@mrnitro360/react-native-mcp',
  },
  {
    id: 'react-native-upgrader-mcp',
    category: 'mcp',
    name: 'React Native Upgrader MCP',
    description: 'Track stable/RC RN versions and generate exact upgrade diffs (rn-diff-purge) with migration guidance.',
    flavor: 'rn-cli',
    url: 'https://github.com/patrickkabwe/react-native-upgrader-mcp',
    install: 'npx @patrickkabwe/react-native-upgrader-mcp',
    capabilities: ['get-stable-version', 'get-rc-version', 'get-react-native-diff'],
    packageName: '@patrickkabwe/react-native-upgrader-mcp',
  },
]

const SKILL_ITEMS: EcosystemItem[] = [
  {
    id: 'expo-skills',
    category: 'skill',
    name: 'Expo Skills',
    description: 'Official Expo agent skills: expo-router, native UI, data fetching, tailwind, dev-client, native modules, upgrade, EAS store submission and workflows.',
    flavor: 'expo',
    url: 'https://github.com/expo/skills',
    install: 'npx skills add expo/skills --skill \'*\'',
    capabilities: ['expo-router', 'expo-native-ui', 'expo-data-fetching', 'expo-tailwind-setup', 'expo-dev-client', 'expo-module', 'expo-upgrade', 'eas-app-stores', 'eas-workflows', 'eas-simulator'],
    configPath: '.vectalon/skills/expo',
  },
  {
    id: 'callstack-agent-skills',
    category: 'skill',
    name: 'Callstack Agent Skills',
    description: 'React Native best practices from Callstack: profiling, FlashList, React Compiler, Turbo Modules, R8, bundle size, plus upgrade and brownfield migration workflows.',
    flavor: 'both',
    url: 'https://github.com/callstackincubator/agent-skills',
    install: 'npx skills add callstackincubator/agent-skills --skill react-native-best-practices',
    capabilities: ['react-native-best-practices', 'upgrading-react-native', 'react-native-brownfield-migration', 'create-react-native-library', 'github-actions'],
    configPath: '.vectalon/skills/callstack',
  },
  {
    id: 'senaiverse-rn-agents',
    category: 'skill',
    name: 'SenaiVerse RN Agent System',
    description: '7-role Claude Code agent system for RN/Expo: design token guardian, a11y enforcer, performance budget enforcer, security auditor, plus /feature /review /test commands.',
    flavor: 'both',
    url: 'https://github.com/senaiverse/claude-code-reactnative-expo-agent-system',
    install: 'git clone https://github.com/senaiverse/claude-code-reactnative-expo-agent-system.git',
    capabilities: ['design-token-guardian', 'a11y-compliance-enforcer', 'performance-budget-enforcer', 'security-penetration-specialist', 'grand-architect', 'feature-command', 'review-command'],
  },
]

const TOOL_ITEMS: EcosystemItem[] = [
  {
    id: 'repomix',
    category: 'tool',
    name: 'Repomix',
    description: 'Pack the whole repo (JS + native ios/android layers) into one coherent markdown context file for LLM priming.',
    flavor: 'both',
    url: 'https://github.com/yamadashy/repomix',
    install: 'npx repomix',
    capabilities: ['repo-packing', 'context-priming', 'codebase-summary'],
    packageName: 'repomix',
  },
  {
    id: 'rn-diff-purge',
    category: 'tool',
    name: 'rn-diff-purge',
    description: 'Generate exact diffs between React Native versions for clean upgrades (backend for the upgrader MCP).',
    flavor: 'rn-cli',
    url: 'https://github.com/react-native-community/rn-diff-purge',
    install: 'npm install -D rn-diff-purge',
    capabilities: ['upgrade-diffs', 'version-migration'],
    packageName: 'rn-diff-purge',
  },
  {
    id: 'maestro',
    category: 'tool',
    name: 'Maestro',
    description: 'YAML-based mobile UI testing (iOS + Android) — the simplest E2E option for generated RN apps.',
    flavor: 'both',
    url: 'https://github.com/mobile-dev-inc/Maestro',
    install: 'curl -Ls "https://get.maestro.mobile.dev" | bash',
    capabilities: ['ui-automation', 'yaml-flows', 'ios-android'],
  },
  {
    id: 'detox',
    category: 'tool',
    name: 'Detox',
    description: 'Gray-box E2E testing for RN with native synchronization (expo-dev-client compatible).',
    flavor: 'both',
    url: 'https://github.com/wix/Detox',
    install: 'npm install -D detox && npx detox init',
    capabilities: ['e2e-testing', 'native-sync', 'ci-ready'],
    packageName: 'detox',
  },
  {
    id: 'flashlist',
    category: 'tool',
    name: 'FlashList',
    description: 'Shopify\'s high-performance list — agents should prefer it over ScrollView maps for long lists.',
    flavor: 'both',
    url: 'https://github.com/Shopify/flash-list',
    install: 'npm install @shopify/flash-list',
    capabilities: ['virtualized-list', 'performance'],
    packageName: '@shopify/flash-list',
  },
  {
    id: 'expo-doctor',
    category: 'tool',
    name: 'expo-doctor',
    description: 'Check Expo project health: version alignment, config plugins, dependency compatibility.',
    flavor: 'expo',
    url: 'https://docs.expo.dev/more/expo-doctor/',
    install: 'npx expo-doctor',
    capabilities: ['health-check', 'version-alignment', 'config-validation'],
    packageName: 'expo-doctor',
  },
]

const HOOK_ITEMS: EcosystemItem[] = [
  {
    id: 'husky',
    category: 'hook',
    name: 'Husky',
    description: 'Git hooks for RN projects — run lint/typecheck/tests before commits so the harness\'s generated code never lands broken.',
    flavor: 'both',
    url: 'https://github.com/typicode/husky',
    install: 'npm install -D husky && npx husky init',
    capabilities: ['pre-commit', 'pre-push', 'lint-staged'],
    packageName: 'husky',
  },
  {
    id: 'lint-staged',
    category: 'hook',
    name: 'lint-staged',
    description: 'Run lint/format/typecheck only on staged files — fast pre-commit validation for generated code.',
    flavor: 'both',
    url: 'https://github.com/lint-staged/lint-staged',
    install: 'npm install -D lint-staged',
    capabilities: ['staged-lint', 'staged-format', 'pre-commit'],
    packageName: 'lint-staged',
  },
  {
    id: 'lefthook',
    category: 'hook',
    name: 'Lefthook',
    description: 'Fast, parallel git hooks manager (Go) — an alternative to husky with per-project parallel lint/typecheck.',
    flavor: 'both',
    url: 'https://github.com/evilmartians/lefthook',
    install: 'npm install -D lefthook && npx lefthook install',
    capabilities: ['pre-commit', 'parallel-jobs', 'pre-push'],
    packageName: 'lefthook',
  },
]

export const ECOSYSTEM_CATALOG: EcosystemCatalog = {
  version: '1.0.0',
  items: [...MCP_ITEMS, ...SKILL_ITEMS, ...TOOL_ITEMS, ...HOOK_ITEMS],
}

export const ECOSYSTEM_ITEMS: EcosystemItem[] = ECOSYSTEM_CATALOG.items

export function getEcosystemItem(id: string): EcosystemItem | undefined {
  return ECOSYSTEM_ITEMS.find(i => i.id === id)
}

export function listEcosystemItems(filter?: { category?: string; flavor?: string }): EcosystemItem[] {
  return ECOSYSTEM_ITEMS.filter(i => {
    if (filter?.category && i.category !== filter.category) return false
    if (filter?.flavor && filter.flavor !== 'both' && i.flavor !== filter.flavor && i.flavor !== 'both') return false
    return true
  })
}
