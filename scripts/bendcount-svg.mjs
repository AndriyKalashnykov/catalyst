// B1 measurement instrument — bends & continuity on draw.io's REAL
// rendered path (the lesson of #107: never measure emitted points;
// catalyst edges are orthogonalEdgeStyle so draw.io re-routes).
//
// Per edge in the drawio-export SVG: count interior vertices and the
// REDUNDANT ones — a vertex within `EPS` px of the straight segment
// between its two neighbours (a near-collinear bend that adds no
// routing information; collapsing it straightens the edge → Ware 2002
// continuity / Purchase 1997 bend-count, the B1 targets). This is the
// honest baseline inventory; the B1 fix must reduce `redundant` to ~0
// WITHOUT regressing `make arrowskew` (endpoints never moved).
//
// Usage: node scripts/bendcount-svg.mjs            (all gallery fixtures)
//        ARROWSKEW_REUSE=1 …                        (reuse build/arrowskew SVGs)
// Reuses the arrowskew render dir so one docker pass serves both gates.
import { readdirSync, existsSync, readFileSync, mkdirSync, cpSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, basename } from 'node:path'

const DRAWIO_DIR = 'docs/gallery/drawio'
const IMAGE = process.env.DRAWIO_EXPORT_IMAGE ?? 'rlespinasse/drawio-export:v4.51.0'
const WORK = 'build/arrowskew'                       // shared with the arrowskew gate
// Collinearity tolerance: draw.io quantises to 2 dp; 1.5px treats a
// sub-pixel jog as collinear without masking a real bend.
const EPS = 1.5

const argStems = process.argv.slice(2)

function edges(svg) {
  const paths = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((m) => m[1])
  return paths
    .filter((d) => !/Z/.test(d) && (d.match(/L/g) || []).length >= 1)
    .map((d) => {
      const n = [...d.matchAll(/(-?\d+\.?\d*)/g)].map((x) => +x[1])
      const p = []
      for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]])
      return p
    })
}

// distance of point b from the infinite line through a..c
function offChord(a, b, c) {
  const vx = c[0] - a[0], vy = c[1] - a[1]
  const len = Math.hypot(vx, vy)
  if (len < 1e-6) return Math.hypot(b[0] - a[0], b[1] - a[1])
  return Math.abs((b[0] - a[0]) * vy - (b[1] - a[1]) * vx) / len
}

function measure(svg) {
  let interior = 0, redundant = 0, edgeN = 0
  for (const e of edges(svg)) {
    if (e.length < 3) { edgeN++; continue }
    edgeN++
    for (let i = 1; i < e.length - 1; i++) {
      interior++
      if (offChord(e[i - 1], e[i], e[i + 1]) <= EPS) redundant++
    }
  }
  return { edgeN, interior, redundant }
}

function render(stem) {
  const d = join(WORK, stem)
  if (process.env.ARROWSKEW_REUSE === '1') {
    const exp = join(d, 'export')
    const f = existsSync(exp) ? readdirSync(exp).find((x) => x.endsWith('.svg')) : null
    return f ? readFileSync(join(exp, f), 'utf8') : null
  }
  mkdirSync(d, { recursive: true })
  cpSync(join(DRAWIO_DIR, `${stem}.drawio`), join(d, 'v.drawio'))
  execFileSync('docker', ['run', '--rm', '-v', `${process.cwd()}/${d}:/data`,
    IMAGE, '-f', 'svg', '/data/v.drawio'], { stdio: 'ignore', timeout: 180000 })
  const exp = join(d, 'export')
  const f = existsSync(exp) ? readdirSync(exp).find((x) => x.endsWith('.svg')) : null
  return f ? readFileSync(join(exp, f), 'utf8') : null
}

const stems = (argStems.length ? argStems
  : readdirSync(DRAWIO_DIR).filter((x) => x.endsWith('.drawio')).map((x) => basename(x, '.drawio'))
).sort()

let tRed = 0, tInt = 0
for (const stem of stems) {
  const svg = render(stem)
  if (!svg) { console.log(`${stem.padEnd(28)} NO SVG`); continue }
  const m = measure(svg)
  tRed += m.redundant; tInt += m.interior
  console.log(`${stem.padEnd(28)} edges=${m.edgeN} interiorBends=${m.interior} redundant=${m.redundant}`)
}
console.log(`\nTOTAL redundant=${tRed} / interiorBends=${tInt} (B1 target: redundant → ~0, arrowskew unchanged)`)
