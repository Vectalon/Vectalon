/**
 * vectalon soc2 — SOC2 Readiness Agent (Roadmap 075) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync } from 'fs'
import { runSoc2Scan, writeSoc2Report } from '../../src/soc2'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('soc2: runSoc2Scan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('passes a well-evidenced project', () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { 'react-native-keychain': '1.0.0', pino: '1.0.0' } }),
      'package-lock.json': '{}',
      '.gitignore': 'node_modules/\n.env\n',
      '.github/workflows/ci.yml': 'name: CI\non: [push]\n',
      'PRIVACY.md': '# Privacy Policy\n',
      'INCIDENT.md': '# Incident Response\n',
      'scripts/backup.sh': '#!/bin/sh\necho backing up\n',
      'src/App.test.ts': 'it("works", () => {})\n',
    })
    const report = runSoc2Scan(dir)
    expect(report.summary.pass).toBeGreaterThanOrEqual(7)
    expect(report.summary.fail).toBe(0)
    expect(report.score).toBeGreaterThanOrEqual(80)
    // Partials (encryption-in-transit evidence, backups as docs) keep the
    // verdict at needs-attention — process/personnel evidence is external.
    expect(report.verdict).toBe('needs-attention')
  })

  it('flags a bare project with failures', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runSoc2Scan(dir)
    expect(report.summary.fail).toBeGreaterThan(2)
    expect(report.verdict).toBe('changes-requested')
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runSoc2Scan(dir)
    const { mdPath, jsonPath } = writeSoc2Report(dir, report)
    expect(readFileSync(mdPath, 'utf-8')).toContain('soc2')
    expect(readFileSync(jsonPath, 'utf-8')).toContain('"score"')
  })
})
