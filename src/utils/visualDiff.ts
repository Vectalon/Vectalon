import { readFileSync } from 'fs'
import { PNG } from 'pngjs'

/**
 * Deterministic pixel-diff engine for the visual verification loop.
 *
 * Decodes two PNGs (reference vs. candidate screenshot), compares them
 * pixel-by-pixel with a per-channel tolerance, buckets differences into a
 * coarse grid to detect contiguous dirty regions (alignment / safe-area /
 * layout regressions), and turns the stats into annotated findings with
 * severities — no model calls, pure math, unit-testable with tiny PNGs.
 */

export type VisualSeverity = 'error' | 'warning' | 'info'

/** A contiguous block of differing pixels, in image pixels (x/y/width/height). */
export interface DiffRegion {
  x: number
  y: number
  width: number
  height: number
  /** Fraction of pixels inside the bounding box that actually differ (0-1). */
  dirtyRatio: number
}

export interface VisualFinding {
  severity: VisualSeverity
  rule: string
  message: string
  /** Bounding box of the differing block, when the finding is region-based. */
  region?: DiffRegion
  metric?: number
  threshold?: number
}

export interface VisualDiffOptions {
  /** Per-channel pixel tolerance; a pixel differs when any channel delta exceeds this. */
  pixelTolerance?: number
  /** Grid cell size (px) used for region detection. */
  cellSize?: number
  /** Fraction of differing pixels that triggers a `visual-drift` finding (warning). */
  driftThreshold?: number
  /** Fraction of differing pixels that escalates `visual-drift` to error severity. */
  highDriftThreshold?: number
  /** A region is reported when its dirty-ratio exceeds this. */
  regionThreshold?: number
  /** Average per-channel drift over differing pixels that triggers a `color-drift` finding. */
  colorDriftThreshold?: number
}

export interface VisualDiffResult {
  /** True when the images match within tolerance and no error findings fired. */
  match: boolean
  /** Width of the reference image. */
  width: number
  /** Height of the reference image. */
  height: number
  /** True when both images share the same dimensions. */
  dimensionMatch: boolean
  /** Fraction of pixels that differ (0-1). */
  diffRatio: number
  /** Average per-channel drift over differing pixels (0-255). */
  colorDrift: number
  regions: DiffRegion[]
  findings: VisualFinding[]
  /** Present when a file could not be read/decoded. */
  error?: string
}

export const DEFAULT_DIFF_OPTIONS: Required<VisualDiffOptions> = {
  pixelTolerance: 12,
  cellSize: 48,
  driftThreshold: 0.03,
  highDriftThreshold: 0.1,
  regionThreshold: 0.5,
  colorDriftThreshold: 20,
}

interface DecodedImage {
  width: number
  height: number
  data: Buffer
}

function decode(path: string): DecodedImage | null {
  try {
    const png = PNG.sync.read(readFileSync(path))
    return { width: png.width, height: png.height, data: png.data }
  } catch (err) {
    return null
  }
}

/** True when any RGBA channel differs by more than the tolerance. */
function pixelDiffers(
  ref: Buffer,
  cand: Buffer,
  idx: number,
  tolerance: number
): boolean {
  // Skip the alpha channel for the visual comparison — status-bar rendering,
  // transparency, and safe-area overlays legitimately differ in alpha.
  return (
    Math.abs(ref[idx] - cand[idx]) > tolerance ||
    Math.abs(ref[idx + 1] - cand[idx + 1]) > tolerance ||
    Math.abs(ref[idx + 2] - cand[idx + 2]) > tolerance
  )
}

/**
 * Bucket the per-pixel diff into a dirty-cell grid and merge contiguous dirty
 * cells into bounding-box regions (4-directional flood fill over cells).
 */
function findRegions(
  width: number,
  height: number,
  dirtyCells: Uint8Array,
  cols: number,
  rows: number,
  cellSize: number,
  regionThreshold: number
): DiffRegion[] {
  const regions: DiffRegion[] = []
  const visited = new Uint8Array(cols * rows)

  for (let startRow = 0; startRow < rows; startRow++) {
    for (let startCol = 0; startCol < cols; startCol++) {
      const start = startRow * cols + startCol
      if (!dirtyCells[start] || visited[start]) continue

      // BFS over adjacent dirty cells.
      const queue: number[] = [start]
      visited[start] = 1
      let minCol = startCol
      let maxCol = startCol
      let minRow = startRow
      let maxRow = startRow
      let count = 0
      while (queue.length > 0) {
        const cell = queue.pop() as number
        count++
        const c = cell % cols
        const r = (cell - c) / cols
        if (c < minCol) minCol = c
        if (c > maxCol) maxCol = c
        if (r < minRow) minRow = r
        if (r > maxRow) maxRow = r
        const neighbors = [
          r > 0 ? cell - cols : -1,
          r < rows - 1 ? cell + cols : -1,
          c > 0 ? cell - 1 : -1,
          c < cols - 1 ? cell + 1 : -1,
        ]
        for (const n of neighbors) {
          if (n >= 0 && dirtyCells[n] && !visited[n]) {
            visited[n] = 1
            queue.push(n)
          }
        }
      }

      const bboxCols = maxCol - minCol + 1
      const bboxRows = maxRow - minRow + 1
      const dirtyRatio = count / (bboxCols * bboxRows)
      // Skip single-cell noise unless the cell is fully dirty.
      if (dirtyRatio < regionThreshold) continue
      regions.push({
        x: Math.min(minCol * cellSize, width - 1),
        y: Math.min(minRow * cellSize, height - 1),
        width: Math.min(bboxCols * cellSize, width - Math.min(minCol * cellSize, width - 1)),
        height: Math.min(bboxRows * cellSize, height - Math.min(minRow * cellSize, height - 1)),
        dirtyRatio,
      })
    }
  }
  return regions
}

/**
 * Diff a reference PNG against a candidate PNG. Never throws — read/decode
 * failures are reported in `error` plus an error finding so callers can
 * degrade gracefully (e.g. the verification phase skips, never crashes).
 */
export function diffImages(
  referencePath: string,
  candidatePath: string,
  options: VisualDiffOptions = {}
): VisualDiffResult {
  const opts: Required<VisualDiffOptions> = { ...DEFAULT_DIFF_OPTIONS, ...options }
  const ref = decode(referencePath)
  const cand = decode(candidatePath)
  const noResult: VisualDiffResult = {
    match: false,
    width: 0,
    height: 0,
    dimensionMatch: false,
    diffRatio: 1,
    colorDrift: 255,
    regions: [],
    findings: [],
  }

  if (!ref || !cand) {
    const missing = [ref ? null : referencePath, cand ? null : candidatePath].filter(Boolean)
    noResult.error = `could not decode PNG: ${missing.join(', ')}`
    noResult.findings.push({
      severity: 'error',
      rule: 'decode-failure',
      message: `Screenshot could not be decoded (${missing.join(', ')}) — is the file a valid PNG?`,
    })
    return noResult
  }

  const findings: VisualFinding[] = []
  const width = ref.width
  const height = ref.height

  if (ref.width !== cand.width || ref.height !== cand.height) {
    findings.push({
      severity: 'error',
      rule: 'dimension-mismatch',
      message: `Screenshot dimensions ${cand.width}×${cand.height} differ from the reference ${ref.width}×${ref.height} — the layout or safe-area insets changed.`,
      metric: 1,
      threshold: 0,
    })
    return {
      ...noResult,
      width,
      height,
      dimensionMatch: false,
      diffRatio: 1,
      findings,
    }
  }

  // Per-pixel pass: count differing pixels, accumulate color drift, and mark
  // dirty grid cells.
  const cellSize = opts.cellSize
  const cols = Math.ceil(width / cellSize)
  const rows = Math.ceil(height / cellSize)
  const dirtyCells = new Uint8Array(cols * rows)
  let diffPixels = 0
  let driftSum = 0
  const tolerance = opts.pixelTolerance

  for (let y = 0; y < height; y++) {
    const rowBase = y * width * 4
    for (let x = 0; x < width; x++) {
      const idx = rowBase + x * 4
      if (!pixelDiffers(ref.data, cand.data, idx, tolerance)) continue
      diffPixels++
      driftSum +=
        (Math.abs(ref.data[idx] - cand.data[idx]) +
          Math.abs(ref.data[idx + 1] - cand.data[idx + 1]) +
          Math.abs(ref.data[idx + 2] - cand.data[idx + 2])) /
        3
      dirtyCells[Math.floor(y / cellSize) * cols + Math.floor(x / cellSize)] = 1
    }
  }

  const totalPixels = width * height
  const diffRatio = diffPixels / totalPixels
  const colorDrift = diffPixels > 0 ? driftSum / diffPixels : 0

  const regions = findRegions(
    width,
    height,
    dirtyCells,
    cols,
    rows,
    cellSize,
    opts.regionThreshold
  )

  if (diffRatio >= opts.highDriftThreshold) {
    findings.push({
      severity: 'error',
      rule: 'visual-drift',
      message: `${(diffRatio * 100).toFixed(1)}% of pixels differ from the reference — the screen does not match the expected design.`,
      metric: diffRatio,
      threshold: opts.highDriftThreshold,
    })
  } else if (diffRatio >= opts.driftThreshold) {
    findings.push({
      severity: 'warning',
      rule: 'visual-drift',
      message: `${(diffRatio * 100).toFixed(1)}% of pixels differ from the reference — review the highlighted regions.`,
      metric: diffRatio,
      threshold: opts.driftThreshold,
    })
  }

  for (const region of regions) {
    findings.push({
      severity: 'warning',
      rule: 'region-drift',
      message: `Region (${region.x}, ${region.y}, ${region.width}×${region.height}) differs — ${(region.dirtyRatio * 100).toFixed(0)}% of its pixels changed; check for misaligned elements or missing insets.`,
      region,
      metric: region.dirtyRatio,
      threshold: opts.regionThreshold,
    })
  }

  if (diffRatio < opts.driftThreshold && colorDrift > opts.colorDriftThreshold) {
    findings.push({
      severity: 'info',
      rule: 'color-drift',
      message: `Few pixels differ but the average color shift is ${Math.round(colorDrift)} per channel — check for wrong theme tokens or tint.`,
      metric: colorDrift,
      threshold: opts.colorDriftThreshold,
    })
  }

  const hasErrors = findings.some(f => f.severity === 'error')
  return {
    match: !hasErrors && diffRatio < opts.driftThreshold,
    width,
    height,
    dimensionMatch: true,
    diffRatio,
    colorDrift,
    regions,
    findings,
  }
}

/** Render a diff result as markdown for MCP tool output / workflow artifacts. */
export function formatVisualDiffResult(
  result: VisualDiffResult,
  meta: { reference: string; candidate: string; key?: string }
): string {
  const fence = '```'
  const lines = [
    result.match && result.findings.length === 0
      ? '**✅ Visual check passed**'
      : '**❌ Visual check found differences**',
    '',
    `- Reference: \`${meta.reference}\``,
    `- Screenshot: \`${meta.candidate}\``,
    meta.key ? `- Key: \`${meta.key}\`` : '',
    `- Diff ratio: ${(result.diffRatio * 100).toFixed(2)}%`,
    `- Color drift: ${Math.round(result.colorDrift)}`,
    `- Dimensions: ${result.width}×${result.height} ${result.dimensionMatch ? '(match)' : '(MISMATCH)'}`,
    '',
  ].filter(Boolean)

  if (result.error) {
    lines.push(`**Error:** ${result.error}`)
  }

  if (result.findings.length === 0) {
    lines.push('No differences detected within tolerance.')
  } else {
    lines.push('**Findings**', '', '| Severity | Rule | Detail |', '|---|---|---|')
    for (const f of result.findings) {
      const region = f.region ? ` @(${f.region.x},${f.region.y},${f.region.width}×${f.region.height})` : ''
      lines.push(`| ${f.severity} | ${f.rule} | ${f.message.replace(/\n/g, ' ')}${region} |`)
    }
  }

  if (result.regions.length > 0) {
    lines.push('', '**Annotated regions** (bounding boxes over the screenshot)')
    lines.push(fence)
    result.regions.forEach((r, i) => {
      lines.push(`[${i + 1}] x=${r.x} y=${r.y} w=${r.width} h=${r.height} dirty=${(r.dirtyRatio * 100).toFixed(0)}%`)
    })
    lines.push(fence)
  }
  return lines.join('\n')
}
