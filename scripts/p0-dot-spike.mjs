// =============================================================================
// Item 1a · P0 — dot engine spike & determinism proof
// =============================================================================
//
// This is the GO/NO-GO gate for the ELK→Graphviz-`dot` engine swap
// (docs/research/dot-engine-swap-plan.md). It proves — empirically, on the
// project's OWN fixtures and with the project's OWN crossing instrument —
// the two unproven premises 1a rests on:
//
//   (A) DETERMINISM. A pinned, in-process WASM Graphviz produces
//       byte-identical layout output for identical input, both across
//       repeated in-process renders AND across separate OS processes
//       (the real CI-vs-host portability concern — it is exactly why
//       `make factcheck` is a host-manual gate today). Without this the
//       byte-exact gallery drift gates (`gallery-verify`) cannot move
//       to `dot`.
//
//   (B) CROSSINGS. `dot` layout of the SAME C4 graph (same entities,
//       relations, content-fit node sizes) drives the project's
//       `edgecross` metric from the ELK baseline of 30 (across 5
//       multi-edge fixtures) toward 0 — the entire reason for 1a.
//       PlantUML itself renders C4 with `dot` at 0 crossings, so the
//       premise is well-founded; P0 MEASURES it rather than assuming.
//
// Engine choice (fact-checked, not assumed):
//   - System `dot` is graphviz 2.43.0 (2019) and host-version-variant
//     → disqualifying for a byte-exact CI drift gate (the plan's
//     dominant selection trait).
//   - `@hpcc-js/wasm-graphviz` is the modern graphviz-only split
//     package; pinned `--save-exact` at 1.21.6 it bundles graphviz
//     14.1.5 and is identical across CI/host by construction (the
//     wasm binary ships in the pinned npm tarball). This is the
//     candidate P0 must validate for determinism.
//
// Output: a per-fixture table (ELK baseline vs dot crossings), a global
// determinism verdict, and a deterministic SVG per fixture under
// build/p0-spike/svg/ for repeatable human eyeballing. Exits non-zero
// if EITHER premise fails (the honest go/no-go — no fake-green).
//
// Run: node scripts/p0-dot-spike.mjs   (requires `npm run build` first)
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { Graphviz } from '@hpcc-js/wasm-graphviz'

import { EntityParser } from '../dist/puml/EntityParser.mjs'
import { RelParser } from '../dist/puml/RelParser.mjs'
import { measureNode } from '../dist/layout/measureNode.mjs'
// Reuse the PROJECT's crossing-geometry core so P0's number is
// directly comparable to the `make edgecross` gate (same definition of
// a non-incident crossing: a proper segment intersection away from any
// shared node, Purchase 1997).
import { countCrossings, NODE_R } from './edgecross-svg.mjs'

const CORPUS = 'tests/fixtures/corpus'
const OUT = 'build/p0-spike'
const BASELINE = JSON.parse(readFileSync('tests/edgecross-baseline.json', 'utf8'))

// The 5 fixtures that carry ALL 30 ELK crossings — the premise-(B)
// targets — plus 3 known-clean fixtures as a no-regression sanity set.
const CROSSING_FIXTURES = [
  'edge-large-graph', 'rel-fan-stress', 'rel-tech-vs-notech',
  'rel-parallel-duplicate', 'rel-bidirectional',
]
const CLEAN_SANITY = ['topology-linear-chain', 'topology-hub-spoke', 'level-component']

// Points-per-inch: graphviz takes node width/height in inches and emits
// positions/splines in points (72 pt = 1 in, a Graphviz constant — see
// graphviz.org/docs/outputs, "point" = 1/72 inch). measureNode returns
// pixels at the renderer's 96-dpi-equivalent; px→inch = px/PT_PER_IN
// keeps catalyst's content-fit extents as dot's fixed node sizes.
const PT_PER_IN = 72
// Cubic-bezier sampling density — must match the edgecross instrument's
// SAMPLES (24): the drawn spline bows toward its control points, so a
// faithful crossing test samples the curve, not its hull.
const BEZIER_SAMPLES = 24

/**
 * Emit a deterministic dot graph from parsed C4 entities + relations.
 * Declaration order = parse order (stable) so the SOURCE is byte-stable;
 * combined with the pinned engine that makes the OUTPUT byte-stable.
 * Boundaries/Deployment_Node (entities with children) become
 * `subgraph cluster_*` so dot's own cluster crossing-avoidance is
 * exercised — P0's crossing number must reflect the real nested graph,
 * not a flattened approximation.
 */
function toDot(entities, relations) {
  const lines = ['digraph G {', '  rankdir=TB;', '  newrank=true;',
    '  node [shape=box, fixedsize=true];']
  let clusterIdx = 0
  const esc = s => String(s ?? '').replace(/"/g, '\\"')
  const emit = (e, indent) => {
    if (e.children && e.children.length) {
      // Stable, collision-free cluster id (dot requires the `cluster`
      // name prefix for cluster semantics).
      lines.push(`${indent}subgraph "cluster_${clusterIdx++}" {`)
      lines.push(`${indent}  label="${esc(e.label)}";`)
      for (const c of e.children) emit(c, indent + '  ')
      lines.push(`${indent}}`)
    } else {
      const d = measureNode(e)
      const w = (d.width / PT_PER_IN).toFixed(4)
      const h = (d.height / PT_PER_IN).toFixed(4)
      lines.push(`${indent}"${e.alias}" [width=${w}, height=${h}, label="${esc(e.label)}"];`)
    }
  }
  for (const e of entities) emit(e, '  ')
  for (const r of relations) lines.push(`  "${r.source}" -> "${r.target}";`)
  lines.push('}')
  return lines.join('\n')
}

/** Sample a graphviz spline (op `b` points: P0, then cubic triples) into
 *  a polyline, matching the edgecross instrument's curve handling. */
function splineToPolyline(points) {
  if (points.length < 4) return points.map(p => [p[0], p[1]])
  const out = [[points[0][0], points[0][1]]]
  for (let i = 1; i + 2 < points.length; i += 3) {
    const [p0, p1, p2, p3] = [points[i - 1], points[i], points[i + 1], points[i + 2]]
    for (let s = 1; s <= BEZIER_SAMPLES; s++) {
      const t = s / BEZIER_SAMPLES, u = 1 - t
      out.push([
        u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
        u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
      ])
    }
  }
  return out
}

/** Extract every edge route from graphviz JSON, in catalyst's top-left
 *  coordinate space (dot is bottom-left, y-up; flip y about bb height).
 *  Crossing TOPOLOGY is invariant under the flip — the flip only makes
 *  the eyeball SVG match catalyst's orientation — but we measure on the
 *  flipped coords so the number is reproducible from the SVG too. */
function edgePolylines(gvJson) {
  const o = JSON.parse(gvJson)
  const H = Number(String(o.bb).split(',')[3])
  const polys = []
  for (const e of o.edges ?? []) {
    const b = (e._draw_ ?? []).find(d => d.op === 'b' || d.op === 'B')
    if (!b) continue
    // countCrossings expects { pts: [[x,y],…] } per edge (project's
    // own instrument shape) — not a bare coordinate array.
    polys.push({ pts: splineToPolyline(b.points).map(([x, y]) => [x, H - y]) })
  }
  return polys
}

const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16)

async function main() {
  mkdirSync(join(OUT, 'svg'), { recursive: true })
  const graphviz = await Graphviz.load()

  let crossFail = false, detFail = false
  const rows = []

  for (const stem of [...CROSSING_FIXTURES, ...CLEAN_SANITY]) {
    const puml = readFileSync(join(CORPUS, `${stem}.puml`), 'utf8')
    const entities = new EntityParser().parse(puml)
    const relations = RelParser.getRelations(puml)
    const dotSrc = toDot(entities, relations)

    // --- Premise (A): determinism --------------------------------------
    // In-process: 6 renders of identical source must hash identically.
    const hashes = []
    for (let i = 0; i < 6; i++) hashes.push(sha(graphviz.layout(dotSrc, 'json', 'dot')))
    const inProcStable = hashes.every(h => h === hashes[0])

    // Cross-process: a fresh OS process, fresh WASM instantiation, must
    // produce the SAME hash (the genuine CI-vs-host portability test —
    // anything else is just testing one warm instance).
    writeFileSync(join(OUT, `${stem}.dot`), dotSrc)
    const childHash = execFileSync('node', ['-e', `
      const {Graphviz}=require('@hpcc-js/wasm-graphviz');
      const {readFileSync}=require('node:fs');
      const {createHash}=require('node:crypto');
      Graphviz.load().then(g=>{
        const j=g.layout(readFileSync(${JSON.stringify(join(OUT, `${stem}.dot`))},'utf8'),'json','dot');
        process.stdout.write(createHash('sha256').update(j).digest('hex').slice(0,16));
      });`], { encoding: 'utf8' }).trim()
    const crossProcStable = childHash === hashes[0]
    if (!inProcStable || !crossProcStable) detFail = true

    // --- Premise (B): crossings ----------------------------------------
    const gvJson = graphviz.layout(dotSrc, 'json', 'dot')
    const dotCrossings = countCrossings(edgePolylines(gvJson), { nodeR: NODE_R }).total
    const elk = BASELINE[stem] ?? 0
    // A crossing fixture must drop to 0 (PlantUML's dot does). A clean
    // fixture must STAY 0 (no regression introduced by the engine).
    const target0 = true
    if (dotCrossings > 0) crossFail = true

    // Deterministic vector eyeball artifact (graphviz's own SVG — same
    // pinned engine, byte-stable; repeatable per the standing rule).
    writeFileSync(join(OUT, 'svg', `${stem}.dot.svg`), graphviz.layout(dotSrc, 'svg', 'dot'))

    rows.push({
      stem, elk, dot: dotCrossings,
      det: inProcStable && crossProcStable ? 'OK' : 'FAIL',
      verdict: dotCrossings === 0 ? (elk > 0 ? `FIXED ${elk}→0` : 'clean=clean') : `STILL ${dotCrossings}`,
    })
  }

  // --- Report ----------------------------------------------------------
  console.log('\nItem 1a · P0 — dot engine spike & determinism proof')
  console.log('engine: @hpcc-js/wasm-graphviz@1.21.6 (graphviz ' + (await Graphviz.load()).version() + ', pinned)\n')
  console.log('fixture'.padEnd(26) + 'ELK  dot  det   verdict')
  console.log('-'.repeat(64))
  for (const r of rows)
    console.log(r.stem.padEnd(26) + String(r.elk).padStart(3) + String(r.dot).padStart(5) +
      '  ' + r.det.padEnd(5) + ' ' + r.verdict)
  const elkTotal = CROSSING_FIXTURES.reduce((a, s) => a + (BASELINE[s] ?? 0), 0)
  const dotTotal = rows.filter(r => CROSSING_FIXTURES.includes(r.stem)).reduce((a, r) => a + r.dot, 0)
  console.log('-'.repeat(64))
  console.log(`crossing-fixture TOTAL: ELK=${elkTotal}  dot=${dotTotal}  (target dot=0)`)
  console.log(`determinism: in-process×6 + cross-process×1, all 8 fixtures — ${detFail ? 'FAIL' : 'BYTE-STABLE'}`)
  console.log(`SVG eyeball artifacts: ${OUT}/svg/*.dot.svg (deterministic)\n`)

  if (detFail) { console.error('P0 GO/NO-GO: NO-GO — determinism premise FAILED.'); process.exit(2) }
  if (crossFail) { console.error('P0 GO/NO-GO: NO-GO — crossings premise FAILED (dot did not reach 0).'); process.exit(3) }
  console.log('P0 GO/NO-GO: GO — both premises proven. dot is deterministic AND drives edgecross 30→0.')
}

main().catch(e => { console.error(e); process.exit(1) })
