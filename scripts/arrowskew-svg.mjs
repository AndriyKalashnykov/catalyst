// arrowSkew gate — rebuilt to measure draw.io's ACTUAL rendered path.
//
// The reverted #107 scored a reconstruction of EMITTED waypoints; but
// every catalyst edge is `edgeStyle=orthogonalEdgeStyle`, so draw.io
// re-routes and the emitted polyline is NOT what is drawn (proven: a
// render no-op passed that gate — see
// `docs/research/arrowhead-orthogonal-routing.md` + memory
// `factcheck-harness-gate`). This gate renders every committed
// `.drawio` via drawio-export to SVG and parses draw.io's real path.
//
// Contract per arrowhead (draw.io draws each edge as an open
// multi-segment `<path>` immediately followed by its filled triangular
// `<path … Z>` head): (1) the edge's terminal segment is collinear
// with the arrowhead axis (shaft enters the head's BASE head-on, not
// its side); (2) no earlier edge segment intersects the arrowhead's
// bbox (the orthogonal-feeder occlusion that reads as a skewed head).
// A fixture is CLEAN only when every arrowhead passes both.
//
// Usage:
//   node scripts/arrowskew-svg.mjs            # render+measure all gallery .drawio
//   node scripts/arrowskew-svg.mjs <stem>...  # subset
// Needs docker (drawio-export). Deterministic: same .drawio ⇒ same SVG.
import { readdirSync, existsSync, readFileSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, basename } from 'node:path'

const DRAWIO_DIR = 'docs/gallery/drawio'
const IMAGE = process.env.DRAWIO_EXPORT_IMAGE ?? 'rlespinasse/drawio-export:v4.51.0'
const WORK = process.env.ARROWSKEW_WORK ?? 'build/arrowskew'
// Shaft-vs-axis angular tolerance (deg). draw.io quantises path coords
// to 2 dp; 6° absorbs that on a short terminal stub without admitting a
// real diagonal (the skew defect is ≫ 30°).
const ANGLE_TOL_DEG = 6

const argStems = process.argv.slice(2)

function parseSvg(svg) {
  const paths = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((m) => m[1])
  const pts = (d) => {
    const n = [...d.matchAll(/(-?\d+\.?\d*)/g)].map((x) => +x[1])
    const p = []
    for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]])
    return p
  }
  const edges = paths.filter((d) => !/Z/.test(d) && (d.match(/L/g) || []).length >= 1).map(pts)
  const tris = paths.filter((d) => /Z\s*$/.test(d.trim()) && (d.match(/L/g) || []).length === 2)
    .map((d) => pts(d).slice(0, 3))
  const out = []
  for (const tri of tris) {
    const { apex, baseMid, base } = headAxis(tri)
    // Pair the head with the edge ENDPOINT (start OR end of an open
    // path) nearest its base midpoint — drawio draws the head AT the
    // edge endpoint. This is correct for bidirectional edges (a head
    // at BOTH ends) and for interleaved laned fans, where "nearest
    // preceding path" mis-pairs. The incident segment is the edge's
    // segment touching that endpoint.
    let best = null
    for (const e of edges) {
      if (e.length < 2) continue
      for (const [endIdx, seg] of [[0, [e[0], e[1]]], [e.length - 1, [e[e.length - 1], e[e.length - 2]]]]) {
        const ep = e[endIdx]
        const dd = Math.hypot(ep[0] - baseMid[0], ep[1] - baseMid[1])
        if (!best || dd < best.dd) best = { dd, edge: e, incident: seg }
      }
    }
    if (best && best.dd <= 8) out.push({ tri, apex, baseMid, base, edge: best.edge, incident: best.incident })
  }
  return out
}

// arrowhead triangle → { apex, baseMid }. The drawio blockThin head is
// isosceles: the apex (tip, into the target) is the vertex farthest
// from the midpoint of the other two; the base is those two.
function headAxis(tri) {
  let best = -1, apex = 0
  for (let k = 0; k < 3; k++) {
    const o = [0, 1, 2].filter((x) => x !== k)
    const mid = [(tri[o[0]][0] + tri[o[1]][0]) / 2, (tri[o[0]][1] + tri[o[1]][1]) / 2]
    const dd = Math.hypot(tri[k][0] - mid[0], tri[k][1] - mid[1])
    if (dd > best) { best = dd; apex = k }
  }
  const o = [0, 1, 2].filter((x) => x !== apex)
  const baseMid = [(tri[o[0]][0] + tri[o[1]][0]) / 2, (tri[o[0]][1] + tri[o[1]][1]) / 2]
  return { apex: tri[apex], baseMid, base: [tri[o[0]], tri[o[1]]] }
}

function analyseFixture(stem, svg) {
  const pairs = parseSvg(svg)
  const bad = []
  for (const { tri, apex, baseMid, incident, edge } of pairs) {
    // The shaft (segment incident to the head's endpoint) must be
    // COLLINEAR with the head axis (the line through baseMid↔apex).
    // Collinearity is orientation-agnostic: a terminal arrowhead points
    // INTO the box while the shaft travels the other way, so a clean
    // head is angle≈0 OR ≈180 — `min(angle,180−angle)`. The skew defect
    // is the shaft entering the head's SIDE ⇒ that quantity is large
    // (≈90). Antiparallel (180) is clean, NOT a violation.
    const [p, q] = incident
    const sdx = q[0] - p[0], sdy = q[1] - p[1]
    const adx = apex[0] - baseMid[0], ady = apex[1] - baseMid[1]
    const sl = Math.hypot(sdx, sdy) || 1, al = Math.hypot(adx, ady) || 1
    const cos = (sdx * adx + sdy * ady) / (sl * al)
    const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI
    const offAxis = Math.min(angle, 180 - angle)        // 0 = perfectly collinear
    // occlusion: any NON-incident edge segment crossing the head bbox
    const hx = tri.map((t) => t[0]), hy = tri.map((t) => t[1])
    const bb = { x0: Math.min(...hx), x1: Math.max(...hx), y0: Math.min(...hy), y1: Math.max(...hy) }
    let occl = false
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i], b = edge[i + 1]
      const isIncident = (a === incident[0] && b === incident[1]) || (a === incident[1] && b === incident[0])
      if (isIncident) continue
      if (Math.min(a[0], b[0]) <= bb.x1 && Math.max(a[0], b[0]) >= bb.x0 &&
          Math.min(a[1], b[1]) <= bb.y1 && Math.max(a[1], b[1]) >= bb.y0) { occl = true; break }
    }
    if (offAxis > ANGLE_TOL_DEG || occl) bad.push({ offAxis: +offAxis.toFixed(1), occl })
  }
  return { stem, total: pairs.length, bad: bad.length, clean: bad.length === 0, detail: bad }
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

// drawio-export runs as root in docker and owns the `export/` dirs it
// writes — a plain rmSync can't clear them. Clean via the image (root)
// before rendering, the same pattern gallery.mjs uses. Skipped in
// REUSE mode (measuring already-rendered SVGs).
if (process.env.ARROWSKEW_REUSE !== '1') {
  try {
    execFileSync('docker', ['run', '--rm', '-v', `${process.cwd()}/${WORK.split('/')[0]}:/b`,
      '--entrypoint', '/bin/sh', IMAGE, '-c', `rm -rf /b/${WORK.split('/').slice(1).join('/')}`],
      { stdio: 'ignore', timeout: 60000 })
  } catch { /* nothing to clean */ }
}
mkdirSync(WORK, { recursive: true })
let cleanN = 0
const results = []
for (const stem of stems) {
  const svg = render(stem)
  if (!svg) { console.log(`${stem.padEnd(28)} NO SVG`); results.push({ stem, clean: false }); continue }
  const r = analyseFixture(stem, svg)
  results.push(r)
  if (r.clean) cleanN++
  const tag = r.clean ? 'clean' : `SKEW ${r.bad}/${r.total}`
  console.log(`${stem.padEnd(28)} ${tag}` +
    (r.clean ? '' : ' :: ' + r.detail.map((b) => `offAxis=${b.offAxis}${b.occl ? '+occl' : ''}`).join(' ')))
}
console.log(`\narrowSkew (real drawio render): CLEAN ${cleanN}/${stems.length}`)
process.exitCode = cleanN === stems.length ? 0 : 1
