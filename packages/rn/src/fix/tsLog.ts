/**
 * vc fix — TypeScript regression analyzer. The directive's failure families
 * explicitly include "TypeScript regressions": tsc output (`error TS2307:
 * Cannot find module ...`) that appears after an RN upgrade or a refactor.
 * Pure text parsing of `tsc --noEmit` / `tsc -b` output, hermetic-testable.
 * Business Source License 1.1 (BSL-1.1)
 */
import type { LogAnalysis } from '../projectDiagnostics/types'

interface TsPattern {
  id: string
  name: string
  re: RegExp
  fix: string
}

/** The top RN TypeScript regression classes, ordered most-specific first. */
export const TS_PATTERNS: TsPattern[] = [
  {
    id: 'ts-module-not-found',
    name: 'Module not found (TS2307)',
    re: /error\s+TS2307:\s*Cannot find module ['"][^'"]+['"]/i,
    fix: 'The import specifier does not resolve: `npm install` the package (or add its types via @types/…), fix the relative path/extension, and for RN-only code confirm the module is in package.json dependencies before importing it.',
  },
  {
    id: 'ts-cannot-find-name',
    name: 'Cannot find name (TS2304)',
    re: /error\s+TS2304:\s*Cannot find name ['"][^'"]+['"]/i,
    fix: 'The identifier is not declared in scope: add the import (`import { X } from "…"`) or declare/type the variable; this often appears after a refactor that dropped an import.',
  },
  {
    id: 'ts-property-not-exist',
    name: 'Property does not exist (TS2339)',
    re: /error\s+TS2339:\s*Property ['"][^'"]+['"] does not exist on type/i,
    fix: 'The property is not on the type: use the correct prop/API name, extend the type, or narrow with a type guard. After an RN upgrade, the most common cause is an API renamed on a component (e.g. Image.propTypes removal).',
  },
  {
    id: 'ts-type-not-assignable',
    name: 'Type not assignable (TS2322)',
    re: /error\s+TS2322:\s*Type ['"][^'"]+['"] is not assignable to type/i,
    fix: 'The value type does not match the expected prop/state type: align the value or the declared type; after a dependency upgrade the library types often tighten (e.g. Pressable children → React.ReactNode).',
  },
  {
    id: 'ts-missing-props',
    name: 'Missing required props (TS2739/TS2741)',
    re: /error\s+TS(?:2739|2741):\s*Type ['"][^'"]+['"] is missing the following properties/i,
    fix: 'A required prop was dropped at the call site: add the missing props (the compiler lists them). This is the classic regression when a component gains a required prop.',
  },
  {
    id: 'ts-no-exported-member',
    name: 'No exported member (TS2305)',
    re: /error\s+TS2305:\s*Module ['"][^'"]+['"] has no exported member ['"][^'"]+['"]/i,
    fix: 'The named export does not exist (or was renamed): import the correct name, or fix the export in the source module. Check for a renamed export after a refactor.',
  },
  {
    id: 'ts-duplicate-identifier',
    name: 'Duplicate identifier (TS2300)',
    re: /error\s+TS2300:\s*Duplicate identifier/i,
    fix: 'Two declarations share a name in the same scope: rename one, remove the shadowing import, or dedupe the re-export. Commonly from a merge conflict or a duplicated import line.',
  },
  {
    id: 'ts-jsx-not-supported',
    name: 'JSX not supported / react-jsx (TS17004/TS2792)',
    re: /error\s+TS(?:17004|2792):\s*(?:Cannot use JSX|Cannot find module 'react'|Module 'react' cannot be used as a JSX component)/i,
    fix: 'The tsconfig jsx setting or react types are off: set `"jsx": "react-native"` (or react-jsx) in tsconfig.json, and install @types/react + @types/react-native matching the RN version.',
  },
  {
    id: 'ts-unknown-property',
    name: 'Unknown prop on component (TS2322 unknown)',
    re: /error\s+TS2322:\s*Property ['"][^'"]+['"] does not exist on type .*IntrinsicAttributes/i,
    fix: 'A prop is being passed that the component does not accept: remove the prop or extend the props type. After an RN upgrade, deprecated props (e.g. `accessibilityRole` → `role`) surface exactly this.',
  },
  {
    id: 'ts-this-expression',
    name: 'this implicitly has type any (TS2683/TS7006)',
    re: /error\s+TS(?:2683|7006):\s*(?:'this' implicitly has type 'any'|Parameter ['"][^'"]+['"] implicitly has an 'any' type)/i,
    fix: 'Strict mode needs explicit types: annotate the parameter/this, or add `"noImplicitAny": false` only as a last resort. New RN templates are strict — porting older code surfaces this everywhere.',
  },
]

/** Parse a tsc log and return the root-cause classification. */
export function analyzeTsLog(log: string): LogAnalysis {
  const matches: LogAnalysis['matches'] = []
  const lines = log.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of TS_PATTERNS) {
      if (pattern.re.test(line)) {
        matches.push({ id: pattern.id, name: pattern.name, line: i + 1, fix: pattern.fix })
      }
    }
  }
  const first = matches[0] ?? null
  const rootCause = first ? { id: first.id, name: first.name, fix: first.fix } : null
  const evidence = lines.filter(l => l.trim()).slice(-25)
  return { rootCause, matches, evidence }
}
