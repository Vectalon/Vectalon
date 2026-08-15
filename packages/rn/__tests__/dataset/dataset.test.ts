/**
 * vectalon dataset — Fine-tuning Dataset Agent (Roadmap 088) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { parseDatasetLine, runDatasetScan, findPii, writeDatasetReport } from '../../src/dataset'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('dataset: parseDatasetLine', () => {
  it('parses chat and instruction formats', () => {
    const chat = parseDatasetLine(JSON.stringify({ id: '1', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] }), 1)
    expect(chat?.format).toBe('chat')
    expect(chat?.text).toContain('hi')

    const instr = parseDatasetLine(JSON.stringify({ id: '2', instruction: 'sum', output: '2' }), 2)
    expect(instr?.format).toBe('instruction')
    expect(instr?.instruction).toBe('sum')
  })

  it('returns null for malformed lines', () => {
    expect(parseDatasetLine('not json', 1)).toBeNull()
    expect(parseDatasetLine('"just a string"', 1)).toBeNull()
  })
})

describe('dataset: findPii', () => {
  it('detects emails, phones, and api keys', () => {
    const key = ['sk', 'test', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'].join('_')
    expect(findPii('contact me at a@b.com')).toContain('email')
    expect(findPii('call 555-123-4567')).toContain('phone')
    expect(findPii(`use ${key} to authenticate`)).toContain('api-key')
    expect(findPii('a harmless sentence')).toEqual([])
  })
})

describe('dataset: runDatasetScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('flags duplicates, mixed schemas, and PII', () => {
    const key = ['sk', 'test', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'].join('_')
    dir = createTempProject({
      'package.json': '{}',
      '.vectalon/dataset/train.jsonl': [
        JSON.stringify({ id: 'a', messages: [{ role: 'user', content: `api key is ${key}` }, { role: 'assistant', content: 'ok' }] }),
        JSON.stringify({ id: 'b', instruction: 'translate', output: 'hola' }),
        JSON.stringify({ id: 'c', instruction: 'translate', output: 'hola' }),
      ].join('\n') + '\n',
    })
    const report = runDatasetScan(dir)
    expect(report.stats.entries).toBe(3)
    expect(report.findings.some(f => f.id === 'pii')).toBe(true)
    expect(report.findings.some(f => f.id === 'duplicates')).toBe(true)
    expect(report.findings.some(f => f.id === 'mixed-schema')).toBe(true)
    expect(report.verdict).toBe('needs-attention')
  })

  it('flags malformed lines and label imbalance', () => {
    dir = createTempProject({
      'package.json': '{}',
      '.vectalon/dataset/train.jsonl': [
        JSON.stringify({ label: 'pos', instruction: 'x', output: '1' }),
        'not json',
        JSON.stringify({ label: 'pos', instruction: 'y', output: '1' }),
        JSON.stringify({ label: 'pos', instruction: 'z', output: '1' }),
        JSON.stringify({ label: 'pos', instruction: 'v', output: '1' }),
        JSON.stringify({ label: 'neg', instruction: 'w', output: '0' }),
      ].join('\n') + '\n',
    })
    const report = runDatasetScan(dir)
    expect(report.findings.some(f => f.id === 'malformed')).toBe(true)
    expect(report.findings.some(f => f.id === 'label-imbalance')).toBe(true)
  })

  it('approved for a clean balanced dataset', () => {
    const lines = Array.from({ length: 4 }, (_, i) => JSON.stringify({ id: `e${i}`, label: i % 2 === 0 ? 'pos' : 'neg', instruction: `q${i}`, output: `a${i}` }))
    dir = createTempProject({
      'package.json': '{}',
      '.vectalon/dataset/train.jsonl': lines.join('\n') + '\n',
    })
    const report = runDatasetScan(dir)
    expect(report.findings.filter(f => f.severity === 'warning')).toHaveLength(0)
  })

  it('reports when no dataset directory exists', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runDatasetScan(dir)
    expect(report.findings.some(f => f.id === 'no-dataset')).toBe(true)
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runDatasetScan(dir)
    const { mdPath, jsonPath } = writeDatasetReport(dir, report)
    expect(mdPath).toContain('dataset')
    expect(jsonPath).toContain('report.json')
  })
})
