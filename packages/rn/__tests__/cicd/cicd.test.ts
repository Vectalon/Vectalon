/**
 * vectalon cicd — CI/CD Intelligence Agent (Roadmap 073) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync } from 'fs'
import { scanWorkflow, runCiScan, collectCiFiles, writeCiReport } from '../../src/cicd'
import { createTempProject, cleanup } from '../helpers/tmp'

const GOOD_WORKFLOW = `name: CI
on:
  push:
  pull_request:
  workflow_dispatch:
concurrency:
  group: \${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
      - run: npm test
`

const BAD_WORKFLOW = `name: Deploy
jobs:
  deploy:
    steps:
      - uses: actions/checkout@v4
      - run: npm run deploy
      - run: echo "password=hunter2" >> .env
`

describe('cicd: scanWorkflow', () => {
  it('passes a pinned, gated workflow', () => {
    const findings = scanWorkflow('.github/workflows/ci.yml', GOOD_WORKFLOW)
    expect(findings).toHaveLength(0)
  })

  it('flags unpinned actions, missing concurrency, inline secrets, deploy without tests', () => {
    const findings = scanWorkflow('.github/workflows/deploy.yml', BAD_WORKFLOW)
    const ids = findings.map(f => f.id)
    expect(ids).toContain('unpinned-action')
    expect(ids).toContain('missing-concurrency')
    expect(ids).toContain('deploy-without-tests')
    expect(ids).toContain('inline-secret')
    expect(ids).toContain('missing-triggers')
    const severity = findings.find(f => f.id === 'deploy-without-tests')!.severity
    expect(severity).toBe('error')
  })

  it('detects an empty workflow as an error', () => {
    const findings = scanWorkflow('w.yml', 'name: Empty\non: [push]\n')
    expect(findings.some(f => f.id === 'empty-workflow' && f.severity === 'error')).toBe(true)
  })
})

describe('cicd: runCiScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('collects GitHub Actions workflows and other CI files', () => {
    dir = createTempProject({
      'package.json': '{}',
      '.github/workflows/ci.yml': GOOD_WORKFLOW,
      '.gitlab-ci.yml': 'stages: [test]',
    })
    const files = collectCiFiles(dir)
    expect(files.length).toBe(2)
    const report = runCiScan(dir)
    expect(report.ciSystems).toContain('github-actions')
    expect(report.ciSystems).toContain('gitlab-ci')
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}', '.github/workflows/ci.yml': BAD_WORKFLOW })
    const report = runCiScan(dir)
    const { mdPath, jsonPath } = writeCiReport(dir, report)
    expect(readFileSync(mdPath, 'utf-8')).toContain('cicd')
    expect(readFileSync(jsonPath, 'utf-8')).toContain('"verdict"')
  })
})
