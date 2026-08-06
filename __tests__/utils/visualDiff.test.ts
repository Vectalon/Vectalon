import { PNG } from 'pngjs'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { diffImages, formatVisualDiffResult } from '../../src/utils/visualDiff'

function solidImage(width: number, height: number, rgb: [number, number, number]): PNG {
  const png = new PNG({ width, height })
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgb[0]
    png.data[i * 4 + 1] = rgb[1]
    png.data[i * 4 + 2] = rgb[2]
    png.data[i * 4 + 3] = 255
  }
  return png
}

/** Paint a solid block of `rgb` at (bx, by) sized bw×bh. */
function paintBlock(png: PNG, bx: number, by: number, bw: number, bh: number, rgb: [number, number, number]): void {
  for (let y = by; y < Math.min(by + bh, png.height); y++) {
    for (let x = bx; x < Math.min(bx + bw, png.width); x++) {
      const i = (y * png.width + x) * 4
      png.data[i] = rgb[0]
      png.data[i + 1] = rgb[1]
      png.data[i + 2] = rgb[2]
    }
  }
}

/** Change scattered single pixels (every Nth) so no dense region forms. */
function paintScattered(png: PNG, step: number, rgb: [number, number, number]): void {
  for (let i = 0; i < png.width * png.height; i += step) {
    png.data[i * 4] = rgb[0]
    png.data[i * 4 + 1] = rgb[1]
    png.data[i * 4 + 2] = rgb[2]
  }
}

function writePng(dir: string, name: string, png: PNG): string {
  const path = join(dir, name)
  writeFileSync(path, PNG.sync.write(png))
  return path
}

describe('visualDiff', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-vdiff-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('matches identical images with zero findings', () => {
    const ref = writePng(dir, 'ref.png', solidImage(200, 200, [10, 20, 30]))
    const cand = writePng(dir, 'cand.png', solidImage(200, 200, [10, 20, 30]))
    const result = diffImages(ref, cand)
    expect(result.match).toBe(true)
    expect(result.diffRatio).toBe(0)
    expect(result.dimensionMatch).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('tolerates sub-threshold pixel differences', () => {
    const base = solidImage(200, 200, [100, 100, 100])
    const ref = writePng(dir, 'ref.png', base)
    const slightlyDifferent = solidImage(200, 200, [105, 100, 100]) // Δ5 < tolerance 12
    const cand = writePng(dir, 'cand.png', slightlyDifferent)
    const result = diffImages(ref, cand)
    expect(result.match).toBe(true)
    expect(result.diffRatio).toBe(0)
  })

  it('flags a dimension mismatch as an error finding', () => {
    const ref = writePng(dir, 'ref.png', solidImage(200, 400, [1, 2, 3]))
    const cand = writePng(dir, 'cand.png', solidImage(180, 400, [1, 2, 3]))
    const result = diffImages(ref, cand)
    expect(result.match).toBe(false)
    expect(result.dimensionMatch).toBe(false)
    expect(result.findings.some(f => f.rule === 'dimension-mismatch' && f.severity === 'error')).toBe(true)
  })

  it('detects a changed region and reports it with a bounding box', () => {
    const base = solidImage(200, 200, [50, 60, 70])
    const changed = solidImage(200, 200, [50, 60, 70])
    paintBlock(changed, 20, 20, 60, 60, [255, 0, 0]) // 3600/40000 = 9% diff
    const ref = writePng(dir, 'ref.png', base)
    const cand = writePng(dir, 'cand.png', changed)
    const result = diffImages(ref, cand)
    expect(result.diffRatio).toBeGreaterThan(0.08)
    expect(result.diffRatio).toBeLessThan(0.1)
    expect(result.findings.some(f => f.rule === 'visual-drift')).toBe(true)
    const regionFinding = result.findings.find(f => f.rule === 'region-drift')
    expect(regionFinding).toBeDefined()
    expect(regionFinding!.region).toBeDefined()
    expect(regionFinding!.region!.width).toBeGreaterThan(0)
    expect(regionFinding!.region!.height).toBeGreaterThan(0)
  })

  it('escalates large drift to an error finding', () => {
    const base = solidImage(100, 100, [10, 10, 10])
    const changed = solidImage(100, 100, [240, 240, 240]) // 100% diff
    const ref = writePng(dir, 'ref.png', base)
    const cand = writePng(dir, 'cand.png', changed)
    const result = diffImages(ref, cand)
    const drift = result.findings.find(f => f.rule === 'visual-drift')
    expect(drift?.severity).toBe('error')
    expect(result.match).toBe(false)
  })

  it('reports color drift as an info finding for sparse, high-delta changes', () => {
    const base = solidImage(200, 200, [10, 10, 10])
    const changed = solidImage(200, 200, [10, 10, 10])
    paintScattered(changed, 400, [250, 250, 250]) // 1% of pixels, max delta
    const ref = writePng(dir, 'ref.png', base)
    const cand = writePng(dir, 'cand.png', changed)
    const result = diffImages(ref, cand)
    expect(result.diffRatio).toBeLessThan(0.03)
    expect(result.colorDrift).toBeGreaterThan(200)
    const drift = result.findings.find(f => f.rule === 'color-drift')
    expect(drift?.severity).toBe('info')
  })

  it('honors a custom drift threshold', () => {
    const base = solidImage(200, 200, [50, 60, 70])
    const changed = solidImage(200, 200, [50, 60, 70])
    paintBlock(changed, 20, 20, 40, 40, [200, 0, 0]) // 4% diff
    const ref = writePng(dir, 'ref.png', base)
    const cand = writePng(dir, 'cand.png', changed)
    const result = diffImages(ref, cand, { driftThreshold: 0.5 })
    expect(result.findings.filter(f => f.rule === 'visual-drift')).toHaveLength(0)
    expect(result.match).toBe(true)
  })

  it('returns an error finding when a file cannot be decoded', () => {
    const ref = writePng(dir, 'ref.png', solidImage(10, 10, [0, 0, 0]))
    const cand = join(dir, 'missing.png')
    const result = diffImages(ref, cand)
    expect(result.error).toContain('could not decode')
    expect(result.findings.some(f => f.rule === 'decode-failure' && f.severity === 'error')).toBe(true)
    expect(result.match).toBe(false)
  })

  it('formats findings as markdown', () => {
    const base = solidImage(50, 50, [1, 1, 1])
    const changed = solidImage(50, 50, [255, 255, 255])
    const ref = writePng(dir, 'ref.png', base)
    const cand = writePng(dir, 'cand.png', changed)
    const result = diffImages(ref, cand)
    const md = formatVisualDiffResult(result, { reference: ref, candidate: cand, key: 'Login' })
    expect(md).toContain('Visual check')
    expect(md).toContain('| Severity | Rule | Detail |')
    expect(md).toContain('Login')
  })
})
