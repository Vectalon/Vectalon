/**
 * MCP tool-argument validation (P2-18): lightweight schema checks so missing
 * or wrong-typed required fields become structured errors instead of
 * TypeError crashes inside handlers.
 */
import { validateToolArgs, formatValidationIssues } from '../../src/protocol/validate'

const STRING_SCHEMA = {
  type: 'object',
  properties: { prompt: { type: 'string' }, times: { type: 'number' }, force: { type: 'boolean' } },
  required: ['prompt'],
}

describe('validateToolArgs (P2-18)', () => {
  it('accepts valid arguments', () => {
    expect(validateToolArgs({ prompt: 'hi', times: 3 }, STRING_SCHEMA)).toEqual([])
  })

  it('flags a missing required field', () => {
    const issues = validateToolArgs({}, STRING_SCHEMA)
    expect(issues).toHaveLength(1)
    expect(issues[0].path).toBe('prompt')
    expect(issues[0].message).toContain('missing required field')
  })

  it('accepts an empty required string (some tools allow empty inputs)', () => {
    expect(validateToolArgs({ prompt: '' }, STRING_SCHEMA)).toEqual([])
  })

  it('flags wrong-typed values on required fields', () => {
    const ALL_REQUIRED = {
      type: 'object',
      properties: { prompt: { type: 'string' }, times: { type: 'number' }, force: { type: 'boolean' } },
      required: ['prompt', 'times', 'force'],
    }
    expect(validateToolArgs({ prompt: 42, times: 1, force: true }, ALL_REQUIRED).some(i => i.message.includes('expected string'))).toBe(true)
    expect(validateToolArgs({ prompt: 'ok', times: '3', force: true }, ALL_REQUIRED).some(i => i.message.includes('expected number'))).toBe(true)
    expect(validateToolArgs({ prompt: 'ok', times: 1, force: 'yes' }, ALL_REQUIRED).some(i => i.message.includes('expected boolean'))).toBe(true)
  })

  it('collects every issue, not just the first', () => {
    const issues = validateToolArgs({}, { type: 'object', properties: {}, required: ['a', 'b'] })
    expect(issues).toHaveLength(2)
  })

  it('ignores tools without a schema', () => {
    expect(validateToolArgs({ whatever: 1 }, undefined)).toEqual([])
  })

  it('ignores extra fields (forward-compatible)', () => {
    expect(validateToolArgs({ prompt: 'hi', futureField: 'x' }, STRING_SCHEMA)).toEqual([])
  })

  it('formats issues into one readable message', () => {
    const message = formatValidationIssues([
      { path: 'a', message: 'missing required field: a' },
      { path: 'b', message: 'expected string for "b", got number' },
    ])
    expect(message).toContain('Invalid tool arguments')
    expect(message).toContain('missing required field: a')
    expect(message).toContain('expected string for "b"')
  })
})
