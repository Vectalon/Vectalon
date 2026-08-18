"use strict";
/**
 * React — framework profile definition
 * Business Source License 1.1 (BSL-1.1)
 *
 * Base UI framework. React Native extends this.
 * Uses TypeScript as its primary language.
 *
 * Register into a FrameworkProfileRegistry:
 *   registry.register(reactDefinition, 'rn')
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reactDefinition = void 0;
exports.reactDefinition = {
    id: 'react',
    name: 'React',
    version: '18.x',
    language: 'typescript',
    rules: [
        {
            id: 'REACT-MEMO-001',
            version: '1.0.0',
            name: 'Complete dependency arrays',
            description: 'Always include all referenced variables in useMemo, useCallback, and useEffect dependency arrays.',
            severity: 'warning',
            category: 'correctness',
            appliesTo: ['*.tsx', '*.jsx'],
            detection: { type: 'ast', parser: 'typescript-estree', selector: 'CallExpression[callee.name=/use(Memo|Callback|Effect)/]' },
            remediation: { type: 'guidance', steps: ['List all referenced variables in the dependency array'] },
            check: () => [],
        },
        {
            id: 'REACT-COMP-001',
            version: '1.0.0',
            name: 'Functional components only',
            description: 'Use functional components with hooks. Class components are deprecated in new code.',
            severity: 'error',
            category: 'architecture',
            appliesTo: ['*.tsx', '*.jsx'],
            detection: { type: 'ast', parser: 'typescript-estree', selector: 'ClassDeclaration[superClass.name=Component]' },
            remediation: { type: 'guidance', steps: ['Convert class component to functional component with hooks'] },
            check: () => [],
        },
        {
            id: 'REACT-KEY-001',
            version: '1.0.0',
            name: 'Stable keys in lists',
            description: 'Use stable, unique identifiers as keys. Avoid using array index as key.',
            severity: 'warning',
            category: 'correctness',
            appliesTo: ['*.tsx', '*.jsx'],
            detection: { type: 'regex', pattern: String.raw `\.map\(.*=>.*key=\{index\}`, flags: 's', matchMeaning: 'violate' },
            check: () => [],
        },
        {
            id: 'REACT-COND-001',
            version: '1.0.0',
            name: 'Conditional rendering patterns',
            description: 'Prefer early returns or ternary over && for conditional rendering to avoid rendering "0".',
            severity: 'info',
            category: 'style',
            appliesTo: ['*.tsx', '*.jsx'],
            check: () => [],
        },
    ],
    lifecycle: ['mount', 'update', 'unmount', 'error-boundary'],
    patterns: ['hooks', 'context', 'composition', 'render-props'],
    pitfalls: [
        {
            id: 'REACT-PITFALL-001',
            name: 'Stale closure',
            description: 'Functions captured in effects or callbacks may reference stale state. Use functional updates or refs.',
            severity: 'warning',
        },
        {
            id: 'REACT-PITFALL-002',
            name: 'Unnecessary re-renders',
            description: 'Passing new object/array literals or inline functions as props causes child re-renders. Use useMemo/useCallback or move state down.',
            severity: 'warning',
        },
    ],
    config: {},
};
