import { readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { mkdirSync } from 'fs'
import { PNG } from 'pngjs'
import type { VisualDiffResult, DiffRegion } from './visualDiff'

/**
 * Deterministic diff composite renderer for visual-CI PR artifacts.
 *
 * Composes three panels side by side — reference | diff map | candidate —
 * with the finding regions boxed on the candidate, into one PNG. The diff map
 * marks differing pixels in red (alpha ignored, matching `diffImages`), so a
 * reviewer sees at a glance what moved and where. Pure pngjs math, no model
 * calls, unit-testable with tiny PNGs.
 */

const GUTTER = 8
const BOX_COLOR: [number, number, number] = [255, 45, 85] // pink-red region boxes
const DIFF_COLOR: [number, number, number] = [240, 71, 71] // differing pixels
const MATCH_COLOR: [number, number, number] = [24, 24, 24] // matched pixels in the diff map

interface Decoded {
  png: PNG
}

function decode(path: string): Decoded | null {
  try {
    return { png: PNG.sync.read(readFileSync(path)) }
  } catch (err) {
    return null
  }
}

function setPixel(png: PNG, x: number, y: number, rgb: [number, number, number]): void {
  const idx = (y * png.width + x) * 4
  png.data[idx] = rgb[0]
  png.data[idx + 1] = rgb[1]
  png.data[idx + 2] = rgb[2]
  png.data[idx + 3] = 255
}

/** Copy a source PNG into the composite at (offsetX, offsetY). */
function blit(dst: PNG, src: PNG, offsetX: number, offsetY: number): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const srcIdx = (y * src.width + x) * 4
      const dstIdx = ((y + offsetY) * dst.width + (x + offsetX)) * 4
      dst.data[dstIdx] = src.data[srcIdx]
      dst.data[dstIdx + 1] = src.data[srcIdx + 1]
      dst.data[dstIdx + 2] = src.data[srcIdx + 2]
      dst.data[dstIdx + 3] = 255
    }
  }
}

/** Build the diff-map panel: red where pixels differ, dark where they match. */
function buildDiffMap(ref: PNG, cand: PNG): PNG {
  const width = ref.width
  const height = ref.height
  const map = new PNG({ width, height })
  const maxX = Math.min(cand.width, width)
  const maxY = Math.min(cand.height, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= maxX || y >= maxY) {
        // Candidate is smaller than the reference — the missing strip differs.
        setPixel(map, x, y, DIFF_COLOR)
        continue
      }
      const refIdx = (y * ref.width + x) * 4
      const candIdx = (y * cand.width + x) * 4
      const differs =
        Math.abs(ref.data[refIdx] - cand.data[candIdx]) > 0 ||
        Math.abs(ref.data[refIdx + 1] - cand.data[candIdx + 1]) > 0 ||
        Math.abs(ref.data[refIdx + 2] - cand.data[candIdx + 2]) > 0
      setPixel(map, x, y, differs ? DIFF_COLOR : MATCH_COLOR)
    }
  }
  return map
}

/** Draw a 2px box around each finding region on the candidate panel. */
function boxRegions(png: PNG, offsetX: number, regions: DiffRegion[]): void {
  for (const r of regions) {
    const x0 = Math.max(0, Math.round(r.x))
    const y0 = Math.max(0, Math.round(r.y))
    const x1 = Math.min(png.width - 1, Math.round(r.x + r.width - 1))
    const y1 = Math.min(png.height - 1, Math.round(r.y + r.height - 1))
    for (let x = x0; x <= x1; x++) {
      for (const y of [y0, y0 + 1, y1 - 1, y1]) {
        if (y >= y0 && y <= y1) setPixel(png, x + offsetX, y, BOX_COLOR)
      }
    }
    for (let y = y0; y <= y1; y++) {
      for (const x of [x0, x0 + 1, x1 - 1, x1]) {
        if (x >= x0 && x <= x1) setPixel(png, x + offsetX, y, BOX_COLOR)
      }
    }
  }
}

/**
 * Render reference | diff map | candidate with region boxes. Returns the
 * output path, or null when either input PNG cannot be decoded. Never throws.
 */
export function renderDiffComposite(
  referencePath: string,
  candidatePath: string,
  result: VisualDiffResult,
  outPath: string
): string | null {
  const ref = decode(referencePath)
  const cand = decode(candidatePath)
  if (!ref || !cand) return null

  const width = ref.png.width
  const height = ref.png.height
  const diffMap = buildDiffMap(ref.png, cand.png)

  const totalWidth = width * 3 + GUTTER * 2
  const composite = new PNG({ width: totalWidth, height })

  blit(composite, ref.png, 0, 0)
  blit(composite, diffMap, width + GUTTER, 0)
  blit(composite, cand.png, (width + GUTTER) * 2, 0)

  boxRegions(composite, (width + GUTTER) * 2, result.regions || [])

  try {
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, PNG.sync.write(composite))
    return outPath
  } catch (err) {
    return null
  }
}
