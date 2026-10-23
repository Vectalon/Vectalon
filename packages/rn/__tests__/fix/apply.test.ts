import { linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { applyEdits, applyToTree, diffEdits } from '../../src/fix/apply'
import type { FixEdit } from '../../src/fix/types'

let workspace: string
let root: string
const edit = (overrides: Partial<FixEdit> = {}): FixEdit => ({ file: 'hook.ts', op: 'replace', from: 'old', to: 'new', summary: 'test', ...overrides })
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'vectalon-edit-test-'))
  root = join(workspace, 'app')
  mkdirSync(root)
  writeFileSync(join(root, 'hook.ts'), 'import keep\nold\nexport keep\n')
  writeFileSync(join(workspace, 'outside.ts'), 'old')
})
afterEach(() => rmSync(workspace, { recursive: true, force: true }))

it.each(['../outside.ts', '/outside.ts', 'C:\\outside.ts', '..\\outside.ts', './hook.ts', 'hook.ts/../hook.ts'])('rejects non-project edit path %s', file => {
  expect(applyEdits(root, [edit({ file })]).applied).toHaveLength(0)
  expect(readFileSync(join(workspace, 'outside.ts'), 'utf8')).toBe('old')
  expect(readFileSync(join(root, 'hook.ts'), 'utf8')).toContain('old')
})

it.each(['', 'old\nold', 'aaa'])('rejects empty, repeated and overlapping anchors: %s', content => {
  if (content) writeFileSync(join(root, 'hook.ts'), content)
  const from = content === 'aaa' ? 'aa' : content ? 'old' : ''
  expect(applyEdits(root, [edit({ from })]).skipped).toHaveLength(1)
})

it('rejects unknown operations and byte-identical edits', () => {
  expect(applyEdits(root, [edit({ op: 'delete' as FixEdit['op'] }), edit({ to: 'old' }), edit({ op: 'insert-after', to: '' })]).applied).toEqual([])
  expect(readFileSync(join(root, 'hook.ts'), 'utf8')).toBe('import keep\nold\nexport keep\n')
})

it.each([null, {}, { from: 1 }, { to: null }])('rejects malformed runtime edit input: %s', value => {
  const malformed = value && Object.keys(value).length ? { ...edit(), ...value } : value
  expect(applyEdits(root, [malformed as FixEdit]).applied).toEqual([])
  expect(readFileSync(join(root, 'hook.ts'), 'utf8')).toBe('import keep\nold\nexport keep\n')
})

it('accepts a canonical project reached through a root symlink', () => {
  const alias = join(workspace, 'alias')
  symlinkSync(root, alias)
  expect(applyEdits(alias, [edit()]).applied).toHaveLength(1)
})

it.each(['file', 'directory', 'hardlink'])('does not write through a %s link', kind => {
  let file = 'linked.ts'
  if (kind === 'directory') {
    symlinkSync(workspace, join(root, 'linked'))
    file = 'linked/outside.ts'
  } else if (kind === 'hardlink') linkSync(join(workspace, 'outside.ts'), join(root, file))
  else symlinkSync(join(workspace, 'outside.ts'), join(root, file))
  expect(applyEdits(root, [edit({ file })]).skipped).toHaveLength(1)
  expect(readFileSync(join(workspace, 'outside.ts'), 'utf8')).toBe('old')
  if (kind === 'file') expect(lstatSync(join(root, file)).isSymbolicLink()).toBe(true)
})

it('preserves surrounding code and produces one diff per edited file', () => {
  const original = join(workspace, 'original')
  mkdirSync(original)
  writeFileSync(join(original, 'hook.ts'), readFileSync(join(root, 'hook.ts')))
  const edits = [edit(), edit({ op: 'insert-after', from: 'new', to: '\ninserted' })]
  const result = applyEdits(root, edits)
  expect(result.skipped).toEqual([])
  expect(readFileSync(join(root, 'hook.ts'), 'utf8')).toBe('import keep\nnew\ninserted\nexport keep\n')
  expect(diffEdits(original, root, result.applied).match(/--- a\/hook.ts/g)).toHaveLength(1)
  expect(diffEdits(original, root, [edit({ file: '../outside.ts' })])).toBe('')
})

it('does not let force bypass anchor or path validation', async () => {
  const run = async () => ({ success: true, stdout: ' M hook.ts', stderr: '', exitCode: 0 })
  const result = await applyToTree(root, [edit({ file: '../outside.ts' }), edit({ from: '' })], true, run)
  expect(result.applied).toEqual([])
  expect(readFileSync(join(workspace, 'outside.ts'), 'utf8')).toBe('old')
})
