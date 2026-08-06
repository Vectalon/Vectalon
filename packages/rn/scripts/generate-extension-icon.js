#!/usr/bin/env node
/**
 * Deterministically generate the VS Code Marketplace icon for the vectalon
 * extension (256×256 PNG): a rounded dark square, a bright "V", and a green
 * check dot (guardrails passing). Pure pngjs — no design tool required.
 *
 *   node scripts/generate-extension-icon.js
 */
const { PNG } = require('pngjs')
const { writeFileSync } = require('fs')
const { join } = require('path')

const SIZE = 256
const CORNER_RADIUS = 56
const BG = [30, 30, 46] // #1E1E2E — VS Code dark
const V_COLOR = [79, 195, 247] // #4FC3F7
const CHECK_COLOR = [87, 199, 138] // #57C78A
const V_THICKNESS = 26
const CHECK_RADIUS = 14
const CHECK_OFFSET = 38

const png = new PNG({ width: SIZE, height: SIZE })

// Distance from a point to a line segment.
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

function insideRoundedRect(x, y) {
  const cx = Math.max(CORNER_RADIUS, Math.min(SIZE - CORNER_RADIUS, x))
  const cy = Math.max(CORNER_RADIUS, Math.min(SIZE - CORNER_RADIUS, y))
  return Math.hypot(x - cx, y - cy) <= CORNER_RADIUS
}

function inV(x, y) {
  // Two thick segments meeting at the bottom center of the glyph area.
  const top = 78
  const bottom = 150
  const midX = SIZE / 2
  const armInset = 42
  const d1 = segDist(x, y, armInset, top, midX, bottom)
  const d2 = segDist(x, y, SIZE - armInset, top, midX, bottom)
  return d1 <= V_THICKNESS / 2 || d2 <= V_THICKNESS / 2
}

function inCheck(x, y) {
  const cx = SIZE - CHECK_OFFSET
  const cy = CHECK_OFFSET
  return Math.hypot(x - cx, y - cy) <= CHECK_RADIUS
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4
    if (!insideRoundedRect(x, y)) {
      png.data[idx + 3] = 0
      continue
    }
    const color = inCheck(x, y) ? CHECK_COLOR : inV(x, y) ? V_COLOR : BG
    png.data[idx] = color[0]
    png.data[idx + 1] = color[1]
    png.data[idx + 2] = color[2]
    png.data[idx + 3] = 255
  }
}

const out = join(__dirname, '..', 'extension', 'media', 'vectalon-icon.png')
writeFileSync(out, PNG.sync.write(png))
console.log(`Wrote ${out} (${SIZE}×${SIZE})`)
