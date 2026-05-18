// B1 measurement instrument — bends & continuity on draw.io's REAL
// rendered path (the lesson of #107: never measure emitted points;
// draw.io re-routes — pre-ADR-0013 as orthogonal Manhattan, now as
// `curved:1` quadratic-bezier splines — so the emitted polyline is
// never what is drawn; this parses the rendered SVG path).
//
// Per edge in the drawio-export SVG: count interior on-curve waypoints
// and the REDUNDANT ones — a waypoint within `EPS` px of the segment
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

// Extract the ON-CURVE waypoint polyline from an SVG path `d`.
// ADR 0013 made every catalyst edge `curved:1` ⇒ draw.io emits the
// shaft as `M a Q c1 p1 Q c2 p2 …` (quadratic bezier); the pre-0013
// orthogonal era was `M a L p1 L p2 …`. Control points (the `c*` in Q/C)
// are OFF-curve and are NOT bends — only the segment endpoints are the
// waypoints the route passes through. Parsing every number in pairs
// (the old impl) both miscounted curved routes as control-point "bends"
// AND, via the `L`-only filter, excluded curved shafts entirely
// (edges=0 on the whole corpus — a silent no-op instrument). This
// tokenises M/L/Q/C and keeps only on-curve points, so the redundant-
// bend metric is correct for orthogonal, straight AND curved routes.
function onCurvePoints(d) {
  const toks = d.match(/[MLQCmlqc]|-?\d+\.?\d*/g) || []
  const pts = []
  let i = 0
  while (i < toks.length) {
    const c = toks[i++]
    if (c === 'M' || c === 'L' || c === 'm' || c === 'l') {
      pts.push([+toks[i++], +toks[i++]])
    } else if (c === 'Q' || c === 'q') {
      i += 2                                   // skip 1 control point
      pts.push([+toks[i++], +toks[i++]])       // keep the endpoint
    } else if (c === 'C' || c === 'c') {
      i += 4                                   // skip 2 control points
      pts.push([+toks[i++], +toks[i++]])       // keep the endpoint
    } else {
      i++                                      // unknown token — skip
    }
  }
  return pts
}

function edges(svg) {
  const paths = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((m) => m[1])
  // Edge shaft = an open path (no `Z`; node rects/arrowheads are closed)
  // with ≥1 draw command after the initial M.
  return paths
    .filter((d) => !/[Zz]/.test(d) && /[LQC]/.test(d))
    .map(onCurvePoints)
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

// Pure path-geometry core is exported for unit testing (the convention
// of route-fidelity.mjs / factcheck-geometry.mjs); the docker render
// loop only runs when invoked as a script.
export { onCurvePoints, offChord, measure, edges }

const { pathToFileURL } = await import('node:url')
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href

if (isMain) {
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
}
