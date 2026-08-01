import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeWorkflowDocuments, writePhaseDocument } from '../../src/workflows/phases/documentWriter'

describe('documentWriter', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-docs-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes multiple workflow documents as markdown files', () => {
    const paths = writeWorkflowDocuments(tmpDir, 'feature', 'run-1', [
      { phase: 'prd', title: 'Product Requirements', content: '## Goals\n\nBuild login.' },
      { phase: 'design', title: 'Design Document', content: '## Colors\n\nBlue.' },
    ])

    expect(paths).toHaveLength(2)
    expect(paths[0]).toContain('prd.md')
    expect(paths[1]).toContain('design.md')

    const prd = readFileSync(paths[0], 'utf-8')
    expect(prd).toContain('# Product Requirements')
    expect(prd).toContain('## Goals')
  })

  it('writes a single phase document', () => {
    const path = writePhaseDocument(tmpDir, 'feature', 'run-2', 'implementation', 'Implementation', 'code goes here')
    expect(path).toContain('implementation.md')
    const content = readFileSync(path, 'utf-8')
    expect(content).toContain('# Implementation')
    expect(content).toContain('code goes here')
  })
})
