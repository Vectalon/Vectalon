import { rules, runGuardrails } from '../../src/guardrails'
import * as ts from 'typescript'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import { readFileSync } from 'fs'
import { fixGenerate } from '../../src/bench/fix'

const rule = rules.find(rule => rule.id === 'typescript-strict')!
const check = (content: string) => rule.check({ filePath: 'src/value.ts', content })

it('labels an annotation style policy, not implicit-any semantic analysis', () => {
  expect(rule.name).toBe('Directly exported function declarations have return annotations')
  expect(rule.severity).toBe('info')
  expect(rule.description).toContain('not compiler implicit-any analysis')
})

it.each([
  'export function value(input: number) { return input; }',
  'export async function value() { return 1; }',
  'export default function () { return 1; }',
  'export function* value() { yield 1; }',
  'export declare function value(input: number);',
])('requires a return annotation independently of parameter types: %s', content => {
  expect(check(content).passed).toBe(false)
})

it('checks every direct function export and reports the first missing annotation line', () => {
  expect(check('export function first(): number { return 1; }\nexport function second(input: number) { return input; }'))
    .toMatchObject({ passed: false, line: 2 })
})

it.each([
  'export function value(input: number): number { return input; }',
  'export default async function (): Promise<number> { return 1; }',
  'export function value(): { count: number } { return { count: 1 }; }',
  'export declare function value(input: number): number;',
  '// export function fake() {}\nexport const text = "export function fake() {}";',
  'function local() { return 1; }\nexport { local };',
  'export const arrow = () => 1;',
])('passes annotations or intentionally out-of-scope forms: %s', content => {
  expect(check(content).passed).toBe(true)
})

it('does not silently pass unparseable TypeScript or apply TS policy to JS', () => {
  expect(check('export function broken(')).toMatchObject({ passed: false, message: expect.stringContaining('Could not assess') })
  const result = runGuardrails({ filePath: 'value.js', content: 'export function value() { return 1; }', rules: [rule] })
  expect(result.skipped).toBe(1)
})

it('keeps inferred returns and actual implicit-any compiler errors distinct from annotation policy', () => {
  const root = createTempProject({ 'inferred.ts': 'export function inferred() { return 1; }',
    'implicit.ts': 'export function implicit(value): unknown { return value; }' })
  try {
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(['inferred.ts', 'implicit.ts'].map(file => join(root, file)), {
      strict: true, noEmit: true, types: [], skipLibCheck: true, target: ts.ScriptTarget.ES2020,
    }))
    expect(diagnostics.filter(diagnostic => diagnostic.file?.fileName.endsWith('inferred.ts'))).toEqual([])
    expect(diagnostics.some(diagnostic => diagnostic.file?.fileName.endsWith('implicit.ts') && diagnostic.code === 7006)).toBe(true)
    expect(check('export function inferred() { return 1; }').passed).toBe(false)
    expect(check('export function implicit(value): unknown { return value; }').passed).toBe(true)
  } finally { cleanup(root) }
})

it('keeps the public TS7006 fixture about parameter typing, with an unchanged explicit return contract', () => {
  const scenario = JSON.parse(readFileSync(join(__dirname, '../../bench/scenarios/rn-42-debug-ts-regression.json'), 'utf8'))
  const reference = JSON.parse(readFileSync(join(__dirname, '../../bench/references/rn-42-debug-ts-regression.json'), 'utf8'))
  const original = scenario.fixtures['src/services/cart.ts']
  const fixed = fixGenerate(scenario)
  expect(fixed).toEqual(reference.files)
  expect(check(original).passed).toBe(true)
  expect(check(fixed[0].content).passed).toBe(true)
  const root = createTempProject({ 'original.ts': original, 'fixed.ts': fixed[0].content })
  try {
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(['original.ts', 'fixed.ts'].map(file => join(root, file)), {
      strict: true, noEmit: true, types: [], skipLibCheck: true, target: ts.ScriptTarget.ES2020,
    }))
    expect(diagnostics.some(diagnostic => diagnostic.file?.fileName.endsWith('original.ts') && diagnostic.code === 7006)).toBe(true)
    expect(diagnostics.filter(diagnostic => diagnostic.file?.fileName.endsWith('fixed.ts'))).toEqual([])
  } finally { cleanup(root) }
})
