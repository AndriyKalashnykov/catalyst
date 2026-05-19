// edgeCross measurement instrument — NON-INCIDENT edge crossings on
// draw.io's REAL rendered path (the #107 lesson: never measure emitted
// points; draw.io re-routes — `curved:1` quadratic beziers — so the
// emitted polyline is never what is drawn; this parses the rendered
// drawio-export SVG, the committed gallery render-truth).
//
// Edge crossings are THE primary graph-drawing readability aesthetic
// (Purchase 1997). Two edges that meet AT a shared node are legitimate
// incidence — NOT a crossing defect; only an intersection AWAY from a
// shared endpoint is the defect (the rel-bidirectional a→b × c→a
// crossing ~21px below node `a`). PlantUML's `dot` orders ports around
// each node so incident edges fan monotonically and never cross; this
// instrument quantifies catalyst's gap against that.
//
// Pure geometry core is exported for RED unit testing
// (tests/edgecross-svg.test.mts) per the every-gate-proven-red
// discipline; the file-reading CLI runs only when invoked as a script.
//
// Usage: node scripts/edgecross-svg.mjs              (all gallery pairs)
//        node scripts/edgecross-svg.mjs <stem> …     (specific fixtures)
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { drawioEdges, pumlEdges, parsePathD } from './route-fidelity.mjs'

// Committed render-truth (drawio-export output, the gallery drift-gate
// artifact) — deterministic, no docker, CI-portable.
const SVG_DIR = process.env.EDGECROSS_SVG_DIR ?? 'docs/gallery/svg'

// Bezier sampling density for crossing geometry — the drawn `curved:1`
// shaft bows toward its control point, so the curve must be sampled
// (not reduced to on-curve waypoints) for a faithful intersection test.
// 24 segments/curve: sub-pixel chord error at gallery scale.
const SAMPLES = 24

// Two edge endpoints closer than SHARE_TOL render as the SAME node
// attach ⇒ the two edges are INCIDENT (share a node). Documented
// CONVENTION (category-3, no-magic taxonomy): neither PlantUML nor
// draw.io defines an "is-the-same-attach" radius — this is the visual
// threshold below which two arrow ends read as one attach point.
// = REL_ARROW_SIZE (theme SHAPE.REL_ARROW_SIZE = 14): two ends within
// one arrow-head are the same node-attach by construction.
export const SHARE_TOL = 14

// A crossing within NODE_R of a genuine shared node is the legitimate
// incident-edge convergence fan, NOT a defect. Documented CONVENTION
// (category-3): = 2·REL_ARROW_SIZE (28), the same cited rationale as
// factcheck `ATTACH_SEP_MIN` (two arrow-heads cannot visually touch
// within 28px, so a crossing inside that radius of the shared node is
// masked by the converging heads themselves). Outside it, the crossing
// is a visible defect.
export const NODE_R = 28

const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Proper segment intersection (strict orientation signs — collinear
 *  overlap and touching-at-an-endpoint do NOT count). Returns the
 *  intersection point or null. */
export function properIntersection(p, q, r, s) {
  const o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const d1 = o(r, s, p), d2 = o(r, s, q), d3 = o(p, q, r), d4 = o(p, q, s)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const t = d1 / (d1 - d2)
    return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]
  }
  return null
}

/** The shared node of two polylines, if any: a point that is an
 *  endpoint of BOTH (within SHARE_TOL). Returns the midpoint of the two
 *  near endpoints, or null when the edges are not incident. */
export function sharedNode(A, B, tol = SHARE_TOL) {
  const ea = [A[0], A[A.length - 1]], eb = [B[0], B[B.length - 1]]
  let best = null, bd = tol
  for (const x of ea) for (const y of eb) {
    const d = D(x, y)
    if (d <= bd) { bd = d; best = [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2] }
  }
  return best
}

/** Non-incident crossings between two polylines: proper intersections,
 *  EXCLUDING any within `nodeR` of a node the two edges share (incident
 *  convergence is legitimate, not a crossing defect). */
export function polylineCrossings(A, B, { nodeR = NODE_R, shareTol = SHARE_TOL } = {}) {
  const sn = sharedNode(A, B, shareTol)
  const pts = []
  for (let i = 0; i < A.length - 1; i++)
    for (let j = 0; j < B.length - 1; j++) {
      const x = properIntersection(A[i], A[i + 1], B[j], B[j + 1])
      if (!x) continue
      if (sn && D(x, sn) <= nodeR) continue          // incident fan — legit
      pts.push([+x[0].toFixed(1), +x[1].toFixed(1)])
    }
  return { count: pts.length, points: pts }
}

/**
 * Per-fixture REGRESSION ratchet (mirrors factcheck-ratio's
 * fidelity-monotone ratchet). The crossing CONTRACT is 0 (Purchase
 * 1997) and is honestly RED today (30 across 5 multi-edge fixtures —
 * the global-routing/port-ordering defect re-scoped to CLAUDE.md
 * item 1, ELK→dot). It is NOT downgraded to advisory (that would be
 * the cardinal fake-green); instead a committed per-fixture baseline
 * lets routing-adjacent changes be gated on "may only improve or
 * hold, never regress" — this is what would have caught the disproven
 * in-place fix (rel-bidirectional 1→2, fan-stress 6→11). A fixture
 * absent from the baseline must be 0 (new fixtures may not introduce
 * crossings). Returns {regressed:0|1, delta}.
 */
export function edgecrossRatchet(baseline, stem, count) {
  const base = Object.prototype.hasOwnProperty.call(baseline ?? {}, stem)
    ? baseline[stem] : 0
  return { regressed: count > base ? 1 : 0, delta: count - base }
}

/** Total non-incident crossings over a set of polylines (pairwise). */
export function countCrossings(polys, opts) {
  let total = 0
  const detail = []
  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++) {
      const c = polylineCrossings(polys[i].pts, polys[j].pts, opts)
      if (c.count) { total += c.count; detail.push({ i, j, ...c }) }
    }
  return { total, detail }
}

/** Rendered edge polylines from an SVG (drawio-export or PlantUML). */
export function edgePolys(svg, kind) {
  const es = (kind === 'puml' ? pumlEdges : drawioEdges)(svg)
  return es.map((e) => ({ id: e.id, pts: parsePathD(e.d, SAMPLES).flat() }))
    .filter((p) => p.pts.length >= 2)
}

const { pathToFileURL } = await import('node:url')
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href

if (isMain) {
  const args = process.argv.slice(2)
  const all = existsSync(SVG_DIR)
    ? [...new Set(readdirSync(SVG_DIR)
        .filter((f) => f.endsWith('.drawio.svg'))
        .map((f) => basename(f, '.drawio.svg')))].sort()
    : []
  const stems = args.length ? args : all
  const BASE_FILE = 'tests/edgecross-baseline.json'
  const baseline = existsSync(BASE_FILE)
    ? JSON.parse(readFileSync(BASE_FILE, 'utf8')) : {}
  let tCat = 0, tPuml = 0, bad = 0, regressions = 0
  console.log(`${'fixture'.padEnd(26)} catalyst  PlantUML  base  Δ   (non-incident crossings)`)
  for (const stem of stems) {
    const dF = join(SVG_DIR, `${stem}.drawio.svg`)
    const pF = join(SVG_DIR, `${stem}.puml.svg`)
    if (!existsSync(dF)) { console.log(`${stem.padEnd(26)} NO drawio.svg`); continue }
    const cat = countCrossings(edgePolys(readFileSync(dF, 'utf8'), 'drawio'))
    const pum = existsSync(pF)
      ? countCrossings(edgePolys(readFileSync(pF, 'utf8'), 'puml')) : { total: -1 }
    const rr = edgecrossRatchet(baseline, stem, cat.total)
    tCat += cat.total; if (pum.total >= 0) tPuml += pum.total
    if (cat.total > 0) bad++
    if (rr.regressed) regressions++
    const flag = rr.regressed ? '  ◀ REGRESSION' : (cat.total > 0 ? '  ◀ known (deferred)' : '')
    console.log(`${stem.padEnd(26)} ${String(cat.total).padStart(6)}  ${String(pum.total).padStart(8)}  ${String(baseline[stem] ?? 0).padStart(4)}  ${(rr.delta > 0 ? '+' : '') + rr.delta}${flag}`)
  }
  console.log(`\nTOTAL catalyst=${tCat}  PlantUML=${tPuml}  fixtures-with-crossings=${bad}/${stems.length}  regressions=${regressions}`)
  console.log('CONTRACT (honestly RED, deferred to CLAUDE.md item 1 / ELK→dot): non-incident crossings = 0 (Purchase 1997).')
  console.log('GATE: ratchet — may only improve or hold vs tests/edgecross-baseline.json; a REGRESSION fails this gate.')
  // The gate fails on a REGRESSION beyond the committed baseline (the
  // 30→40 class the disproven in-place fix would have shipped). It does
  // NOT fail merely for the known-deferred 30 (that is not a
  // contract-downgrade: the contract stays RED and documented; the
  // ratchet is the regression guard, same pattern as factcheck-ratio).
  process.exitCode = regressions > 0 ? 1 : 0
}
