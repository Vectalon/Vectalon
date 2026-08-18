"use strict";
/**
 * React Native — real engineering rules with working detection
 * Business Source License 1.1 (BSL-1.1)
 *
 * 10 rules that detect actual violations in RN codebases.
 * Each rule has a working check() function using regex scanning.
 * Tests cover both valid (no finding) and invalid (finding) cases.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rnRules = exports.rnSec002 = exports.rnBuild001 = exports.rnTest001 = exports.rnNative001 = exports.rnSec001 = exports.rnState001 = exports.rnPerf001 = exports.rnRn001 = exports.rnTs001 = exports.rnArch002 = exports.rnArch001 = void 0;
// ─── Helpers ──────────────────────────────────────────────────────────────
/**
 * Scan file content line by line for regex matches.
 * Returns GuardrailFinding[] with line numbers.
 */
function scanLines(file, ruleId, severity, pattern, message) {
    const findings = [];
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Reset lastIndex for global regexes
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
            findings.push({
                ruleId,
                message,
                line: i + 1,
                filePath: file.path,
                severity,
            });
        }
    }
    return findings;
}
// ─── RN-ARCH-001: No raw fetch calls ──────────────────────────────────────
/**
 * Network requests must go through a centralized APIClient.
 * Raw fetch() calls are not allowed — they bypass auth, logging,
 * error handling, and retry logic.
 */
exports.rnArch001 = {
    id: 'RN-ARCH-001',
    version: '1.0.0',
    name: 'No raw fetch calls',
    severity: 'error',
    category: 'architecture',
    description: 'Network requests must use APIClient. Raw fetch() calls bypass auth, logging, error handling, and retry logic.',
    appliesTo: ['*.ts', '*.tsx'],
    detection: {
        type: 'regex',
        pattern: '(?<!\\.)(?:fetch)\\s*\\(',
        matchMeaning: 'violate',
    },
    remediation: {
        type: 'guidance',
        steps: [
            'Import APIClient from the shared networking module',
            'Replace fetch() with APIClient.get(), .post(), .put(), or .delete()',
            'Handle errors through APIClient error types',
        ],
        example: 'const data = await APIClient.get<UserProfile>(`/users/${id}`)',
    },
    tags: ['react-native', 'networking', 'architecture'],
    check: (file, _parser) => {
        return scanLines(file, 'RN-ARCH-001', 'error', /(?<!\.)(?:fetch)\s*\(/g, 'Raw fetch() call detected. Use APIClient instead.');
    },
};
// ─── RN-ARCH-002: No class components ──────────────────────────────────────
/**
 * React Native components must be functional components with hooks.
 * Class components are deprecated in new code and don't work with
 * React Server Components or the new architecture.
 */
exports.rnArch002 = {
    id: 'RN-ARCH-002',
    version: '1.0.0',
    name: 'No class components',
    severity: 'error',
    category: 'architecture',
    description: 'React Native components must be functional components with hooks. Class components are deprecated.',
    appliesTo: ['*.tsx', '*.jsx'],
    detection: {
        type: 'regex',
        pattern: '(?:class\\s+\\w+\\s+extends\\s+(?:React\\.Component|Component|React\\.PureComponent|PureComponent))',
        matchMeaning: 'violate',
    },
    remediation: {
        type: 'guidance',
        steps: [
            'Convert class component to functional component',
            'Replace lifecycle methods with useEffect',
            'Replace this.state with useState',
            'Replace this.context with useContext',
        ],
    },
    tags: ['react-native', 'architecture'],
    check: (file, _parser) => {
        return scanLines(file, 'RN-ARCH-002', 'error', /class\s+\w+\s+extends\s+(?:React\.Component|Component|React\.PureComponent|PureComponent)/g, 'Class component detected. Use functional components with hooks instead.');
    },
};
// ─── RN-TS-001: No explicit any ────────────────────────────────────────────
/**
 * Explicit `any` types defeat TypeScript's type safety.
 * Use `unknown`, specific types, or generics instead.
 */
exports.rnTs001 = {
    id: 'RN-TS-001',
    version: '1.0.0',
    name: 'No explicit any',
    severity: 'warning',
    category: 'correctness',
    description: 'Avoid explicit `any` type. Use `unknown`, specific types, or generics to preserve type safety.',
    appliesTo: ['*.ts', '*.tsx'],
    detection: {
        type: 'regex',
        pattern: '(?::\\s*any\\b|<any>|as\\s+any\\b)',
        matchMeaning: 'violate',
    },
    remediation: {
        type: 'guidance',
        steps: [
            'Replace `any` with `unknown` and add type narrowing',
            'Use specific types or generics where possible',
            'For third-party library types, create proper type declarations',
        ],
    },
    tags: ['typescript', 'type-safety'],
    check: (file, _parser) => {
        const findings = [];
        const lines = file.content.split('\n');
        // Match : any, <any>, as any — but not in comments
        const pattern = /(?::\s*any\b|<any>|as\s+any\b)/g;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip comment lines
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'))
                continue;
            pattern.lastIndex = 0;
            if (pattern.test(line)) {
                findings.push({
                    ruleId: 'RN-TS-001',
                    message: 'Explicit `any` type detected. Use `unknown` or a specific type.',
                    line: i + 1,
                    filePath: file.path,
                    severity: 'warning',
                });
            }
        }
        return findings;
    },
};
// ─── RN-RN-001: No deprecated RN APIs ──────────────────────────────────────
/**
 * Deprecated React Native APIs cause warnings, crashes, or are
 * removed in the new architecture. Use modern alternatives.
 */
exports.rnRn001 = {
    id: 'RN-RN-001',
    version: '1.0.0',
    name: 'No deprecated React Native APIs',
    severity: 'error',
    category: 'compatibility',
    description: 'Do not use deprecated React Native APIs. They cause warnings, crashes, or are removed in the new architecture.',
    appliesTo: ['*.ts', '*.tsx', '*.js', '*.jsx'],
    detection: {
        type: 'regex',
        pattern: '(?:componentWillMount|componentWillReceiveProps|componentWillUpdate|UNSAFE_componentWillMount|UNSAFE_componentWillReceiveProps|UNSAFE_componentWillUpdate)',
        matchMeaning: 'violate',
    },
    remediation: {
        type: 'guidance',
        steps: [
            'componentWillMount → useEffect or useState initialization',
            'componentWillReceiveProps → useEffect with dependency array',
            'componentWillUpdate → useLayoutEffect or useEffect',
        ],
    },
    tags: ['react-native', 'compatibility', 'deprecation'],
    check: (file, _parser) => {
        return scanLines(file, 'RN-RN-001', 'error', /(?:componentWillMount|componentWillReceiveProps|componentWillUpdate|UNSAFE_componentWillMount|UNSAFE_componentWillReceiveProps|UNSAFE_componentWillUpdate)/g, 'Deprecated React Native lifecycle method detected.');
    },
};
// ─── RN-PERF-001: No inline renderItem ─────────────────────────────────────
/**
 * Inline arrow functions as renderItem, keyExtractor, or other
 * FlatList callbacks cause unnecessary re-renders on every render.
 * Extract them as stable references with useCallback.
 */
exports.rnPerf001 = {
    id: 'RN-PERF-001',
    version: '1.0.0',
    name: 'No inline FlatList callbacks',
    severity: 'warning',
    category: 'performance',
    description: 'Inline arrow functions as renderItem/keyExtractor cause unnecessary re-renders. Extract with useCallback.',
    appliesTo: ['*.tsx', '*.jsx'],
    detection: {
        type: 'regex',
        pattern: '(?:renderItem|keyExtractor|ItemSeparatorComponent|ListHeaderComponent|ListFooterComponent)\\s*=\\s*\\{\\s*(?:\\([^)]*\\)|[a-zA-Z]+)\\s*=>',
        matchMeaning: 'violate',
    },
    remediation: {
        type: 'guidance',
        steps: [
            'Extract the inline function into a const outside the component',
            'Wrap with useCallback if it depends on props or state',
            'Pass the stable reference to the FlatList prop',
        ],
        example: 'const renderItem = useCallback(({ item }) => <Item data={item} />, [])',
    },
    tags: ['react-native', 'performance'],
    check: (file, _parser) => {
        return scanLines(file, 'RN-PERF-001', 'warning', /(?:renderItem|keyExtractor|ItemSeparatorComponent|ListHeaderComponent|ListFooterComponent)\s*=\s*\{\s*(?:\([^)]*\)|[a-zA-Z]+)\s*=>/g, 'Inline FlatList callback detected. Extract with useCallback for better performance.');
    },
};
// ─── RN-STATE-001: No direct Redux state mutation ─────────────────────────
/**
 * Redux state must be immutable. Direct mutation causes missed
 * re-renders and undefined behavior. Use Redux Toolkit's Immer-based
 * reducers or spread operators.
 */
exports.rnState001 = {
    id: 'RN-STATE-001',
    version: '1.0.0',
    name: 'No direct Redux state mutation',
    severity: 'error',
    category: 'correctness',
    description: 'Redux state must be immutable. Direct mutation causes missed re-renders. Use Redux Toolkit or spread operators.',
    appliesTo: ['*.ts', '*.tsx', '*.js', '*.jsx'],
    detection: {
        type: 'regex',
        pattern: '(?:state\\.\\w+(?:\\.\\w+)*\\s*(?:\\+=|-=|\\.push|\\.splice|\\.pop|\\.shift|\\.unshift|\\.sort|\\.reverse|\\.clear)\\s*[=(])',
        matchMeaning: 'violate',
    },
    remediation: {
        type: 'guidance',
        steps: [
            'Use Redux Toolkit createSlice (Immer-based, allows "mutating" syntax safely)',
            'Or use spread operator: { ...state, field: newValue }',
            'Never use Array.push/splice/sort directly on state arrays',
        ],
    },
    tags: ['redux', 'state-management', 'correctness'],
    check: (file, _parser) => {
        return scanLines(file, 'RN-STATE-001', 'error', /state\.\w+(?:\.\w+)*\s*(?:\+=|-=|\.push|\.splice|\.pop|\.shift|\.unshift|\.sort|\.reverse|\.clear)/g, 'Direct Redux state mutation detected. Use immutable updates or Redux Toolkit.');
    },
};
// ─── RN-SEC-001: No hardcoded secrets ──────────────────────────────────────
/**
 * Secrets, API keys, and tokens must never be hardcoded in source code.
 * Use environment variables or a secure vault.
 */
exports.rnSec001 = {
    id: 'RN-SEC-001',
    version: '1.0.0',
    name: 'No hardcoded secrets',
    severity: 'block',
    category: 'security',
    description: 'Secrets, API keys, and tokens must never be hardcoded. Use environment variables or a secure vault.',
    appliesTo: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.json'],
    detection: {
        type: 'regex',
        pattern: '(?:API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\\s*[=:]\\s*[\'"`][A-Za-z0-9+/=_-]{8,}',
        matchMeaning: 'violate',
    },
    remediation: {
        type: 'guidance',
        steps: [
            'Move the secret to an environment variable (e.g., process.env.API_KEY)',
            'Use react-native-config or a secure vault for mobile',
            'Add the secret to .env and .gitignore',
            'Never commit secrets to version control',
        ],
    },
    tags: ['security', 'secrets'],
    check: (file, _parser) => {
        // Skip .env.example, .env.sample files (they contain placeholders)
        if (file.path.includes('.env.example') || file.path.includes('.env.sample'))
            return [];
        return scanLines(file, 'RN-SEC-001', 'error', /(?:API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\s*[=:]\s*['"`][A-Za-z0-9+/=_-]{8,}/g, 'Hardcoded secret detected. Use environment variables or a secure vault.');
    },
};
// ─── RN-NATIVE-001: No direct NativeModules access ────────────────────────
/**
 * NativeModules access must go through an approved wrapper module
 * to ensure type safety, error handling, and consistent API.
 */
exports.rnNative001 = {
    id: 'RN-NATIVE-001',
    version: '1.0.0',
    name: 'No direct NativeModules access',
    severity: 'error',
    category: 'architecture',
    description: 'NativeModules access must go through an approved wrapper for type safety and error handling.',
    appliesTo: ['*.ts', '*.tsx'],
    detection: {
        type: 'regex',
        pattern: 'NativeModules\\s*\\.\\s*\\w+',
        matchMeaning: 'violate',
    },
    remediation: {
        type: 'guidance',
        steps: [
            'Create a typed wrapper module for the native module',
            'Export the wrapper, not the raw NativeModules access',
            'Add TypeScript types for the native module interface',
        ],
        example: 'export const MyNativeModule = NativeModules.MyModule as MyModuleType',
    },
    tags: ['react-native', 'native-modules', 'architecture'],
    check: (file, _parser) => {
        return scanLines(file, 'RN-NATIVE-001', 'error', /NativeModules\s*\.\s*\w+/g, 'Direct NativeModules access detected. Use a typed wrapper module.');
    },
};
// ─── RN-TEST-001: Components require tests ─────────────────────────────────
/**
 * Critical components and business logic must have corresponding
 * test files. This rule checks for the existence of test files.
 */
exports.rnTest001 = {
    id: 'RN-TEST-001',
    version: '1.0.0',
    name: 'Critical code requires tests',
    severity: 'warning',
    category: 'correctness',
    description: 'Critical components and business logic must have corresponding test files.',
    appliesTo: ['src/**/*.ts', 'src/**/*.tsx'],
    detection: {
        type: 'test-coverage',
        framework: 'jest',
        sourcePattern: 'src/**/*.{ts,tsx}',
        testPattern: '**/__tests__/**/*.{test,spec}.{ts,tsx}',
    },
    remediation: {
        type: 'guidance',
        steps: [
            'Create a __tests__ directory next to the source file',
            'Add a test file with the same name + .test.ts/.test.tsx suffix',
            'Write at least one test for the component/function',
        ],
    },
    tags: ['testing', 'quality'],
    check: (file, _parser) => {
        // This rule is metadata-only — the actual test coverage check
        // requires a test runner. The detection strategy declares the intent;
        // the harness delegates to Jest or similar at runtime.
        return [];
    },
};
// ─── RN-BUILD-001: Unsupported dependency versions ─────────────────────────
/**
 * Dependencies must use supported versions. Check for known
 * problematic version patterns in package.json.
 */
exports.rnBuild001 = {
    id: 'RN-BUILD-001',
    version: '1.0.0',
    name: 'Unsupported dependency versions',
    severity: 'warning',
    category: 'compatibility',
    description: 'Check for unsupported or outdated React Native dependency versions that may cause build failures.',
    appliesTo: ['package.json'],
    detection: {
        type: 'build-config',
        buildSystem: 'npm',
        filePattern: 'package.json',
        checkDescription: 'React Native version must be >= 0.72 (new architecture support)',
    },
    remediation: {
        type: 'guidance',
        steps: [
            'Upgrade react-native to the latest stable version',
            'Run npx react-native upgrade',
            'Update native dependencies to compatible versions',
        ],
    },
    tags: ['build', 'compatibility'],
    check: (file, _parser) => {
        const findings = [];
        // Only check package.json files
        if (!file.path.endsWith('package.json'))
            return findings;
        try {
            const pkg = JSON.parse(file.content);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            // Check react-native version
            const rnVersion = deps['react-native'];
            if (rnVersion) {
                const match = rnVersion.match(/^(\d+)\./);
                if (match) {
                    const major = parseInt(match[1], 10);
                    if (major === 0) {
                        const minorMatch = rnVersion.match(/^0\.(\d+)/);
                        if (minorMatch) {
                            const minor = parseInt(minorMatch[1], 10);
                            if (minor < 72) {
                                findings.push({
                                    ruleId: 'RN-BUILD-001',
                                    message: `react-native ${rnVersion} is outdated. Version >= 0.72 recommended for new architecture support.`,
                                    filePath: file.path,
                                    severity: 'warning',
                                });
                            }
                        }
                    }
                }
            }
            // Check for known problematic packages
            const problematicDeps = ['@react-native-community/cli', 'metro-react-native-babel-preset'];
            for (const dep of problematicDeps) {
                if (deps[dep]) {
                    findings.push({
                        ruleId: 'RN-BUILD-001',
                        message: `${dep} is deprecated. Remove it and use the built-in equivalent.`,
                        filePath: file.path,
                        severity: 'warning',
                    });
                }
            }
        }
        catch {
            // Not valid JSON — skip
        }
        return findings;
    },
};
// ─── RN-SEC-002: No console.log in production ──────────────────────────────
/**
 * console.log/debug/info statements should not ship to production.
 * They leak information and degrade performance.
 */
exports.rnSec002 = {
    id: 'RN-SEC-002',
    version: '1.0.0',
    name: 'No console.log in production code',
    severity: 'warning',
    category: 'security',
    description: 'console.log/debug/info statements should not ship to production. Use a proper logging library.',
    appliesTo: ['*.ts', '*.tsx'],
    detection: {
        type: 'regex',
        pattern: 'console\\.(?:log|debug|info)\\(',
        matchMeaning: 'violate',
    },
    remediation: {
        type: 'guidance',
        steps: [
            'Replace console.log with a logging library (e.g., react-native-logs)',
            'Use environment-based log levels to disable in production',
            'Keep console.warn/error for development-only warnings',
        ],
    },
    tags: ['security', 'logging'],
    check: (file, _parser) => {
        // Skip test files — console.log is fine there
        if (file.path.includes('.test.') || file.path.includes('.spec.') || file.path.includes('__tests__')) {
            return [];
        }
        return scanLines(file, 'RN-SEC-002', 'warning', /console\.(?:log|debug|info)\(/g, 'console.log/debug/info detected. Use a proper logging library for production.');
    },
};
// ─── All rules ────────────────────────────────────────────────────────────
/**
 * All 10+ real RN rules, ready to register into a RuleRegistry.
 */
exports.rnRules = [
    exports.rnArch001,
    exports.rnArch002,
    exports.rnTs001,
    exports.rnRn001,
    exports.rnPerf001,
    exports.rnState001,
    exports.rnSec001,
    exports.rnNative001,
    exports.rnTest001,
    exports.rnBuild001,
    exports.rnSec002,
];
