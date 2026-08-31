import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { checkGeneratedFilesWithHarness, repairGeneratedFilesWithHarness } from '../../src/workflows/phases/implementationPhase'

describe('implementation generated-file harness', () => {
  it('validates generated files through the Core-composed RN policy', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-implementation-harness-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'mobile', version: '1.0.0', dependencies: { 'react-native': '0.81.0', react: '19.1.0' },
    }))
    try {
      const results = await checkGeneratedFilesWithHarness(
        [{ path: 'src/Login.tsx', content: 'console.log("debug")' }],
        {
          hasTypeScript: true, usesStyleSheet: false, hasNavigation: false,
          packageName: 'mobile', platforms: ['android'], reactVersion: '19.1.0',
        },
        root,
      )
      expect(results[0].ok).toBe(false)
      expect(results[0].findings.some(finding => finding.rule === 'No console.log statements' && !finding.passed)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('delegates bounded generated-file repair to Core before files are written', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-implementation-repair-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'mobile', version: '1.0.0', dependencies: { 'react-native': '0.81.0' },
    }))
    const generate = jest.fn(async () => ({ content: 'export const ready = true\n', provider: 'scripted' }))
    try {
      const outcome = await repairGeneratedFilesWithHarness(
        [{ path: 'src/Login.tsx', content: 'console.log("debug")' }],
        root,
        { generate },
        2,
      )
      expect(outcome.files).toEqual([{ path: 'src/Login.tsx', content: 'export const ready = true\n' }])
      expect(outcome.run.safe).toMatchObject({ reason: 'REPAIR_SUCCEEDED', repairCount: 1 })
      expect(outcome.results[0].ok).toBe(true)
      expect(generate).toHaveBeenCalledTimes(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not return an unchanged invalid repair as writable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-implementation-repair-fail-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'mobile', dependencies: { 'react-native': '0.81.0' } }))
    try {
      const outcome = await repairGeneratedFilesWithHarness(
        [{ path: 'src/Invalid.ts', content: 'console.log("still invalid")' }],
        root,
        { generate: async () => ({ content: 'console.log("still invalid")', provider: 'scripted' }) },
        2,
      )
      expect(outcome.writable).toBe(false)
      expect(outcome.run.safe.reason).toBe('REPAIR_EXHAUSTED')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
