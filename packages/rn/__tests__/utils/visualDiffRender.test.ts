import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PNG } from 'pngjs'
import { diffImages } from '../../src/utils/visualDiff'
import { renderDiffComposite } from '../../src/utils/visualDiffRender'

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

function writePng(dir: string, name: string, png: PNG): string {
  const path = join(dir, name)
  writeFileSync(path, PNG.sync.write(png))
  return path
}

describe('renderDiffComposite', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-vrender-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('composes reference | diff map | candidate with a region box', () => {
    const width = 40
    const height = 30
    const base = solidImage(width, height, [50, 60, 70])
    const changed = solidImage(width, height, [50, 60, 70])
    paintBlock(changed, 10, 10, 20, 20, [255, 0, 0]) // dense region → region-drift
    const ref = writePng(dir, 'ref.png', base)
    const cand = writePng(dir, 'cand.png', changed)
    const result = diffImages(ref, cand)
    expect(result.regions.length).toBeGreaterThan(0)

    const out = join(dir, 'composite.png')
    const written = renderDiffComposite(ref, cand, result, out)
    expect(written).toBe(out)
    expect(existsSync(out)).toBe(true)

    const decoded = PNG.sync.read(readFileSync(out))
    // Three panels of width 40 + two 8px gutters.
    expect(decoded.width).toBe(width * 3 + 8 * 2)
    expect(decoded.height).toBe(height)

    // The diff map panel shows red where pixels differ.
    const diffMapX = width + 8
    const diffIdx = ((10 + 5) * decoded.width + (diffMapX + 10 + 5)) * 4
    expect(decoded.data[diffIdx]).toBeGreaterThan(200) // red channel
    expect(decoded.data[diffIdx + 1]).toBeLessThan(120) // not green

    // The candidate panel has the box color on the region border. With a 40×30
    // image the dirty grid is a single cell, so the region is the full image and
    // the box sits on the panel edges (y=0 is the top border).
    const candPanelX = (width + 8) * 2
    const borderIdx = (0 * decoded.width + (candPanelX + 10)) * 4
    expect(decoded.data[borderIdx]).toBeGreaterThan(200)
    expect(decoded.data[borderIdx + 1]).toBeLessThan(120)
    expect(decoded.data[borderIdx + 2]).toBeGreaterThan(50)
  })

  it('matches side-by-side rendering for identical images (no red in the diff map)', () => {
    const ref = writePng(dir, 'ref.png', solidImage(30, 20, [10, 20, 30]))
    const cand = writePng(dir, 'cand.png', solidImage(30, 20, [10, 20, 30]))
    const result = diffImages(ref, cand)
    const out = join(dir, 'composite.png')
    renderDiffComposite(ref, cand, result, out)
    const decoded = PNG.sync.read(readFileSync(out))
    const diffMapX = 30 + 8
    // Every diff-map pixel is the dark MATCH color (low red).
    for (let y = 0; y < 20; y += 4) {
      const idx = (y * decoded.width + diffMapX + 2) * 4
      expect(decoded.data[idx]).toBeLessThan(100)
    }
  })

  it('returns null when an input PNG cannot be decoded', () => {
    const ref = writePng(dir, 'ref.png', solidImage(10, 10, [0, 0, 0]))
    const result = diffImages(ref, join(dir, 'missing.png'))
    expect(renderDiffComposite(ref, join(dir, 'missing.png'), result, join(dir, 'out.png'))).toBeNull()
  })
})
